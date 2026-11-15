import { createEffectPublisher } from "../../effects/publish";
import {
  createEffectRenderer,
  type EffectFrame,
  type EffectDrawContext,
} from "../../effects/render";
import type { EffectTextureSource } from "../../effects/textures";
import { depthPrimitiveEffectState } from "../../effects/renderState";
import type { PrimitiveDraw } from "../../effects/eval/draw";
import { primitivePass } from "../../effects/passes";
import type { PrimitivePacket } from "../../effects/instance";
import { liveNodes, type StageNode, type StageScene } from "../runtime";
import { nthElement, type TextureElement } from "../elements";
import {
  BLANK_TEXTURE,
  stageSolid,
  stageSolidLive,
  stageTextureBinding,
  stageSimpleMaterial,
  type StageNormalPrimitive,
} from "../nodes/primitive3d";
import { lightingForGroup, stageLightScope, type StageLighting } from "../nodes/lights";
import { stageDrawKey, stageNodeLayer } from "../order";
import type { StagePack } from "../pack";
import { stageRibbon, stageRibbonLive } from "../nodes/ribbon";
import { stageRibbon102, stageRibbon102Live } from "../nodes/ribbon102";
import type { StageParticleFrame } from "./stageParticles";
import type { StageDrawCamera } from "../camera/scopes";
import { stageGroupShadow } from "./stageShadowFrame";
import { stageEffectFrame } from "./stageEffectFrame";

const ROLES = ["base", "field"] as const;

/** The camera a draw is placed with: row-major matrices with the translation in the fourth column. */
export interface StagePrimitive3dCamera {
  readonly view: ArrayLike<number>;
  readonly projection: ArrayLike<number>;
  readonly viewProjection: ArrayLike<number>;
  readonly position: ArrayLike<number>;
}

export interface StagePrimitive3dFrame {
  readonly scene: StageScene;
  readonly role: (typeof ROLES)[number];
  readonly camera: StagePrimitive3dCamera;
  readonly cameraScopes?: ReadonlyMap<StageNode, StageDrawCamera>;
  readonly lighting: StageLighting;
  readonly mirror?: unknown;
  readonly shadows?: StageParticleFrame["shadows"];
}

/** One prepared draw, ordered with the scene's other draws by pass, key and depth. */
export interface StagePrimitive3dEntry {
  readonly node: StageNode;
  readonly requiresDepthSnapshot: boolean;
  readonly requiresColorSnapshot: boolean;
  readonly pass: number;
  readonly key: number;
  readonly depth: number;
  draw(context?: EffectDrawContext): number;
}

export interface StagePrimitives3d {
  /** Prepares the frame's 3D primitive draws; nodes that cannot be drawn are listed in `skipped` with the reason. */
  prepare(
    frame: StagePrimitive3dFrame,
    viewport: { readonly width: number; readonly height: number },
    skipped: Map<string, string>,
    nodes?: readonly StageNode[],
  ): readonly StagePrimitive3dEntry[];
  dispose(): void;
}

function cameraError(camera: StagePrimitive3dCamera): string | null {
  for (const matrix of [camera.view, camera.projection, camera.viewProjection])
    for (let i = 0; i < 16; i++)
      if (!Number.isFinite(matrix[i])) return "camera matrices are not finite";
  return null;
}

/** Draws the 3D primitive nodes of stage scene files with the simple-material shader and states the hit effects use. */
export function createStagePrimitives3d(
  gl: WebGL2RenderingContext,
  pack: StagePack,
  textures: ReadonlyMap<string, WebGLTexture>,
): StagePrimitives3d {
  const source: EffectTextureSource = {
    texture(resourceId, resourceIndex) {
      const id = pack.texture(ROLES[resourceId], resourceIndex);
      return id === null ? null : (textures.get(id) ?? null);
    },
  };
  let renderer: ReturnType<typeof createEffectRenderer> | null = null;
  const publisher = createEffectPublisher({ maximumParticles: 1 });
  const sortPosition = new Float32Array(3);
  const packet: PrimitivePacket = {
    instanceId: 0,
    resourceId: 0,
    draw: null as unknown as PrimitiveDraw,
    worldMatrix: new Float32Array(16),
    vertices: new Float32Array(0),
    textureOffsets: new Float32Array(6),
    secondaryUv: new Float32Array(12),
    bindings: [],
    bindingCount: 1,
    layer: 0,
    priority: 0,
    orderKey: 0,
  };

  return {
    prepare(frame, viewport, skipped, nodes = liveNodes(frame.scene)) {
      publisher.reset();
      const error = cameraError(frame.camera);
      if (error) {
        skipped.set("primitives3d", error);
        return [];
      }
      const roleIndex = ROLES.indexOf(frame.role);
      const frames = new Map<number, EffectFrame>();
      const effectFrameFor = (group: number, pass: number): EffectFrame => {
        const key = pass * 32 + group;
        let effect = frames.get(key);
        if (!effect) {
          effect = stageEffectFrame(frame.camera, viewport, {
            ...frame,
            shadow: stageGroupShadow(frame.shadows, group),
            fog: lightingForGroup(frame.lighting, group, pass).fog,
          });
          frames.set(key, effect);
        }
        return effect;
      };
      const drawNodes: StageNode[] = [];
      const lightGroups = new Map<number, ReturnType<typeof lightingForGroup>>();
      let published = 0;
      for (const node of nodes) {
        if (frame.cameraScopes && !frame.cameraScopes.has(node)) continue;
        const ribbon = stageRibbon(node) ?? stageRibbon102(node);
        const state = ribbon ?? stageSolid(node);
        if (
          !state ||
          (ribbon ? !(stageRibbonLive(node) || stageRibbon102Live(node)) : !stageSolidLive(node)) ||
          !state.draw
        )
          continue;
        const where = `solid@${node.record!.offset}`;
        const textureCount = ribbon
          ? node.elements.filter((element) => element?.type === 300).length
          : 1;
        packet.bindingCount = 0;
        packet.textureOffsets.fill(0);
        let missingTexture = false;
        for (let index = 0; index < textureCount; index++) {
          const binding = stageTextureBinding(node, index);
          if (!binding) {
            skipped.set(where, `primitive without a selected texture at slot ${index}`);
            missingTexture = true;
            break;
          }
          if (binding.resourceIndex === BLANK_TEXTURE) continue;
          if (pack.texture(frame.role, binding.resourceIndex) === null) {
            skipped.set(where, `texture resource ${binding.resourceIndex} is not an image`);
            missingTexture = true;
            break;
          }
          packet.bindings[packet.bindingCount++] = binding;
          const texture = nthElement<TextureElement>(node, 300, index)!;
          packet.textureOffsets[index * 2] = texture.offset[0];
          packet.textureOffsets[index * 2 + 1] = texture.offset[1];
        }
        if (missingTexture) continue;
        const world = ribbon ? ribbon.drawWorld : node.world;
        for (let i = 0; i < 16; i++)
          packet.worldMatrix[i] = world ? world[(i % 4) * 4 + Math.floor(i / 4)] : +(i % 5 === 0);
        if (ribbon) {
          sortPosition[0] = node.world[12];
          sortPosition[1] = node.world[13];
          sortPosition[2] = node.world[14];
          packet.sortPosition = sortPosition;
        } else packet.sortPosition = undefined;
        packet.instanceId = node.ordinal;
        packet.resourceId = roleIndex;
        packet.draw = {
          ...state.draw,
          material: stageSimpleMaterial(
            node,
            state.draw.material,
            state.draw.layout,
            packet.bindingCount,
          ),
        } as PrimitiveDraw;
        packet.shadow = !!stageGroupShadow(frame.shadows, stageLightScope(node).group);
        if ("normalVertices" in state) {
          packet.vertices = (state as StageNormalPrimitive).normalVertices;
        } else {
          packet.vertices = state.vertices;
        }
        packet.normalLights = undefined;
        packet.layer = stageNodeLayer(node);
        packet.priority = node.record!.priority;
        packet.orderKey = stageDrawKey(node);
        try {
          if ("normalVertices" in state) {
            const group = stageLightScope(node).group;
            const material = packet.draw.material;
            const pass = primitivePass(
              material.featureWord96,
              material.featureWord100,
              packet.orderKey,
            );
            const key = pass * 32 + group;
            let lights = lightGroups.get(key);
            if (!lights)
              lightGroups.set(key, (lights = lightingForGroup(frame.lighting, group, pass)));
            packet.normalLights = lights.parallel;
          }
          const flags = packet.draw.material.sourceFlags;
          packet.state = depthPrimitiveEffectState(flags);
          packet.frame = effectFrameFor(
            stageLightScope(node).group,
            primitivePass(
              packet.draw.material.featureWord96,
              packet.draw.material.featureWord100,
              packet.orderKey,
            ),
          );
          publisher.sink.primitive(packet);
          drawNodes.push(node);
          published++;
        } catch (cause) {
          if (!(cause instanceof RangeError)) throw cause;
          skipped.set(where, cause.message);
        }
      }
      if (published === 0) return [];
      renderer ??= createEffectRenderer(gl, source);
      return renderer.prepare(publisher.packets, effectFrameFor(0, 0)).map((entry, index) => ({
        node: drawNodes[index],
        requiresDepthSnapshot: entry.requiresDepthSnapshot,
        requiresColorSnapshot: entry.requiresColorSnapshot,
        pass: entry.pass,
        key: entry.key,
        depth: entry.depth,
        draw: (context) => entry.draw(context).draws,
      }));
    },
    dispose() {
      renderer?.dispose();
    },
  };
}
