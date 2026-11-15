import {
  finishStageScenes,
  stepStageScenes,
  type StageScene,
  type StageSceneOptions,
} from "./runtime";

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
    for (const key of keys) {
      const item = (value as Record<string, unknown>)[key];
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
  /** The scenes stepped to `tick`, resumed from the latest kept copy when that is closer. */
  seek(tick: number): readonly StageScene[];
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
  let every = interval;
  let sampledTick = -1;
  let sampled: StageScene[] = [];
  let interpolate: ((fraction: number) => void)[] = [];
  let displayCopies = new Map<object, unknown>();
  let kept: Kept[] = [];
  let bytes = 0;
  let failure: { readonly cause: unknown } | null = null;
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
    sample(tick, fraction) {
      if (sampledTick === tick) {
        for (const update of interpolate) update(fraction);
        return sampled;
      }
      const live = rewind.seek(tick);
      if (fraction === 0) return live;
      const copies = new Map<object, unknown>();
      sampled = cloneStageScenes(live, copies, displayCopies).map((copy) => copy.scene);
      displayCopies = copies;
      const display = new Map<object, unknown>();
      const next = new Map<object, unknown>();
      for (const [original, copy] of copies) {
        display.set(copy as object, copy);
        next.set(copy as object, original);
      }
      stepStageScenes(live);
      finishStageScenes(live);
      keep(scenes!);
      interpolate = stageInterpolation(display, next);
      sampledTick = tick;
      for (const update of interpolate) update(fraction);
      return sampled;
    },
    seek(tick) {
      if (failure) throw failure.cause;
      if (sampledTick === tick) {
        for (const update of interpolate) update(0);
        return sampled;
      }
      sampledTick = -1;
      sampled = [];
      interpolate = [];
      try {
        let from: Kept | undefined;
        for (const copy of kept) if (copy.tick <= tick) from = copy;
        const current = scenes && scenes[0].tick <= tick ? scenes[0].tick : -1;
        if (from && from.tick > current)
          scenes = cloneStageScenes(from.scenes).map((copy) => copy.scene);
        else if (current < 0) scenes = build();
        const live = scenes!;
        while (live[0].tick < tick) {
          stepStageScenes(live);
          finishStageScenes(live);
          keep(live);
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
function stageInterpolation(display: Map<object, unknown>, next: Map<object, unknown>) {
  const updates: ((fraction: number) => void)[] = [];
  // Publications can replace a pose or camera object while keeping their owning node alive.
  const paired = new Set<object>();
  const align = (original: unknown, future: unknown) => {
    if (
      !original ||
      !future ||
      typeof original !== "object" ||
      typeof future !== "object" ||
      !display.has(original) ||
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
        align((original as Record<string, unknown>)[key], (future as Record<string, unknown>)[key]);
    }
  };
  for (const original of display.keys())
    if ("top" in original && "classState" in original) align(original, next.get(original));
  const scalars = new Set([
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
  const colours = new Set([
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
  const packedVertices = new Map<object, number>();
  for (const original of display.keys()) {
    const value = original as { vertices?: Float32Array; normalVertices?: Float32Array };
    if (value.vertices) packedVertices.set(value.vertices, 6);
    if (value.normalVertices) packedVertices.set(value.normalVertices, 9);
  }
  for (const [original, target] of display) {
    const future = next.get(original);
    if (!future || !target) continue;
    if (original instanceof Float32Array || original instanceof Float64Array) {
      const a = original.slice();
      const b = future as Float32Array;
      const out = target as Float32Array;
      if (a.length !== b.length) continue;
      const stride = packedVertices.get(original);
      const aw = stride ? new Uint32Array(a.buffer, a.byteOffset, a.length) : null;
      const bw = stride ? new Uint32Array(b.buffer, b.byteOffset, b.length) : null;
      const ow = stride ? new Uint32Array(out.buffer, out.byteOffset, out.length) : null;
      updates.push((t) => {
        for (let i = 0; i < a.length; i++) {
          if (stride && i % stride === stride - 3) ow![i] = blendColour(aw![i], bw![i], t);
          else out[i] = a[i] + (b[i] - a[i]) * t;
        }
      });
      continue;
    }
    if (ArrayBuffer.isView(original)) continue;
    const a = original as Record<string, unknown>;
    const b = future as Record<string, unknown>;
    const out = target as Record<string, unknown>;
    for (const key of Object.keys(a)) {
      const start = a[key];
      const end = b[key];
      if (typeof start !== "number" || typeof end !== "number" || start === end) continue;
      if (colours.has(key))
        updates.push((t) => {
          out[key] = blendColour(start, end, t);
        });
      else if (scalars.has(key) && Number.isFinite(start) && Number.isFinite(end))
        updates.push((t) => {
          out[key] = start + (end - start) * t;
        });
    }
  }
  return updates;
}
