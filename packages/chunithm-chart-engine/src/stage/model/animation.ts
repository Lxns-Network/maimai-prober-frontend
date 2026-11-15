import type { StageModel } from "../pack";
import { readCvu, type Cvu, type CvuTrack } from "./cvu";
import { composeAffine, providerLocal } from "./skin";
import { stageProviderNodes } from "./providers";

const f = Math.fround;
const EPSILON = 1.1920928955078125e-7;
const POSITION = 0;
const SCALE = 3;
const QUATERNION = 6;
const ACTIVE = 10;

function fail(message: string): never {
  throw new RangeError(`Stage animation: ${message}`);
}

const bitsView = new DataView(new ArrayBuffer(4));
const asFloat = (word: number) => (
  bitsView.setUint32(0, word >>> 0, true),
  bitsView.getFloat32(0, true)
);

/** A curve of keyed or per-frame sampled values. */
interface KeyedCurve {
  readonly kind: 0 | 1;
  readonly frames: Int32Array;
  readonly modes: Uint8Array;
  readonly values: Float32Array;
  readonly tangents: Float32Array;
}

interface SampledCurve<K extends 2 | 3 = 2 | 3> {
  readonly kind: K;
  readonly values: Float32Array;
}

type Curve = KeyedCurve | SampledCurve<2> | SampledCurve<3>;

export function readCurve(
  cvu: Pick<Cvu, "floatKeys" | "packedKeys" | "floatSamples" | "packedSamples">,
  kind: number,
  start: number,
  count: number,
): Curve {
  if (kind === 2 || kind === 3) {
    const pool = kind === 2 ? cvu.floatSamples : cvu.packedSamples;
    if (start + count > pool.length) fail("curve outside its sample pool");
    const values = Float32Array.from(pool.subarray(start, start + count), (value) =>
      kind === 2 ? value : f(value / 32767),
    );
    if (!values.every(Number.isFinite)) fail("curve sample");
    return kind === 2 ? { kind: 2, values } : { kind: 3, values };
  }
  if (kind !== 0 && kind !== 1) fail(`curve of kind ${kind}`);
  const stride = kind === 0 ? 3 : 2;
  const pool = kind === 0 ? cvu.floatKeys : cvu.packedKeys;
  if ((start + count) * stride > pool.length) fail("curve outside its key pool");
  const frames = new Int32Array(count);
  const modes = new Uint8Array(count);
  const values = new Float32Array(count);
  const tangents = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const at = (start + i) * stride;
    let mode: number;
    if (kind === 0) {
      const packed = pool[at + 2];
      values[i] = asFloat(pool[at]);
      tangents[i] = asFloat(pool[at + 1]);
      frames[i] = packed & 0xffff;
      mode = packed >>> 16;
    } else {
      const packed = pool[at + 1];
      values[i] = f(((packed << 16) >> 16) / 32767);
      tangents[i] = asFloat(pool[at]);
      frames[i] = (packed >>> 16) & 0x3fff;
      mode = packed >>> 30;
    }
    if (!Number.isFinite(values[i]) || !Number.isFinite(tangents[i]) || mode > 3) fail("curve key");
    modes[i] = mode;
    if (i > 0 && frames[i] <= frames[i - 1]) fail("curve frames do not increase");
  }
  return { kind, frames, modes, values, tangents };
}

/** Sample a curve; sampled values wrap at their count and reject unsupported times. */
export function sampleCurve(curve: Curve, frame: number): number {
  const time = f(frame);
  if (curve.kind === 2 || curve.kind === 3) {
    const { values } = curve;
    if (!values.length || !Number.isFinite(time) || time < 0 || time > values.length)
      fail("sample outside its curve");
    const index = Math.trunc(time);
    if (index === values.length) return values[0];
    const fraction = f(time - index);
    if (fraction === 0) return values[index];
    const next = index + 1 === values.length ? 0 : index + 1;
    return f(f(values[index] * f(1 - fraction)) + f(values[next] * fraction));
  }
  const { frames, modes, values, tangents } = curve;
  if (!(time >= frames[0])) fail("sample before the first key");
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (frames[middle] <= time) low = middle;
    else high = middle - 1;
  }
  const a = low;
  const b = low + 1;
  if (b >= frames.length || modes[a] === 2) return values[a];
  if (modes[a] === 3) {
    const left = f(frames[b] - time);
    return f(f(left * values[a]) + f(f(1 - left) * values[b]));
  }
  const dt = f(time - frames[a]);
  const t = f(dt / f(frames[b] - frames[a]));
  const m = f(t - 1);
  const tangent = modes[a] === 1 ? f(-tangents[a]) : tangents[a];
  const termA = f(f(f(f(m + m) - 1) * f(t * t)) * f(values[a] - values[b]));
  const termB = f(f(f(f(tangents[b] * t) + f(tangent * m)) * m) * dt);
  return f(f(termA + termB) + values[a]);
}

const sine = (x: number) => {
  const square = x * x;
  return (
    ((((square * 0.0000027557319223985893 - 0.0001984126984126984) * square +
      0.008333333333333333) *
      square -
      0.16666666666666666) *
      square +
      1) *
    x
  );
};

const cosine = (x: number) => {
  const square = x * x;
  return (
    (((square * 0.0000248015873015873 - 0.001388888888888889) * square + 0.041666666666666664) *
      square -
      0.5) *
      square +
    1
  );
};

/** The quadrant polynomial sine the quaternion interpolation uses. */
function quaternionSine(value: number): number {
  const input = f(value);
  const angle = input < 0 ? 3.141592653589793 - input : input;
  const turns = angle * 0.15915494309189535 + 0.125;
  const reduced = turns - Math.trunc(turns) - 0.125;
  if (reduced < 0.125) return f(sine(reduced * 6.283185307179586));
  if (reduced < 0.375) return f(cosine((reduced - 0.25) * 6.283185307179586));
  if (reduced < 0.625) return -sine((reduced - 0.5) * 6.283185307179586);
  return -cosine((reduced - 0.75) * 6.283185307179586);
}

/** Interpolates from `a` toward `b` with `weight` on `a`, along the shorter arc. */
function slerp(a: readonly number[], b: readonly number[], weight: number): number[] {
  weight = f(weight);
  let dot = f(f(f(f(b[1] * a[1]) + f(b[0] * a[0])) + f(b[2] * a[2])) + f(b[3] * a[3]));
  const sign = dot < 0 ? -1 : 1;
  dot *= sign;
  let left = weight;
  let right = f(1 - weight);
  let operand = a;
  if (EPSILON >= f(dot + 1)) {
    operand = [-b[1], b[0], -b[3], b[2]];
    right = f(quaternionSine(f(f(0.5 - weight) * 3.1415927410125732)));
    left = f(quaternionSine(f(weight * 3.1415927410125732)));
  } else if (EPSILON <= f(1 - dot)) {
    const theta = f(Math.acos(dot));
    const denominator = f(quaternionSine(theta));
    right = f(quaternionSine(f(f(1 - weight) * theta)) / denominator);
    left = f(quaternionSine(f(theta * weight)) / denominator);
  }
  left = f(left * sign);
  return b.map((value, index) =>
    index === 3
      ? f(f(left * operand[index]) + f(right * value))
      : f(f(value * right) + f(left * operand[index])),
  );
}

/** A track with its animated curves decoded. */
interface Track {
  readonly source: CvuTrack;
  readonly position: (Curve | null)[];
  readonly scale: (Curve | null)[];
  readonly quaternion: (Curve | null)[];
  readonly active: Curve | null;
}

/** An animation container with its curves decoded on first use. */
export interface StageAnimation {
  readonly cvu: Cvu;
  tracks(): readonly Track[];
  /** Samples a valid track index at a frame within the animation. */
  sample(index: number, frame: number): StageProviderPose;
}

const animations = new WeakMap<Uint8Array, StageAnimation>();

/** Decodes an animation container, once per resource. */
export function stageAnimation(bytes: Uint8Array): StageAnimation {
  let animation = animations.get(bytes);
  if (animation) return animation;
  const cvu = readCvu(bytes);
  let tracks: Track[] | null = null;
  animation = {
    cvu,
    tracks() {
      if (!tracks)
        tracks = cvu.tracks.map((source) => {
          const curves = (first: number, count: number) =>
            source.descriptors
              .slice(first, first + count)
              .map((d) => (d.active ? readCurve(cvu, d.kind, d.start, d.count) : null));
          return {
            source,
            position: curves(POSITION, 3),
            scale: curves(SCALE, 3),
            quaternion: curves(QUATERNION, 4),
            active: curves(ACTIVE, 1)[0],
          };
        });
      return tracks;
    },
    sample(index, frame) {
      return sampleTrack(this.tracks()[index], frame, cvu.frameCount);
    },
  };
  animations.set(bytes, animation);
  return animation;
}

function vector(curves: (Curve | null)[], rest: readonly number[], time: number): number[] {
  return rest.map((value, i) => {
    const curve = curves[i];
    return curve ? sampleCurve(curve, time) : value;
  });
}

function sampleTrack(track: Track, time: number, frameCount: number): StageProviderPose {
  const position = vector(track.position, track.source.position, time);
  const scale = vector(track.scale, track.source.scale, time);
  let quaternion: number[] = [...track.source.quaternion];
  if (track.source.flags & 2) {
    const left = Math.trunc(time);
    const right = f(time + 1) >= frameCount ? 0 : left + 1;
    const fraction = f(time - left);
    const current = vector(track.quaternion, track.source.quaternion, left);
    quaternion =
      fraction <= EPSILON
        ? current
        : slerp(current, vector(track.quaternion, track.source.quaternion, right), f(1 - fraction));
  }
  if (quaternion[3] < 0) quaternion = quaternion.map((v) => -v);
  return {
    position,
    scale,
    quaternion,
    active: track.active ? sampleCurve(track.active, Math.floor(time)) > 0.5 : true,
  };
}

const lerp = (next: readonly number[], previous: readonly number[], weight: number) =>
  next.map((value, i) => f(f(f(value - previous[i]) * weight) + previous[i]));

/** A provider pose used by the ordered animation write. */
export interface StageProviderPose {
  position: readonly number[];
  quaternion: readonly number[];
  scale: readonly number[];
  readonly active: boolean;
}

/** Blend one record against the current pose, reusing the sampled pose as output. */
export function blendStageProviderPose(
  previous: Pick<StageProviderPose, "position" | "quaternion" | "scale">,
  sample: StageProviderPose,
  weight: number,
): StageProviderPose {
  sample.position = lerp(sample.position, previous.position, f(weight));
  sample.quaternion = slerp(sample.quaternion, previous.quaternion, weight);
  sample.scale = lerp(sample.scale, previous.scale, f(weight));
  return sample;
}

/** The words of a node field as floats. */
function floats(fields: StageModel["nodes"][number]["fields"], key: string, length: number) {
  const value = fields[key] as { words?: number[] } | undefined;
  if (!value?.words || value.words.length !== length) fail(`model node ${key}`);
  return value.words.map(asFloat);
}

interface Rest {
  readonly position: number[];
  readonly quaternion: number[];
  readonly scale: number[];
  readonly parent: number;
  readonly provider: number;
}

const rests = new WeakMap<StageModel, Rest[]>();

function restOf(model: StageModel): Rest[] {
  let rest = rests.get(model);
  if (rest) return rest;
  const providers = stageProviderNodes(model);
  const names = new Map(
    providers.map((index) => [model.nodes[index].fields._name as string, index]),
  );
  const index = new Map(model.nodes.map((node) => [node.ref, node]));
  rest = model.nodes.map((node) => {
    const translation = floats(node.fields, "_translation", 3);
    const quaternion = floats(node.fields, "_quaternion", 4);
    const scale = floats(node.fields, "_scale", 3);
    const parentRef = (node.fields._parent as { ref?: number } | undefined)?.ref;
    if (typeof parentRef !== "number") fail("model node _parent");
    const parentNode = index.get(parentRef);
    const parent = parentRef === 0 ? -1 : (names.get(parentNode?.fields._name as string) ?? -2);
    if (parent === -2) fail("model node parent order");
    return {
      position: translation,
      quaternion,
      scale,
      parent,
      provider: names.get(node.fields._name as string)!,
    };
  });
  rests.set(model, rest);
  return rest;
}

const bindings = new WeakMap<StageModel, WeakMap<Uint8Array, readonly [number, number][]>>();

/** Matched provider and track indices, in animation resource order. */
function bindingOf(
  model: StageModel,
  bytes: Uint8Array,
  animation: StageAnimation,
): readonly [number, number][] {
  let byAnimation = bindings.get(model);
  if (!byAnimation) bindings.set(model, (byAnimation = new WeakMap()));
  const binding = byAnimation.get(bytes);
  if (binding) return binding;
  const byName = new Map<string, number>();
  stageProviderNodes(model).forEach((index) =>
    byName.set(model.nodes[index].fields._name as string, index),
  );
  const matched: [number, number][] = [];
  animation.cvu.tracks.forEach((track, t) => {
    const node = track.name === null ? undefined : byName.get(track.name);
    if (node === undefined) return;
    matched.push([node, t]);
  });
  byAnimation.set(bytes, matched);
  return matched;
}

/** A model's node worlds and node visibility under an animation. */
export interface StageModelPose {
  /** Row-major 3x4 world matrix of each node, in node order. */
  readonly worlds: Float32Array[];
  /** Whether each node draws. */
  readonly active: boolean[];
}

/** Mutable provider values belonging to one scene model instance. */
export interface StageModelProvider {
  poses: StageProviderPose[];
  pose: StageModelPose;
  playback: {
    bytes: Uint8Array;
    samples: StageProviderPose[];
    previous: StageProviderPose[];
    binding: readonly [number, number][];
  } | null;
}

/** Creates a provider at its model's rest pose. */
export function createStageModelProvider(model: StageModel): StageModelProvider {
  const rest = restOf(model);
  const poses = rest.map((node) => ({
    position: [...node.position],
    quaternion: [...node.quaternion],
    scale: [...node.scale],
    active: true,
  }));
  return { poses, pose: providerWorlds(model, rest, poses), playback: null };
}

function providerWorlds(
  model: StageModel,
  rest: readonly Rest[],
  poses: readonly StageProviderPose[],
): StageModelPose {
  const providers = stageProviderNodes(model);
  const worlds: Float32Array[] = new Array(rest.length);
  const active: boolean[] = new Array(rest.length);
  for (const i of providers) {
    const node = rest[i];
    const pose = poses[i];
    const local = providerLocal(pose.position, pose.quaternion, pose.scale);
    active[i] = pose.active;
    worlds[i] =
      node.parent < 0 ? local : composeAffine(worlds[node.parent], local, new Float32Array(12));
  }
  for (let index = 0; index < rest.length; index++) {
    const first = rest[index].provider;
    worlds[index] = worlds[first];
    active[index] = active[first];
  }
  return { worlds, active };
}

/** Applies ordered track writes, blending from retained per-track samples on resource changes. */
export function updateStageModelProvider(
  model: StageModel,
  bytes: Uint8Array,
  frame: number,
  provider: StageModelProvider,
  blendWeight = 1,
): void {
  if (!Number.isFinite(frame)) fail("non-finite frame");
  const animation = stageAnimation(bytes);
  const rest = restOf(model);
  const binding = bindingOf(model, bytes, animation);
  const frameCount = animation.cvu.frameCount;
  const end = frameCount - 1;
  const time = frame <= end ? Math.max(frame, 0) : end;
  let playback = provider.playback;
  if (!playback || playback.bytes !== bytes) {
    const last = new Map<number, StageProviderPose>();
    if (playback) {
      const samples = playback.samples;
      playback.binding.forEach(([node], index) => last.set(node, samples[index]));
    }
    const previous = binding.map(([node]) => last.get(node) ?? provider.poses[node]);
    playback = { bytes, binding, previous, samples: playback ? previous.slice() : previous };
  }
  const samples = binding.map(([, track]) => animation.sample(track, time));
  const blend = blendWeight < 1 && playback.previous !== playback.samples;
  if (blend)
    samples.forEach((sample, index) =>
      blendStageProviderPose(playback.previous[index], sample, blendWeight),
    );
  const poses = provider.poses.slice();
  binding.forEach(([node], index) => {
    poses[node] = blendStageProviderPose(poses[node], { ...samples[index] }, 1);
  });
  const pose = providerWorlds(model, rest, poses);
  provider.poses = poses;
  provider.pose = pose;
  playback.samples = samples;
  if (!blend) playback.previous = samples;
  provider.playback = playback;
}

/** A single animation update starting from the model's rest pose. */
export function animatedPose(model: StageModel, bytes: Uint8Array, frame: number): StageModelPose {
  const provider = createStageModelProvider(model);
  updateStageModelProvider(model, bytes, frame, provider);
  return provider.pose;
}
