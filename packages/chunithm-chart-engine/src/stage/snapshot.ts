import {
  finishStageScenes,
  stepStageScenes,
  type StageNode,
  type StageScene,
  type StageSceneOptions,
} from "./runtime";
import { instancedModelNode } from "./nodes/model";

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
  displayOnly = false,
): StageSceneCopy[] {
  const shared = scenes.map(sharedStageData);
  const buffers = new Map<ArrayBufferLike, ArrayBuffer>();
  let bytes = 0;
  const copy = (value: unknown): unknown => {
    if (
      value === null ||
      typeof value !== "object" ||
      shared.some((data) => data.objects.has(value))
    )
      return value;
    const done = copies.get(value);
    if (done !== undefined) return done;
    const retained = previous.get(value);
    if (ArrayBuffer.isView(value)) {
      if (shared.some((data) => data.buffers.has(value.buffer))) return value;
      let buffer = buffers.get(value.buffer);
      if (!buffer) {
        buffer = ArrayBuffer.isView(retained)
          ? (retained.buffer as ArrayBuffer)
          : new ArrayBuffer(value.buffer.byteLength);
        new Uint8Array(buffer).set(new Uint8Array(value.buffer));
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
      copies.set(value, result);
      return result;
    }
    if (Array.isArray(value)) {
      const result: unknown[] = Array.isArray(retained) ? retained : [];
      result.length = value.length;
      copies.set(value, result);
      bytes += 16 + 8 * value.length;
      for (let i = 0; i < value.length; i++)
        result[i] = value[i] !== null && typeof value[i] === "object" ? copy(value[i]) : value[i];
      return result;
    }
    if (value instanceof Map) {
      const result = retained instanceof Map ? retained : new Map();
      result.clear();
      copies.set(value, result);
      bytes += 32 + 24 * value.size;
      for (const [k, v] of value) result.set(copy(k), copy(v));
      return result;
    }
    if (value instanceof Set) {
      const result = retained instanceof Set ? retained : new Set();
      result.clear();
      copies.set(value, result);
      bytes += 32 + 16 * value.size;
      for (const v of value) result.add(copy(v));
      return result;
    }
    // Mutable scene instances store data in enumerable fields; methods and getters live on
    // their prototypes. Copy those fields directly without allocating property descriptors.
    const keys = Object.keys(value);
    bytes += 24 + 8 * keys.length;
    const prototype = Object.getPrototypeOf(value) as object | null;
    // Render caches key poses, blends and filter plans by identity, so records stay fresh.
    const result = Object.create(prototype) as Record<string, unknown>;
    copies.set(value, result);
    const node = displayOnly && "record" in value && "birth" in value ? (value as StageNode) : null;
    const held = node?.record && node.scene.options.heldStates?.has(node.record.id);
    for (const key of keys) {
      const item = (value as Record<string, unknown>)[key];
      // Display scenes never run the scheduler. Held nodes can still apply a presentation override.
      if (
        node &&
        !held &&
        (key === "before" ||
          key === "stateMotions" ||
          key === "after" ||
          key === "pending" ||
          key === "graveyard")
      ) {
        result[key] = [];
        continue;
      }
      result[key] = item !== null && typeof item === "object" ? copy(item) : item;
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
  sample(tick: number, fraction: number): readonly StageScene[];
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
  let every = interval;
  let sampledTick = -1;
  let sampled: StageScene[] = [];
  const interpolate = new StageInterpolation();
  const next = new Map<object, unknown>();
  let spareCopies = new Map<object, unknown>();
  let displayCopies = new Map<object, unknown>();
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
        while (warming[0].tick < tick && performance.now() < deadline) {
          step(warming, tick);
        }
        if (warming[0].tick < tick) return false;
        warming = null;
        return true;
      } catch (cause) {
        failure = { cause };
        throw cause;
      }
    },
    sample(tick, fraction) {
      if (sampledTick === tick) {
        interpolate.apply(fraction);
        return sampled;
      }
      const live = rewind.seek(tick);
      if (fraction === 0) return live;
      const copies = spareCopies;
      copies.clear();
      sampled = cloneStageScenes(live, copies, displayCopies, true).map((copy) => copy.scene);
      spareCopies = displayCopies;
      spareCopies.clear();
      displayCopies = copies;
      next.clear();
      for (const [original, copy] of copies) {
        next.set(copy as object, original);
      }
      stepStageScenes(live);
      finishStageScenes(live);
      keep(scenes!);
      interpolate.prepare(next);
      next.clear();
      sampledTick = tick;
      interpolate.apply(fraction);
      return sampled;
    },
    seek(tick) {
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
  private readonly arrays = new WeakMap<object, ArrayInterpolation>();
  private readonly active: ArrayInterpolation[] = [];
  private readonly scalars: ScalarInterpolation[] = [];
  private scalarCount = 0;

  clear(): void {
    this.active.length = 0;
    this.scalarCount = 0;
  }

  apply(fraction: number): void {
    for (const entry of this.active) {
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

  prepare(next: Map<object, unknown>): void {
    this.clear();
    // Publications can replace a pose or camera object while keeping their owning node alive.
    const paired = new Set<object>();
    const align = (original: unknown, future: unknown) => {
      if (
        !original ||
        !future ||
        typeof original !== "object" ||
        typeof future !== "object" ||
        !next.has(original) ||
        paired.has(original)
      )
        return;
      paired.add(original);
      if ("record" in original && "birth" in original && next.get(original) !== future) return;
      next.set(original, future);
      if (ArrayBuffer.isView(original)) return;
      if (original instanceof Map && future instanceof Map) {
        for (const [key, value] of original) align(value, future.get(next.get(key) ?? key));
      } else {
        for (const key of Object.keys(original))
          align(
            (original as Record<string, unknown>)[key],
            (future as Record<string, unknown>)[key],
          );
      }
    };
    for (const original of next.keys())
      if ("top" in original && "classState" in original) align(original, next.get(original));
    const packedVertices = new Map<object, number>();
    for (const original of next.keys()) {
      const value = original as { vertices?: Float32Array; normalVertices?: Float32Array };
      if (value.vertices) packedVertices.set(value.vertices, 6);
      if (value.normalVertices) packedVertices.set(value.normalVertices, 9);
    }
    // A float view sharing its buffer with an integer view is a packed record (a particle pool's
    // links, flags and colours beside its floats); blending it as floats corrupts those words.
    const packedRecords = new Set<ArrayBufferLike>();
    for (const original of next.keys())
      if (
        ArrayBuffer.isView(original) &&
        !(original instanceof Float32Array || original instanceof Float64Array)
      )
        packedRecords.add(original.buffer);
    for (const [original, future] of next) {
      if (!future) continue;
      if (original instanceof Float32Array || original instanceof Float64Array) {
        const stride = packedVertices.get(original);
        if (!stride && packedRecords.has(original.buffer)) continue;
        const b = future as Float32Array | Float64Array;
        if (original.length !== b.length) continue;
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
        let entry = this.arrays.get(original);
        if (!entry || entry.stride !== stride) {
          const start = original.slice();
          entry = {
            start,
            end: b,
            out: original,
            stride,
            constant: unchanged,
            startWords: stride
              ? new Uint32Array(start.buffer, start.byteOffset, start.length)
              : null,
            endWords: null,
            outWords: stride
              ? new Uint32Array(original.buffer, original.byteOffset, original.length)
              : null,
          };
          this.arrays.set(original, entry);
        } else entry.start.set(original);
        entry.constant = unchanged;
        entry.end = b;
        if (
          stride &&
          (!entry.endWords ||
            entry.endWords.buffer !== b.buffer ||
            entry.endWords.byteOffset !== b.byteOffset)
        )
          entry.endWords = new Uint32Array(b.buffer, b.byteOffset, b.length);
        this.active.push(entry);
        continue;
      }
      if (ArrayBuffer.isView(original)) continue;
      const a = original as Record<string, unknown>;
      const b = future as Record<string, unknown>;
      const out = a;
      for (const key of Object.keys(a)) {
        const start = a[key];
        const end = b[key];
        if (typeof start !== "number" || typeof end !== "number" || start === end) continue;
        const colour = colourFields.has(key);
        if (!colour && !(scalarFields.has(key) && Number.isFinite(start) && Number.isFinite(end)))
          continue;
        let entry = this.scalars[this.scalarCount++];
        if (!entry) {
          entry = { out, key, start, end, colour };
          this.scalars.push(entry);
        } else {
          entry.out = out;
          entry.key = key;
          entry.start = start;
          entry.end = end;
          entry.colour = colour;
        }
      }
    }
    this.scalars.length = this.scalarCount;
  }
}

interface ArrayInterpolation {
  constant: boolean;
  readonly start: Float32Array | Float64Array;
  end: Float32Array | Float64Array;
  readonly out: Float32Array | Float64Array;
  readonly stride: number | undefined;
  readonly startWords: Uint32Array | null;
  endWords: Uint32Array | null;
  readonly outWords: Uint32Array | null;
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
