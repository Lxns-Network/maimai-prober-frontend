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
import { createEffectPublisher } from "@lxns-network/chunithm-chart-engine/effects/publish";
import {
  createEffectRenderer,
  type EffectPacket,
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
  const renderer = createEffectRenderer(input.gl, textures);
  let publisher = createEffectPublisher({ maximumParticles: MAXIMUM_PARTICLES });
  let nextPublisher = createEffectPublisher({ maximumParticles: MAXIMUM_PARTICLES });
  let interpolate: ((fraction: number) => void)[] = [];

  let source: ChartEffects | null = null;
  const playback = createEffectPlayback();
  let mapped: ChartEffects | null = null;
  let scheduler: EffectScheduler | null = null;
  let judgePositionOffset = 0;
  let criticalDisplayRow = 0;
  let published = -1;
  const publishedEye = new Float64Array(6);
  let disposed = false;
  return {
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
      if (
        effects !== source ||
        frame.effects !== mapped ||
        nextOffset !== judgePositionOffset ||
        nextDisplayRow !== criticalDisplayRow
      ) {
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
        source = effects;
        mapped = frame.effects;
        judgePositionOffset = nextOffset;
        criticalDisplayRow = nextDisplayRow;
        published = -1;
        publisher.reset();
        nextPublisher.reset();
        interpolate = [];
      }
      const eye = scene.readEffectCamera();
      const step = stepForSeconds(frame.seconds);
      let sameEye = true;
      for (let i = 0; i < 3; i++) {
        if (publishedEye[i] !== eye.position[i] || publishedEye[i + 3] !== eye.up[i])
          sameEye = false;
        publishedEye[i] = eye.position[i];
        publishedEye[i + 3] = eye.up[i];
      }
      if (step !== published || !sameEye) {
        if (published >= 0 && step === published + 1 && sameEye) {
          [publisher, nextPublisher] = [nextPublisher, publisher];
        } else {
          publisher.reset();
          scheduler!.advanceTo(step, eye, publisher.sink);
        }
        nextPublisher.reset();
        scheduler!.advanceTo(step + 1, eye, nextPublisher.sink);
        interpolate = effectInterpolation(publisher.packets, nextPublisher.packets);
        published = step;
      }
      for (const update of interpolate) update(frame.seconds * 120 - step);
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

/** Pairs stable draw identities, retaining the current step's births, removals and texture selections. */
function effectInterpolation(current: readonly EffectPacket[], next: readonly EffectPacket[]) {
  const targets = new Map(next.map((packet) => [packet.interpolationKey, packet]));
  const updates: ((fraction: number) => void)[] = [];
  const bind = (current: ArrayLike<number>, next: ArrayLike<number>) => {
    if (current.length !== next.length) return;
    const start = Float32Array.from(current);
    const target = current as { [index: number]: number };
    updates.push((fraction) => {
      for (let i = 0; i < start.length; i++) target[i] = start[i] + (next[i] - start[i]) * fraction;
    });
  };
  for (const packet of current) {
    const other = targets.get(packet.interpolationKey);
    if (!other || other.kind !== packet.kind || other.resourceId !== packet.resourceId) continue;
    bind(packet.worldMatrix, other.worldMatrix);
    if (packet.kind === "simple" && other.kind === "simple") {
      bind(packet.order.sortPosition, other.order.sortPosition);
      for (const key of ["aPosition", "aColor", "aNormal"] as const) {
        const a = packet.mesh.attributes[key];
        const b = other.mesh.attributes[key];
        if (a && b) bind(a.values, b.values);
      }
      const context = packet.material.context as Uint8Array;
      const future = other.material.context as Uint8Array;
      const a = new DataView(context.buffer, context.byteOffset, context.byteLength);
      const b = new DataView(future.buffer, future.byteOffset, future.byteLength);
      for (let offset = 60; offset < 84; offset += 4) {
        const start = a.getFloat32(offset, true);
        const end = b.getFloat32(offset, true);
        updates.push((t) => a.setFloat32(offset, start + (end - start) * t, true));
      }
    } else if (packet.kind === "particle" && other.kind === "particle") {
      const parameters = packet.parameters as { [index: number]: number };
      const start = parameters[0];
      // Shader time is relative to this draw's ring slice; the next slice may wrap or retire particles.
      updates.push((fraction) => {
        parameters[0] = start + fraction * 0.5;
      });
      for (const index of [16, 17, 18, 19, 20, 21, 22, 23, 223]) {
        const a = parameters[index];
        const b = other.parameters[index];
        updates.push((fraction) => {
          parameters[index] = a + (b - a) * fraction;
        });
      }
    }
  }
  return updates;
}
