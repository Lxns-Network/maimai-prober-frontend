import { throwIfAborted } from "@lxns-network/chunithm-chart-engine/assets/abort";
import type {
  FrameDraw,
  FrameExternalRenderer,
  FrameSurface,
} from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import { createSortDepthCamera } from "@lxns-network/chunithm-chart-engine/render/sortDepth";
import {
  readEffectResource,
  type EffectResource,
} from "@lxns-network/chunithm-chart-engine/effects/afb";
import { effectPlayerLayer } from "@lxns-network/chunithm-chart-engine/effects/players";
import {
  createEffectPublisher,
  createParticleRings,
} from "@lxns-network/chunithm-chart-engine/effects/publish";
import {
  createEffectRenderer,
  type EffectPacket,
  type EffectProgramKey,
} from "@lxns-network/chunithm-chart-engine/effects/render";
import {
  createEffectScheduler,
  type EffectScheduler,
} from "@lxns-network/chunithm-chart-engine/effects/schedule";
import {
  loadEffectResourceList,
  type EffectResourceList,
  type EffectTextures,
} from "@lxns-network/chunithm-chart-engine/effects/textures";
import { createEffectPlayback } from "@lxns-network/chunithm-chart-engine/effects/playback";
import { stepForSeconds } from "@lxns-network/chunithm-chart-engine/loop/audioClock";
import type { LoadedChart } from "@lxns-network/chunithm-chart-engine/chart/worker/loadChart";

import { createEffectPlayer } from "@lxns-network/chunithm-chart-engine/effects/instance";

const MAXIMUM_PARTICLES = 10000;

type ChartEffects = LoadedChart["effects"];

interface EffectResources {
  /** The resource list the textures are loaded from. */
  manifestUrl: string;
  /** Effect resources by resource id. */
  resources: (EffectResource | undefined)[];
}

/** Reads the effect resources the list declares; only those in `ids` when given. */
export async function loadEffectResources(
  manifestUrl: string,
  signal: AbortSignal,
  ids?: readonly number[],
  manifest?: Promise<EffectResourceList>,
  fetcher: typeof fetch = fetch,
): Promise<EffectResources> {
  const list = await (manifest ?? loadEffectResourceList(manifestUrl, signal));
  throwIfAborted(signal);
  const wanted = ids ? new Set(ids) : null;
  const resources: (EffectResource | undefined)[] = [];
  await Promise.all(
    list.effects
      .filter((effect) => !wanted || wanted.has(effect.id))
      .map(async (effect) => {
        if (!effect.runtimeGraph) throw new RangeError(`Effect resource ${effect.id} has no graph`);
        const url = new URL(effect.runtimeGraph.url, manifestUrl).href;
        const graph = await fetcher(url, { signal, credentials: "omit" });
        if (!graph.ok) throw new Error(`Effect resource ${effect.id} ${graph.status}: ${url}`);
        resources[effect.id] = readEffectResource(new Uint8Array(await graph.arrayBuffer()));
      }),
  );
  return { manifestUrl, resources };
}

/** Resource ids a computation of the chart's effects creates instances of. */
export function effectResourceIds(effects: ChartEffects): number[] {
  return [...new Set(effects.instances.resource)].sort((a, b) => a - b);
}

export interface EffectHost {
  /** The effect draws of one frame, for the scene's queue; valid until the next call. */
  draws(
    input: Parameters<FrameExternalRenderer>[0] & {
      effects: ChartEffects;
      judgePositionOffset: number;
      criticalDisplayRow: number;
    },
  ): readonly FrameDraw[];
  prepareResources(ids: readonly number[]): Promise<void>;
  dispose(): void;
}

/** Draws a chart's effects in the scene's passes. Owns `textures` from creation. */
export function createEffectHost(input: {
  gl: WebGL2RenderingContext;
  scene: FrameSurface;
  resources: readonly (EffectResource | undefined)[];
  textures: EffectTextures;
}): EffectHost {
  const { scene, resources, textures } = input;
  const device = scene.withPresentation((device) => device);
  const gpuEpoch = () => device.executionSequence;
  const renderer = createEffectRenderer(input.gl, textures, gpuEpoch);
  const particleRings = createParticleRings(MAXIMUM_PARTICLES);
  const publisherOptions = { maximumParticles: MAXIMUM_PARTICLES, particleRings };
  let publisher = createEffectPublisher(publisherOptions);
  let nextPublisher = createEffectPublisher(publisherOptions);
  const interpolation = new EffectInterpolation();

  let source: ChartEffects | null = null;
  const playback = createEffectPlayback();
  let mapped: ChartEffects | null = null;
  let scheduler: EffectScheduler | null = null;
  let judgePositionOffset = 0;
  let criticalDisplayRow = 0;
  let published = -1;
  let previousSeconds = -Infinity;
  let previousRate = 1;
  let previousEpoch = 0;
  const publishedEye = new Float64Array(6);
  let disposed = false;
  return {
    async prepareResources(ids) {
      const keys: EffectProgramKey[] = [];
      for (const id of ids) {
        const player = createEffectPlayer(resources[id]!);
        for (const node of player.program.nodes) {
          if (node.type === 6001008) {
            const particle = player.particleProgram(node);
            const ring = (particle.box ? 4 : 0) + (particle.reverse ? 1 : 0);
            particleRings.get(ring);
            particleRings.get(ring + 2);
            keys.push({
              particle: true,
              softEdge: false,
              textures: 1,
              blend0: 0,
              blend1: 0,
              separateUv: false,
              uniformColor: false,
              parallelLights: 0,
            });
          } else if (node.type === 100 || node.type === 204) {
            const draw = player.draws.primitive(node);
            const material = draw.material;
            // Animated vertex colours can switch between uniform and per-vertex forms.
            for (const uniformColor of [false, true])
              keys.push({
                particle: false,
                softEdge: material.environmentIndex === 1,
                refraction: material.environmentIndex === 2 || material.environmentIndex === 3,
                textures: draw.elementOffsets.length,
                blend0: (material.materialKey[0] >>> 26) & 15,
                blend1: material.materialKey[1] & 7,
                separateUv: draw.layout === 5,
                uniformColor,
                parallelLights: 0,
              });
          }
        }
      }
      try {
        await renderer.warm(keys);
      } finally {
        device.markResourcesUnknown();
      }
    },
    draws({
      seconds,
      playbackRate = 1,
      playbackEpoch = 0,
      camera,
      environment,
      effects,
      judgePositionOffset: nextOffset,
      criticalDisplayRow: nextDisplayRow,
    }) {
      if (disposed) throw new Error("The effect host has been disposed");
      const frame = playback.update(effects, seconds, playbackRate, playbackEpoch);
      const eye = scene.readEffectCamera();
      const step = stepForSeconds(frame.seconds);
      let sameEye = true;
      for (let i = 0; i < 3; i++) {
        if (publishedEye[i] !== eye.position[i] || publishedEye[i + 3] !== eye.up[i])
          sameEye = false;
        publishedEye[i] = eye.position[i];
        publishedEye[i + 3] = eye.up[i];
      }
      let appended = false;
      if (
        effects !== source ||
        frame.effects !== mapped ||
        nextOffset !== judgePositionOffset ||
        nextDisplayRow !== criticalDisplayRow
      ) {
        if (
          scheduler &&
          effects.sequence === source?.sequence &&
          published >= 0 &&
          sameEye &&
          seconds >= previousSeconds &&
          playbackRate === previousRate &&
          playbackEpoch === previousEpoch &&
          nextOffset === judgePositionOffset &&
          nextDisplayRow === criticalDisplayRow
        ) {
          interpolation.apply(0);
          appended = scheduler.update(frame.effects, eye, (at) =>
            at === published ? publisher.sink : at === published + 1 ? nextPublisher.sink : null,
          );
        }
        if (appended) {
          publisher.sort();
          nextPublisher.sort();
        } else {
          scheduler = createEffectScheduler({
            resources,
            layerParameters: resources.map((resource, id) =>
              resource ? effectPlayerLayer(id) : null,
            ),
            instances: frame.effects.instances,
            consumption: frame.effects.consumption,
            moves: frame.effects.moves,
            maximumParticles: MAXIMUM_PARTICLES,
            judgePositionOffset: nextOffset,
            criticalDisplayRow: nextDisplayRow,
          });
          published = -1;
          publisher.reset();
          nextPublisher.reset();
          interpolation.reset();
        }
        source = effects;
        mapped = frame.effects;
        judgePositionOffset = nextOffset;
        criticalDisplayRow = nextDisplayRow;
      }
      previousSeconds = seconds;
      previousRate = playbackRate;
      previousEpoch = playbackEpoch;
      if (step !== published || !sameEye) {
        if (published >= 0 && step === published + 1 && sameEye) {
          [publisher, nextPublisher] = [nextPublisher, publisher];
        } else {
          publisher.reset();
          scheduler!.advanceTo(step, eye, publisher.sink);
        }
        nextPublisher.reset();
        scheduler!.advanceTo(step + 1, eye, nextPublisher.sink);
        interpolation.prepare(publisher.packets, nextPublisher.packets);
        published = step;
      } else if (appended) interpolation.prepare(publisher.packets, nextPublisher.packets);
      interpolation.apply(frame.seconds * 120 - step);
      return renderer.prepare(publisher.packets, {
        viewport: camera.viewport,
        viewProjection: camera.viewProjection,
        projection: camera.cameraB,
        eyePosition: eye.position,
        depth: createSortDepthCamera(camera.cameraA, camera.cameraB, environment),
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      interpolation.reset();
      try {
        renderer.dispose();
      } finally {
        textures.dispose();
      }
    },
  };
}

interface EffectSlot {
  /** Returns no draws while loading; propagates a loading failure to the session. */
  frame(input: Parameters<EffectHost["draws"]>[0]): readonly FrameDraw[];
  dispose(): void;
}

const NO_DRAWS: readonly FrameDraw[] = [];

/** Holds an effect host that is still being created, and owns it once it arrives. */
export function createEffectSlot(pending: Promise<EffectHost>, onChange?: () => void): EffectSlot {
  let state:
    | { status: "loading" }
    | { status: "ready"; host: EffectHost }
    | { status: "error"; cause: unknown } = { status: "loading" };
  let disposed = false;
  pending.then(
    (arrived) => {
      if (disposed) {
        arrived.dispose();
        return;
      }
      state = { status: "ready", host: arrived };
      onChange?.();
    },
    (error: unknown) => {
      if (disposed) return;
      state = { status: "error", cause: error };
      onChange?.();
    },
  );
  return {
    frame(input) {
      if (state.status === "error") throw state.cause;
      return state.status === "ready" ? state.host.draws(input) : NO_DRAWS;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (state.status === "ready") state.host.dispose();
      state = { status: "loading" };
    },
  };
}

type MutableValues = { [index: number]: number };

interface ArrayInterpolation {
  start: Float32Array;
  target: MutableValues;
  next: ArrayLike<number>;
  length: number;
}

interface MaterialInterpolation {
  target: DataView;
  start: Float64Array;
  end: Float64Array;
}

interface ParticleInterpolation {
  target: MutableValues;
  start: Float64Array;
  end: Float64Array;
  time: number;
}

const PARTICLE_INTERPOLATION_INDICES = [16, 17, 18, 19, 20, 21, 22, 23, 223];

/** Pairs stable draw identities, retaining the current step's births, removals and texture selections. */
class EffectInterpolation {
  private readonly targets = new Map<string | undefined, EffectPacket>();
  private readonly arrays: ArrayInterpolation[] = [];
  private readonly materials: MaterialInterpolation[] = [];
  private readonly particles: ParticleInterpolation[] = [];
  private arrayCount = 0;
  private materialCount = 0;
  private particleCount = 0;

  reset() {
    this.targets.clear();
    this.arrays.length = this.materials.length = this.particles.length = 0;
    this.arrayCount = this.materialCount = this.particleCount = 0;
  }

  private bind(current: ArrayLike<number>, next: ArrayLike<number>) {
    if (current.length !== next.length) return;
    let slot = this.arrays[this.arrayCount++];
    if (!slot) {
      slot = {
        start: new Float32Array(current.length),
        target: current as MutableValues,
        next,
        length: current.length,
      };
      this.arrays.push(slot);
    } else {
      if (slot.start.length < current.length) slot.start = new Float32Array(current.length);
      slot.target = current as MutableValues;
      slot.next = next;
      slot.length = current.length;
    }
    slot.start.set(current);
  }

  prepare(current: readonly EffectPacket[], next: readonly EffectPacket[]) {
    this.arrayCount = this.materialCount = this.particleCount = 0;
    this.targets.clear();
    for (const packet of next) this.targets.set(packet.interpolationKey, packet);
    for (const packet of current) {
      const other = this.targets.get(packet.interpolationKey);
      if (!other || other.kind !== packet.kind || other.resourceId !== packet.resourceId) continue;
      this.bind(packet.worldMatrix, other.worldMatrix);
      if (packet.kind === "simple" && other.kind === "simple") {
        this.bind(packet.order.sortPosition, other.order.sortPosition);
        for (const key of ["aPosition", "aColor", "aNormal"] as const) {
          const a = packet.mesh.attributes[key];
          const b = other.mesh.attributes[key];
          if (a && b) this.bind(a.values, b.values);
        }
        const context = packet.material.context as Uint8Array;
        const future = other.material.context as Uint8Array;
        let slot = this.materials[this.materialCount++];
        if (!slot) {
          slot = {
            target: new DataView(context.buffer, context.byteOffset, context.byteLength),
            start: new Float64Array(6),
            end: new Float64Array(6),
          };
          this.materials.push(slot);
        } else if (
          slot.target.buffer !== context.buffer ||
          slot.target.byteOffset !== context.byteOffset ||
          slot.target.byteLength !== context.byteLength
        ) {
          slot.target = new DataView(context.buffer, context.byteOffset, context.byteLength);
        }
        const futureView = new DataView(future.buffer, future.byteOffset, future.byteLength);
        for (let i = 0; i < 6; i++) {
          slot.start[i] = slot.target.getFloat32(60 + i * 4, true);
          slot.end[i] = futureView.getFloat32(60 + i * 4, true);
        }
      } else if (packet.kind === "particle" && other.kind === "particle") {
        let slot = this.particles[this.particleCount++];
        if (!slot) {
          slot = {
            target: packet.parameters as MutableValues,
            start: new Float64Array(9),
            end: new Float64Array(9),
            time: 0,
          };
          this.particles.push(slot);
        }
        slot.target = packet.parameters as MutableValues;
        slot.time = packet.parameters[0];
        for (let i = 0; i < PARTICLE_INTERPOLATION_INDICES.length; i++) {
          const index = PARTICLE_INTERPOLATION_INDICES[i];
          slot.start[i] = packet.parameters[index];
          slot.end[i] = other.parameters[index];
        }
      }
    }
  }

  apply(fraction: number) {
    for (let j = 0; j < this.arrayCount; j++) {
      const { start, target, next, length } = this.arrays[j];
      for (let i = 0; i < length; i++) target[i] = start[i] + (next[i] - start[i]) * fraction;
    }
    for (let j = 0; j < this.materialCount; j++) {
      const { start, end, target } = this.materials[j];
      for (let i = 0; i < 6; i++)
        target.setFloat32(60 + i * 4, start[i] + (end[i] - start[i]) * fraction, true);
    }
    for (let j = 0; j < this.particleCount; j++) {
      const { start, end, target, time } = this.particles[j];
      // Shader time is relative to this draw's ring slice; the next slice may wrap or retire particles.
      target[0] = time + fraction * 0.5;
      for (let i = 0; i < PARTICLE_INTERPOLATION_INDICES.length; i++) {
        target[PARTICLE_INTERPOLATION_INDICES[i]] = start[i] + (end[i] - start[i]) * fraction;
      }
    }
  }
}
