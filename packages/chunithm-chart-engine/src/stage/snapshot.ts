import {
  finishStageScenes,
  stepStageScenes,
  type StageNode,
  type StageScene,
  type StageSceneOptions,
} from "./runtime";
import { instancedModelNode, modelNode } from "./nodes/model";

/** The objects and buffers every copy of a scene shares: its options and what they reach. */
interface Shared {
  readonly objects: WeakSet<object>;
  readonly buffers: WeakSet<ArrayBufferLike>;
}

const sharedByOptions = new WeakMap<StageSceneOptions, Shared>();

/** Marks immutable resources resolved after the scene options were created. */
export function retainSharedStageResource(scene: StageScene, resource: object): void {
  const shared = sharedStageData(scene);
  shared.objects.add(resource);
  if (ArrayBuffer.isView(resource)) shared.buffers.add(resource.buffer);
}

/**
 * Everything a scene's options reach is read-only scene data: the graph, the behaviors, the model
 * lookup and the held states. Random and traversal clocks are mutable playback state.
 */
export function sharedStageData(scene: StageScene): Shared {
  let shared = sharedByOptions.get(scene.options);
  if (shared) return shared;
  shared = { objects: new WeakSet(), buffers: new WeakSet() };
  const stack: unknown[] = [];
  for (const [key, value] of Object.entries(scene.options))
    if (key !== "random" && key !== "traversalClock") stack.push(value);
  while (stack.length) {
    const value = stack.pop();
    if (value === null || typeof value !== "object" || shared.objects.has(value)) continue;
    shared.objects.add(value);
    if (ArrayBuffer.isView(value)) {
      shared.buffers.add(value.buffer);
      continue;
    }
    if (value instanceof ArrayBuffer) {
      shared.buffers.add(value);
      continue;
    }
    if (value instanceof Map)
      for (const [k, v] of value) {
        stack.push(k);
        stack.push(v);
      }
    else if (value instanceof Set) for (const v of value) stack.push(v);
    else
      for (const key of Reflect.ownKeys(value))
        stack.push((value as Record<PropertyKey, unknown>)[key]);
  }
  sharedByOptions.set(scene.options, shared);
  return shared;
}

export interface StageSceneCopy {
  readonly scene: StageScene;
  /** Approximate memory the copy holds beside the shared data. */
  readonly bytes: number;
}

type View = ArrayBufferView & {
  constructor: new (buffer: ArrayBufferLike, offset: number, length: number) => ArrayBufferView;
};

function cloneStageScenes(
  scenes: readonly StageScene[],
  copies = new Map<object, unknown>(),
  previous = new Map<object, unknown>(),
  sources?: WeakMap<object, object>,
): StageSceneCopy[] {
  const shared = scenes.map(sharedStageData);
  const buffers = new Map<ArrayBufferLike, ArrayBuffer>();
  let bytes = 0;
  const remember = (source: object, result: object, retained: unknown) => {
    copies.set(source, result);
    if (sources && result !== retained) sources.set(result, source);
  };
  const copy = (value: unknown, presentation = sources !== undefined): unknown => {
    if (value === null || typeof value !== "object") return value;
    for (const data of shared) if (data.objects.has(value)) return value;
    const done = copies.get(value);
    if (done !== undefined) return done;
    const retained = previous.get(value);
    if (ArrayBuffer.isView(value)) {
      for (const data of shared) if (data.buffers.has(value.buffer)) return value;
      let buffer = buffers.get(value.buffer);
      if (!buffer) {
        buffer = ArrayBuffer.isView(retained)
          ? (retained.buffer as ArrayBuffer)
          : new ArrayBuffer(value.buffer.byteLength);
        if (
          value instanceof Float32Array &&
          retained instanceof Float32Array &&
          value.byteLength === value.buffer.byteLength
        )
          retained.set(value);
        else new Uint8Array(buffer).set(new Uint8Array(value.buffer));
        buffers.set(value.buffer, buffer);
        bytes += buffer.byteLength;
      }
      const view = value as View;
      const length =
        value instanceof DataView
          ? value.byteLength
          : (value as unknown as { length: number }).length;
      const result =
        ArrayBuffer.isView(retained) && retained.buffer === buffer
          ? retained
          : value instanceof DataView
            ? new DataView(buffer, value.byteOffset, length)
            : new view.constructor(buffer, value.byteOffset, length);
      remember(value, result, retained);
      return result;
    }
    if (Array.isArray(value)) {
      const result: unknown[] = Array.isArray(retained) ? retained : [];
      result.length = value.length;
      remember(value, result, retained);
      bytes += 16 + 8 * value.length;
      for (let i = 0; i < value.length; i++)
        result[i] =
          value[i] !== null && typeof value[i] === "object"
            ? copy(value[i], presentation)
            : value[i];
      return result;
    }
    if (value instanceof Map) {
      const result = retained instanceof Map ? retained : new Map();
      result.clear();
      remember(value, result, retained);
      bytes += 32 + 24 * value.size;
      value.forEach((v, k) => result.set(copy(k, presentation), copy(v, presentation)));
      return result;
    }
    if (value instanceof Set) {
      const result = retained instanceof Set ? retained : new Set();
      result.clear();
      remember(value, result, retained);
      bytes += 32 + 16 * value.size;
      for (const v of value) result.add(copy(v, presentation));
      return result;
    }
    // Mutable scene instances store data in enumerable fields; methods and getters live on
    // their prototypes. Copy those fields directly without allocating property descriptors.
    const keys = Object.keys(value);
    bytes += 24 + 8 * keys.length;
    const prototype = Object.getPrototypeOf(value) as object | null;
    const node =
      presentation && "record" in value && "birth" in value ? (value as StageNode) : null;
    const held = node?.record && node.scene.options.heldStates?.has(node.record.id);
    const behavior = node?.record && !held ? node.scene.options.nodes.get(node.record.type) : null;
    const provider = presentation && "poses" in value && "pose" in value && "playback" in value;
    const controller = presentation && "schedule" in value && "killWhenChildrenDone" in value;
    // Pose, blend and post-process publications retain fresh identities for render caches.
    const result = (
      retained && (node || provider || controller) ? retained : Object.create(prototype)
    ) as Record<string, unknown>;
    if (result === retained)
      for (const key of Object.keys(result))
        if (!Object.prototype.hasOwnProperty.call(value, key)) delete result[key];
    remember(value, result, retained);
    for (const key of keys) {
      const item = (value as Record<string, unknown>)[key];
      // Drawing consumes published bone worlds, not animation samples or future spawn schedules.
      if ((provider && key === "poses") || (controller && key === "schedule")) {
        const empty = result[key];
        if (Array.isArray(empty)) empty.length = 0;
        else result[key] = [];
        continue;
      }
      if (provider && key === "playback") {
        result[key] = null;
        continue;
      }
      // Models draw their published state. Held nodes still need their components to apply overrides.
      if (
        node &&
        !held &&
        (key === "before" ||
          key === "stateMotions" ||
          key === "after" ||
          key === "pending" ||
          key === "graveyard" ||
          (key === "elements" && (behavior === modelNode || behavior === instancedModelNode)))
      ) {
        const empty = result[key];
        if (Array.isArray(empty)) empty.length = 0;
        else result[key] = [];
        continue;
      }
      result[key] =
        item !== null && typeof item === "object"
          ? copy(item, presentation && !(held && key !== "scene" && key !== "parent"))
          : item;
    }
    return result;
  };
  return scenes.map((scene, index) => {
    const before = bytes;
    const result = copy(scene) as StageScene;
    sharedByOptions.set(result.options, shared[index]);
    return { scene: result, bytes: bytes - before };
  });
}

/** A copy of the scene's state that steps on independently of the scene; read-only data stays shared. */
export function cloneStageScene(scene: StageScene): StageSceneCopy {
  return cloneStageScenes([scene])[0];
}

export interface StageRewind {
  /** Prepares future checkpoints without changing the displayed scenes; returns true at the target. */
  warm(tick: number, deadline: number): boolean;
  /** The scenes stepped to `tick`, resumed from the latest kept copy when that is closer. */
  seek(tick: number): readonly StageScene[];
  /** Display-only scenes with interpolated render state; motion lists are retained only for held nodes. */
  sample(tick: number, fraction: number, presentationChanged?: boolean): readonly StageScene[];
  /** Copies the upcoming display tick while its simulation state is already available. */
  prepareDisplay(tick: number): void;
  /** Approximate memory the kept copies hold. */
  readonly bytes: number;
  /** The ticks between kept copies. */
  readonly interval: number;
}

interface Kept {
  readonly tick: number;
  readonly scenes: readonly StageScene[];
  readonly bytes: number;
}

/**
 * Steps scenes that move together, keeping copies every `interval` ticks so that a seek backwards
 * resumes from a copy instead of from the start. Past `budget` bytes, the interval doubles and the
 * copies off it are dropped. A failed seek invalidates the rewind; create a new one to retry.
 */
export function createStageRewind(
  build: () => StageScene[],
  interval = 300,
  budget = 16 << 20,
): StageRewind {
  let scenes: StageScene[] | null = null;
  let warming: StageScene[] | null = null;
  let warmStepMs = 0;
  let every = interval;
  let sampledTick = -1;
  let sampled: StageScene[] = [];
  const interpolate = new StageInterpolation();
  const displaySources = new WeakMap<object, object>();
  let spareCopies = new Map<object, unknown>();
  let displayCopies = new Map<object, unknown>();
  let prepared: { tick: number; scenes: StageScene[]; source: readonly StageScene[] } | null = null;
  let idleCopies = new Map<object, unknown>();
  let kept: Kept[] = [];
  let bytes = 0;
  let failure: { readonly cause: unknown } | null = null;
  const step = (live: StageScene[], target: number) => {
    const next = live[0].tick + 1;
    const defer =
      next < target - 1 &&
      next % every !== 0 &&
      (next + 1) % every !== 0 &&
      live.every(
        (scene) => scene.options.nodes.get(instancedModelNode.type) === instancedModelNode,
      );
    stepStageScenes(live, 1, defer);
    finishStageScenes(live);
    keep(live);
  };
  const keep = (live: StageScene[]) => {
    const tick = live[0].tick;
    if (tick % every !== 0) return;
    let at = kept.length;
    while (at > 0 && kept[at - 1].tick >= tick) at--;
    if (kept[at]?.tick === tick) return;
    const copies = cloneStageScenes(live);
    const size = copies.reduce((sum, copy) => sum + copy.bytes, 0);
    kept.splice(at, 0, { tick, scenes: copies.map((copy) => copy.scene), bytes: size });
    bytes += size;
    while (bytes > budget && kept.length > 1) {
      every *= 2;
      kept = kept.filter((copy) => copy.tick % every === 0);
      bytes = kept.reduce((sum, copy) => sum + copy.bytes, 0);
    }
  };
  const rewind: StageRewind = {
    warm(tick, deadline) {
      if (failure) throw failure.cause;
      if (performance.now() >= deadline) return false;
      try {
        let latest = warming;
        if (scenes && (!latest || scenes[0].tick > latest[0].tick)) latest = scenes;
        const last = kept[kept.length - 1];
        if (last && (!latest || last.tick > latest[0].tick)) latest = last.scenes as StageScene[];
        if (latest && latest[0].tick >= tick) {
          warming = null;
          return true;
        }
        if (latest !== warming)
          warming = latest ? cloneStageScenes(latest).map((copy) => copy.scene) : build();
        warming ??= build();
        while (warming[0].tick < tick) {
          const started = performance.now();
          if (started + warmStepMs >= deadline) {
            warmStepMs *= 0.9;
            break;
          }
          step(warming, tick);
          warmStepMs = Math.max(performance.now() - started, warmStepMs * 0.9);
        }
        if (warming[0].tick < tick) return false;
        warming = null;
        return true;
      } catch (cause) {
        failure = { cause };
        throw cause;
      }
    },
    prepareDisplay(tick) {
      if (prepared || !scenes || scenes[0].tick !== tick || sampledTick !== tick - 1) return;
      spareCopies.clear();
      const display = cloneStageScenes(scenes, spareCopies, idleCopies, displaySources).map(
        (copy) => copy.scene,
      );
      prepared = { tick, scenes: display, source: scenes };
    },
    sample(tick, fraction, presentationChanged = false) {
      if (presentationChanged) prepared = null;
      if (sampledTick === tick) {
        interpolate.apply(fraction);
        return sampled;
      }
      const upcoming = prepared;
      const live = rewind.seek(tick);
      if (fraction === 0) return live;
      const copies = spareCopies;
      if (upcoming && upcoming.tick === tick && upcoming.source === live) {
        sampled = upcoming.scenes;
        spareCopies = idleCopies;
        idleCopies = displayCopies;
      } else {
        copies.clear();
        sampled = cloneStageScenes(live, copies, displayCopies, displaySources).map(
          (copy) => copy.scene,
        );
        spareCopies = displayCopies;
      }
      spareCopies.clear();
      displayCopies = copies;
      stepStageScenes(live);
      finishStageScenes(live);
      keep(scenes!);
      interpolate.prepare(sampled, displaySources);
      sampledTick = tick;
      interpolate.apply(fraction);
      return sampled;
    },
    seek(tick) {
      prepared = null;
      if (failure) throw failure.cause;
      if (sampledTick === tick) {
        interpolate.apply(0);
        return sampled;
      }
      sampledTick = -1;
      sampled = [];
      interpolate.clear();
      try {
        let from: Kept | undefined;
        for (const copy of kept) if (copy.tick <= tick) from = copy;
        const current = scenes && scenes[0].tick <= tick ? scenes[0].tick : -1;
        if (from && from.tick > current)
          scenes = cloneStageScenes(from.scenes).map((copy) => copy.scene);
        else if (current < 0) scenes = build();
        const live = scenes!;
        while (live[0].tick < tick) {
          step(live, tick);
        }
        return live;
      } catch (cause) {
        failure = { cause };
        throw cause;
      }
    },
    get bytes() {
      return bytes;
    },
    get interval() {
      return every;
    },
  };
  return rewind;
}

/** Continuous display fields only; event counters, selectors and random state stay at the current tick. */
class StageInterpolation {
  private readonly active: ArrayInterpolation[] = [];
  private arrayCount = 0;
  private readonly scalars: ScalarInterpolation[] = [];
  private scalarCount = 0;
  private readonly paired = new Set<object>();
  private readonly unpublished: object[] = [];
  private readonly views: (Float32Array | Float64Array)[] = [];
  private readonly discontinuous = new Set<object>();
  private readonly packedVertices = new Map<object, number>();
  private readonly packedRecords = new Set<ArrayBufferLike>();

  clear(): void {
    this.arrayCount = 0;
    this.scalarCount = 0;
  }

  apply(fraction: number): void {
    for (let entryIndex = 0; entryIndex < this.arrayCount; entryIndex++) {
      const entry = this.active[entryIndex];
      const { start, end, out, stride, startWords, endWords, outWords } = entry;
      if (entry.constant) {
        out.set(start);
        continue;
      }
      for (let i = 0; i < start.length; i++) {
        if (stride && i % stride === stride - 3)
          outWords![i] = blendColour(startWords![i], endWords![i], fraction);
        else out[i] = start[i] + (end[i] - start[i]) * fraction;
      }
    }
    for (let i = 0; i < this.scalarCount; i++) {
      const entry = this.scalars[i];
      entry.out[entry.key] = entry.colour
        ? blendColour(entry.start, entry.end, fraction)
        : entry.start + (entry.end - entry.start) * fraction;
    }
  }

  prepare(scenes: readonly StageScene[], sources: WeakMap<object, object>): void {
    this.clear();
    const { paired, unpublished, discontinuous, packedVertices, packedRecords, views } = this;
    const transformChanged = (node: StageNode): boolean => {
      const live = sources.get(node) as StageNode;
      return (
        node.transformEpoch !== live.transformEpoch ||
        (node.coordinateMode !== 1 &&
          node.coordinateParent != null &&
          transformChanged(node.coordinateParent))
      );
    };
    const align = (out: unknown, published: unknown) => {
      if (out === null || typeof out !== "object" || out === published || paired.has(out)) return;
      const source = sources.get(out);
      if (!source) return;
      if (published === null || typeof published !== "object") {
        unpublished.push(out);
        return;
      }
      paired.add(out);
      // A replacement publication belongs to its slot. A spawned node always keeps its own identity.
      const node = "record" in out && "birth" in out ? (out as StageNode) : null;
      const future = node ? source : published;
      if (ArrayBuffer.isView(out)) {
        if (out instanceof Float32Array || out instanceof Float64Array) {
          if (future instanceof Float32Array || future instanceof Float64Array)
            views.push(out, future);
        } else packedRecords.add(out.buffer);
        return;
      }
      if (Array.isArray(out)) {
        for (let i = 0; i < out.length; i++) align(out[i], (future as unknown[])[i]);
        return;
      }
      if (out instanceof Map && future instanceof Map) {
        for (const [key, value] of out) {
          const liveKey = typeof key === "object" && key !== null ? (sources.get(key) ?? key) : key;
          if (key !== liveKey) unpublished.push(key);
          align(value, future.get(liveKey));
        }
        return;
      }
      if (out instanceof Set) {
        for (const value of out) align(value, undefined);
        return;
      }
      if (node && transformChanged(node)) discontinuous.add(node.world);
      const a = out as Record<string, unknown>;
      const b = future as Record<string, unknown>;
      if (a.vertices instanceof Float32Array) packedVertices.set(a.vertices, 6);
      if (a.normalVertices instanceof Float32Array) packedVertices.set(a.normalVertices, 9);
      for (const key of Object.keys(a)) {
        const start = a[key];
        const end = b[key];
        if (start !== null && typeof start === "object") {
          align(start, end);
          continue;
        }
        if (typeof start !== "number" || typeof end !== "number" || start === end) continue;
        const colour = colourFields.has(key);
        if (!colour && !(scalarFields.has(key) && Number.isFinite(start) && Number.isFinite(end)))
          continue;
        let entry = this.scalars[this.scalarCount++];
        if (!entry) {
          entry = { out: a, key, start, end, colour };
          this.scalars.push(entry);
        } else {
          entry.out = a;
          entry.key = key;
          entry.start = start;
          entry.end = end;
          entry.colour = colour;
        }
      }
    };
    for (const scene of scenes) align(scene, sources.get(scene));
    // Set members and removed slots may also be reachable through a newer publication.
    for (const out of unpublished) align(out, sources.get(out));
    unpublished.length = 0;
    // A later sibling may expose integer words over the same buffer as a float view.
    for (let i = 0; i < views.length; i += 2) {
      const original = views[i];
      const b = views[i + 1];
      const stride = packedVertices.get(original);
      if (!stride && packedRecords.has(original.buffer)) continue;
      if (original.length !== b.length) continue;
      const holdTransform = discontinuous.has(original);
      // Copy constant arrays too: held-state presentation can mutate them between samples.
      let unchanged = !stride;
      if (!stride) {
        for (let i = 0; i < original.length; i++) {
          const value = original[i];
          if (value !== b[i] || !Number.isFinite(value) || Object.is(value, -0)) {
            unchanged = false;
            break;
          }
        }
      }
      const index = this.arrayCount++;
      let entry = this.active[index];
      if (
        !entry ||
        entry.stride !== stride ||
        entry.start.constructor !== original.constructor ||
        entry.start.length !== original.length
      ) {
        const start = original.slice();
        entry = {
          start,
          end: b,
          out: original,
          stride,
          constant: unchanged,
          startWords: stride ? new Uint32Array(start.buffer, start.byteOffset, start.length) : null,
          endWords: null,
          outWords: stride
            ? new Uint32Array(original.buffer, original.byteOffset, original.length)
            : null,
        };
        this.active[index] = entry;
      } else entry.start.set(original);
      entry.out = original;
      if (
        stride &&
        (!entry.outWords ||
          entry.outWords.buffer !== original.buffer ||
          entry.outWords.byteOffset !== original.byteOffset)
      )
        entry.outWords = new Uint32Array(original.buffer, original.byteOffset, original.length);
      entry.constant = unchanged || holdTransform;
      entry.end = b;
      if (
        stride &&
        (!entry.endWords ||
          entry.endWords.buffer !== b.buffer ||
          entry.endWords.byteOffset !== b.byteOffset)
      )
        entry.endWords = new Uint32Array(b.buffer, b.byteOffset, b.length);
    }
    views.length = 0;
    this.active.length = this.arrayCount;
    this.scalars.length = this.scalarCount;
    paired.clear();
    discontinuous.clear();
    packedVertices.clear();
    packedRecords.clear();
  }
}

interface ArrayInterpolation {
  constant: boolean;
  readonly start: Float32Array | Float64Array;
  end: Float32Array | Float64Array;
  out: Float32Array | Float64Array;
  readonly stride: number | undefined;
  readonly startWords: Uint32Array | null;
  endWords: Uint32Array | null;
  outWords: Uint32Array | null;
}
interface ScalarInterpolation {
  out: Record<string, unknown>;
  key: string;
  start: number;
  end: number;
  colour: boolean;
}
const scalarFields = new Set([
  "frame",
  "previousFrame",
  "time",
  "sampledAge",
  "weight",
  "blendWeight",
  "fov",
  "fovDegrees",
  "aspect",
  "near",
  "far",
  "offsetX",
  "offsetY",
  "intensity",
  "radius",
  "exposure",
  "strength",
  "threshold",
  "amount",
]);
const colourFields = new Set([
  "color",
  "colour",
  "globalColor",
  "diffuse",
  "specular",
  "holderColour",
]);
const blendColour = (a: number, b: number, t: number) => {
  let out = 0;
  for (let shift = 0; shift < 32; shift += 8)
    out |= Math.round(((a >>> shift) & 255) * (1 - t) + ((b >>> shift) & 255) * t) << shift;
  return out >>> 0;
};
