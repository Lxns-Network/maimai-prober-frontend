import { nthElement, type TextureElement } from "../elements";
import { liveNodes, type StageNode, type StageScene } from "../runtime";
import {
  createEffectRenderer,
  type EffectBillboardPacket,
  type EffectPrimitivePacket,
  type EffectDrawContext,
} from "../../effects/render";
import { depthPrimitiveEffectState } from "../../effects/renderState";
import { stageTextureBinding, stageSimpleMaterial } from "../nodes/primitive3d";
import { lightingForGroup, stageLightScope, type StageLighting } from "../nodes/lights";
import type { StageParticleFrame } from "./stageParticles";
import {
  STAR_PARTICLE_TYPE,
  starParticleDrawable,
  starParticleState,
  starParticleDrawData,
  type StarParticleState,
} from "../nodes/starParticle";
import { stageDrawKey, stageModelDepth } from "../order";
import type { StagePack } from "../pack";
import { drawSourceFlags, plainMaterial } from "../../effects/eval/draw";
import { primitivePass } from "../../effects/passes";
import { sinCosAngleCode } from "../../math/trig";
import { inverseAffine, multiplyAffine, normalize3 } from "../../math/matrix";
import type { StageDrawCamera } from "../camera/scopes";
import { stageGroupShadow } from "./stageShadowFrame";
import { stageEffectFrame } from "./stageEffectFrame";

const f = Math.fround;
const ROLES = ["base", "field"] as const;
const COLOR = Array.from({ length: 256 }, (_, byte) => f(byte * f(1 / 255)));
const IDENTITY = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
const filter = (value: number) => (value === 1 ? 2 : 1);

/** The camera the particles are placed with: row-major matrices with the translation in the fourth column. */
export interface StarParticleCamera {
  readonly view: ArrayLike<number>;
  readonly projection: ArrayLike<number>;
  readonly viewProjection: ArrayLike<number>;
}

export interface StarParticleFrame {
  readonly scene: StageScene;
  readonly role: (typeof ROLES)[number];
  readonly camera: StarParticleCamera;
  readonly cameraScopes?: ReadonlyMap<StageNode, StageDrawCamera>;
  readonly mirror?: unknown;
  readonly shadows?: StageParticleFrame["shadows"];
  readonly lighting?: StageLighting;
}

/** One prepared particle draw, ordered with the scene's other draws by pass, key and depth. */
export interface StarParticleEntry {
  readonly node: StageNode;
  readonly requiresDepthSnapshot: boolean;
  readonly requiresColorSnapshot: boolean;
  readonly pass: number;
  readonly key: number;
  readonly depth: number;
  draw(context?: EffectDrawContext): number;
}

export interface StageStarParticles {
  /** Prepares the frame's dynamic particle draws; nodes that cannot be drawn are listed in `skipped`. */
  prepare(
    frame: StarParticleFrame,
    skipped: Map<string, string>,
    nodes?: readonly StageNode[],
  ): readonly StarParticleEntry[];
  dispose(): void;
}

/** The row-major view matrix as the executable's row-vector matrix (translation in 12 to 14). */
function toRowVector(view: ArrayLike<number>): Float32Array {
  return Float32Array.from({ length: 16 }, (_, i) => view[(i % 4) * 4 + Math.floor(i / 4)]);
}

const trig = new Float64Array(2);

/** Draws CPU particles as camera-facing quads or fixed-size point sprites. */
export function createStageStarParticles(
  gl: WebGL2RenderingContext,
  pack: StagePack,
  textures: ReadonlyMap<string, WebGLTexture>,
): StageStarParticles {
  let renderer: ReturnType<typeof createEffectRenderer> | null = null;
  const source = {
    texture(resourceId: number, resourceIndex: number) {
      const id = pack.texture(ROLES[resourceId], resourceIndex);
      return id === null ? null : (textures.get(id) ?? null);
    },
  };
  /** Packs view-space quads without changing the cached first-draw particle order. */
  function build(node: StageNode, state: StarParticleState, camera: StarParticleCamera) {
    const w = state.settings.w;
    const g = toRowVector(camera.view);
    let placed = g;
    if (w.i[40] !== 0 && w.i[17] < 2 && w.i[12] !== 6) {
      placed = new Float32Array(16);
      multiplyAffine(g, node.world, placed);
    }
    const inverse = new Float32Array(16);
    inverseAffine(g, inverse);
    const data = starParticleDrawData(state, w.i[40] === 0 ? IDENTITY : placed);
    const words = new Uint32Array(data.buffer);
    const angles = new Int32Array(data.buffer);
    const normal = w.i[19] === 6 ? Float32Array.of(-1, 1, w.f[20]) : null;
    if (normal) normalize3(normal);
    const stride = normal ? 18 : 15;
    const instances = new Float32Array((data.length / 11) * stride);
    let at = 0;
    for (let b = 0; b < data.length; b += 11) {
      const packed = words[b + 3];
      const hx = f(data[b + 4] * 0.5);
      const hy = f(data[b + 5] * 0.5);
      let a = hx;
      let bb = hx;
      let c = hy;
      let d = hy;
      const angle = angles[b + 10];
      if (angle !== 0) {
        sinCosAngleCode(angle, trig);
        const s = trig[0];
        const co = trig[1];
        d = f(f(co * hy) - f(s * hx));
        c = f(f(s * hx) + f(co * hy));
        bb = f(f(co * hx) - f(s * hy));
        a = f(f(co * hx) + f(s * hy));
      }
      const x = data[b];
      const y = data[b + 1];
      const z = data[b + 2];
      const vx = f(f(f(f(y * placed[4]) + f(x * placed[0])) + f(z * placed[8])) + placed[12]);
      const vy = f(f(f(f(x * placed[1]) + f(y * placed[5])) + f(z * placed[9])) + placed[13]);
      const vz = f(f(f(f(y * placed[6]) + f(x * placed[2])) + f(z * placed[10])) + placed[14]);
      instances[at] = vx;
      instances[at + 1] = vy;
      instances[at + 2] = vz;
      instances[at + 3] = COLOR[packed & 255];
      instances[at + 4] = COLOR[(packed >>> 8) & 255];
      instances[at + 5] = COLOR[(packed >>> 16) & 255];
      instances[at + 6] = COLOR[packed >>> 24];
      instances[at + 7] = a;
      instances[at + 8] = bb;
      instances[at + 9] = c;
      instances[at + 10] = d;
      instances[at + 11] = data[b + 6];
      instances[at + 12] = data[b + 7];
      instances[at + 13] = data[b + 8];
      instances[at + 14] = data[b + 9];
      if (normal) {
        let nx = normal[0],
          ny = normal[1];
        if (angle !== 0) {
          nx = f(f(normal[0] * trig[1]) - f(normal[1] * trig[0]));
          ny = f(f(normal[1] * trig[1]) + f(normal[0] * trig[0]));
        }
        instances[at + 15] = nx;
        instances[at + 16] = ny;
        instances[at + 17] = normal[2];
      }
      at += stride;
    }
    return { instances, inverse };
  }

  return {
    prepare(frame, skipped, nodes = liveNodes(frame.scene)) {
      const packets: (EffectBillboardPacket | EffectPrimitivePacket)[] = [];
      const drawNodes: StageNode[] = [];
      const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
      for (const node of nodes) {
        if (frame.cameraScopes && !frame.cameraScopes.has(node)) continue;
        if (node.record?.type !== STAR_PARTICLE_TYPE || !starParticleDrawable(node)) continue;
        const state = starParticleState(node);
        if (!state || state.liveHead < 0) continue;
        const where = `particle@${node.record.offset}`;
        const binding = stageTextureBinding(node);
        if (!binding) {
          skipped.set(where, "particle without a selected texture");
          continue;
        }
        const id = pack.texture(frame.role, binding.resourceIndex);
        if (id === null || !textures.get(id)) {
          skipped.set(where, `texture resource ${binding.resourceIndex} is not loaded`);
          continue;
        }
        const flags = drawSourceFlags(
          frame.scene.graph.i32(node.record.offset + 12),
          node.record.flags,
          [binding.parameterWords[2]],
        );
        const priority = (node.record.priority << 24) >> 24;
        const point = state.settings.w.i[19] === 7;
        const layout = point ? 16 : state.settings.w.i[19] === 6 ? 10 : 4;
        const material = stageSimpleMaterial(
          node,
          plainMaterial(flags, priority, node.record.drawCoordinateMode, layout, 1),
          layout,
          1,
        );
        let deviceState;
        try {
          deviceState = depthPrimitiveEffectState(material.sourceFlags);
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
          skipped.set(where, error.message);
          continue;
        }
        const camera = frame.cameraScopes?.get(node);
        const selectedCamera = camera ?? frame.camera;
        drawNodes.push(node);
        const key = stageDrawKey(node);
        const pass = primitivePass(material.featureWord96, material.featureWord100, key);
        const lights =
          frame.lighting && lightingForGroup(frame.lighting, stageLightScope(node).group, pass);
        const context = material.context.slice();
        const contextView = new DataView(context.buffer);
        const texture = nthElement<TextureElement>(node, 300, 0)!;
        contextView.setFloat32(60, texture.offset[0], true);
        contextView.setFloat32(64, texture.offset[1], true);
        const common = {
          frame: stageEffectFrame(
            frame.camera,
            { width: viewport[2], height: viewport[3] },
            {
              ...frame,
              shadow: stageGroupShadow(frame.shadows, stageLightScope(node).group),
              fog: lights?.fog,
            },
          ),
          resourceId: ROLES.indexOf(frame.role),
          shadow: !!stageGroupShadow(frame.shadows, stageLightScope(node).group),
          normalLights: layout === 10 ? (lights?.parallel ?? []) : undefined,
          bindings: [
            {
              resourceIndex: binding.resourceIndex,
              sampler: {
                addressU: binding.sampler.wrapU === 2 ? 3 : 1,
                addressV: binding.sampler.wrapV === 2 ? 3 : 1,
                minFilter: filter(binding.sampler.minFilter),
                magFilter: filter(binding.sampler.magFilter),
                mipFilter: 0,
                maxMipLevel: 0,
                maxAnisotropy: binding.sampler.anisoNumber,
              },
            },
          ],
          state: deviceState,
          material: { ...material, context },
          order: {
            pass: {
              passIndex: primitivePass(material.featureWord96, material.featureWord100, key),
            },
            key,
            sortPosition: node.world.subarray(12, 15),
            sortDistanceOffset: -priority,
          },
        };
        if (point) {
          const w = state.settings.w;
          let placement = toRowVector(selectedCamera.view);
          const local = w.i[40] !== 0 && w.i[17] < 2 && w.i[12] !== 6;
          if (local) {
            const view = placement;
            placement = new Float32Array(16);
            multiplyAffine(view, node.world, placement);
          }
          const data = starParticleDrawData(state, w.i[40] === 0 ? IDENTITY : placement);
          const words = new Uint32Array(data.buffer);
          const count = data.length / 5;
          const positions = new Float32Array(count * 3);
          const colors = new Float32Array(count * 4);
          for (let i = 0; i < count; i++) {
            positions.set(data.subarray(i * 5, i * 5 + 3), i * 3);
            const packed = words[i * 5 + 3];
            colors.set(
              [
                COLOR[packed & 255],
                COLOR[(packed >>> 8) & 255],
                COLOR[(packed >>> 16) & 255],
                COLOR[packed >>> 24],
              ],
              i * 4,
            );
          }
          packets.push({
            ...common,
            kind: "simple",
            layout,
            topology: "points",
            pointSize: w.f[32],
            worldMatrix: local ? toRowVector(node.world) : IDENTITY,
            mesh: {
              attributes: {
                aPosition: { size: 3, values: positions },
                aColor: { size: 4, values: colors },
                aTexCoord: { size: 2, values: new Float32Array(count * 2) },
              },
              indices: Uint32Array.from({ length: count }, (_, i) => i),
            },
          });
        } else {
          const { instances, inverse } = build(node, state, selectedCamera);
          packets.push({
            ...common,
            kind: "billboard",
            instances,
            worldMatrix: toRowVector(inverse),
          });
        }
      }
      if (packets.length === 0) return [];
      renderer ??= createEffectRenderer(gl, source);
      const joint = new Float32Array(16);
      return renderer
        .prepare(packets, {
          viewport: { width: viewport[2], height: viewport[3] },
          viewProjection: frame.camera.viewProjection,
          projection: frame.camera.projection,
          eyePosition: [0, 0, 0],
          mirror: !!frame.mirror,
          depth: {
            primitive(position, offset) {
              joint.set(position, 12);
              return stageModelDepth(joint, frame.camera.view, frame.camera.projection, offset);
            },
            model() {
              throw new Error("CPU particles do not submit models");
            },
          },
        })
        .map((entry, index) => ({
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
