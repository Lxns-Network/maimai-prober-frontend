import { createEffectPublisher } from "../../effects/publish";
import {
  createEffectRenderer,
  type EffectDrawContext,
  type EffectFrame,
} from "../../effects/render";
import type { EffectTextureSource } from "../../effects/textures";
import {
  DEFAULT_MAXIMUM_PARTICLES,
  PARTICLE_PARAMETER_COUNT,
  particleDrawRange,
  particleFrameParameters,
  particleRingIndex,
  type ParticleRange,
} from "../../effects/eval/particle";
import { depthParticleEffectState } from "../../effects/renderState";
import { liveNodes, type StageNode, type StageScene } from "../runtime";
import {
  PARTICLE_TYPE,
  stageParticle,
  stageParticleColor,
  stageParticleDrawable,
} from "../nodes/particle";
import { stageDrawKey, stageNodeLayer } from "../order";
import type { StagePack } from "../pack";
import { BLANK_TEXTURE } from "../nodes/primitive3d";
import { lightingForGroup, stageLightScope, type StageLighting } from "../nodes/lights";
import { particlePass } from "../../effects/passes";
import { stageGroupShadow, type StageShadowFrame } from "./stageShadowFrame";
import type { StageDrawCamera } from "../camera/scopes";
import { stageEffectFrame } from "./stageEffectFrame";

const ROLES = ["base", "field"] as const;

/** The camera a particle draw is placed with: row-major matrices with the translation in the fourth column. */
export interface StageParticleCamera {
  readonly view: ArrayLike<number>;
  readonly projection: ArrayLike<number>;
  readonly viewProjection: ArrayLike<number>;
  readonly position: ArrayLike<number>;
}

export interface StageParticleFrame {
  readonly scene: StageScene;
  readonly role: (typeof ROLES)[number];
  readonly camera: StageParticleCamera;
  readonly cameraScopes?: ReadonlyMap<StageNode, StageDrawCamera>;
  readonly mirror?: unknown;
  readonly shadows?: readonly StageShadowFrame[];
  readonly lighting?: StageLighting;
}

/** One prepared particle draw, ordered with the scene's other draws by pass, key and depth. */
export interface StageParticleEntry {
  readonly node: StageNode;
  readonly pass: number;
  readonly key: number;
  readonly depth: number;
  readonly requiresDepthSnapshot: boolean;
  readonly requiresColorSnapshot: boolean;
  draw(context?: EffectDrawContext): number;
}

export interface StageParticles {
  /** Prepares the frame's particle draws; nodes that cannot be drawn are listed in `skipped` with the reason. */
  prepare(
    frame: StageParticleFrame,
    viewport: { readonly width: number; readonly height: number },
    skipped: Map<string, string>,
    nodes?: readonly StageNode[],
  ): readonly StageParticleEntry[];
  dispose(): void;
}

export interface StageParticleOptions {
  /** The particle capacity draws are sliced against. */
  readonly maximumParticles?: number;
}

/** Why particles cannot be placed with this camera, or null when its matrices are finite. */
export function particleCameraError(camera: StageParticleCamera): string | null {
  for (const matrix of [camera.view, camera.projection, camera.viewProjection])
    for (let i = 0; i < 16; i++)
      if (!Number.isFinite(matrix[i])) return "camera matrices are not finite";
  return null;
}

/** Draws the particle nodes of stage scene files with the particle shader and states the hit effects use. */
export function createStageParticles(
  gl: WebGL2RenderingContext,
  pack: StagePack,
  textures: ReadonlyMap<string, WebGLTexture>,
  options: StageParticleOptions = {},
): StageParticles {
  const maximumParticles = options.maximumParticles ?? DEFAULT_MAXIMUM_PARTICLES;
  let blank: WebGLTexture | null = null;
  const source: EffectTextureSource = {
    texture(resourceId, resourceIndex) {
      if (resourceIndex === BLANK_TEXTURE) {
        if (!blank) {
          blank = gl.createTexture()!;
          gl.bindTexture(gl.TEXTURE_2D, blank);
          gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 1, 1);
          gl.texSubImage2D(
            gl.TEXTURE_2D,
            0,
            0,
            0,
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            Uint8Array.of(255, 255, 255, 255),
          );
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 0);
        }
        return blank;
      }
      const id = pack.texture(ROLES[resourceId], resourceIndex);
      return id === null ? null : (textures.get(id) ?? null);
    },
  };
  let renderer: ReturnType<typeof createEffectRenderer> | null = null;
  const publisher = createEffectPublisher({ maximumParticles });
  const range: ParticleRange = { small: false, start: 0, count: 0, shaderTime: 0 };
  const worldMatrix = new Float32Array(16);
  const parameters = new Float32Array(PARTICLE_PARAMETER_COUNT);

  return {
    prepare(frame, viewport, skipped, nodes = liveNodes(frame.scene)) {
      publisher.reset();
      const cameraError = particleCameraError(frame.camera);
      if (cameraError) {
        skipped.set("particles", cameraError);
        return [];
      }
      if ((frame.scene.options.maximumParticles ?? DEFAULT_MAXIMUM_PARTICLES) !== maximumParticles)
        throw new RangeError("Stage scene and renderer particle capacities must match");
      const roleIndex = ROLES.indexOf(frame.role);
      const frames = new Map<number, EffectFrame>();
      const frameFor = (group: number, pass: number) => {
        const key = pass * 32 + group;
        let value = frames.get(key);
        if (!value)
          frames.set(
            key,
            (value = stageEffectFrame(frame.camera, viewport, {
              ...frame,
              shadow: stageGroupShadow(frame.shadows, group),
              fog: frame.lighting && lightingForGroup(frame.lighting, group, pass).fog,
            })),
          );
        return value;
      };
      const drawNodes: StageNode[] = [];
      for (const node of nodes) {
        if (frame.cameraScopes && !frame.cameraScopes.has(node)) continue;
        if (node.record?.type !== PARTICLE_TYPE || !stageParticleDrawable(node)) continue;
        const particle = stageParticle(node);
        if (!particle) continue;
        const { program, state, draw } = particle;
        particleDrawRange(program, state.time, maximumParticles, range);
        if (range.count === 0) continue;
        const resource = draw.binding.resourceIndex;
        if (resource !== BLANK_TEXTURE && pack.texture(frame.role, resource) === null) {
          skipped.set(
            `particle@${node.record.offset}`,
            `texture resource ${resource} is not an image`,
          );
          continue;
        }
        for (let i = 0; i < 16; i++) worldMatrix[i] = state.matrix[(i % 4) * 4 + Math.floor(i / 4)];
        particleFrameParameters(
          program,
          state,
          range.shaderTime,
          stageParticleColor(node),
          parameters,
        );
        drawNodes.push(node);
        publisher.particle({
          frame: frameFor(
            stageLightScope(node).group,
            particlePass(draw.featureWord144, stageDrawKey(node)),
          ),
          shadow: !!stageGroupShadow(frame.shadows, stageLightScope(node).group),
          instanceId: node.ordinal,
          resourceId: roleIndex,
          draw,
          state: depthParticleEffectState(draw.sourceFlags),
          worldMatrix,
          parameters,
          births: state.births,
          ringIndex: particleRingIndex(program, range),
          start: range.start,
          count: range.count,
          layer: stageNodeLayer(node),
          priority: node.record.priority,
          orderKey: stageDrawKey(node),
        });
      }
      if (publisher.packets.length === 0) return [];
      renderer ??= createEffectRenderer(gl, source);
      return renderer.prepare(publisher.packets, frameFor(0, 0)).map((entry, index) => ({
        node: drawNodes[index],
        pass: entry.pass,
        key: entry.key,
        depth: entry.depth,
        requiresDepthSnapshot: entry.requiresDepthSnapshot,
        requiresColorSnapshot: entry.requiresColorSnapshot,
        draw: (context) => entry.draw(context).draws,
      }));
    },
    dispose() {
      if (blank) gl.deleteTexture(blank);
      renderer?.dispose();
    },
  };
}
