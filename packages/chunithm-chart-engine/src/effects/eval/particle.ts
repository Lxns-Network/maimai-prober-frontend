import type { EffectResource } from "../afb";
import { nextParticleRandom, nextParticleState, particleRandomRotation } from "./random";
import type { Matrix } from "../../math/matrix";

const f = Math.fround;

/** The authored parameters of a particle node, with the 59 parameter vectors a draw is given before its per-frame fields. */
export interface ParticleProgram {
  readonly rate: number;
  readonly capacity: number;
  readonly lifetime: number;
  readonly timeOffset: number;
  readonly emitMode: number;
  readonly emitLimit: number;
  readonly initiallyEmitting: boolean;
  /** The emission property read each update. */
  readonly property: number;
  /** The ring is drawn back to front. */
  readonly reverse: boolean;
  /** The emitter shape is a box. */
  readonly box: boolean;
  readonly minimumDistance: number;
  readonly maximumDistance: number;
  /** 59 vectors of four floats; the random rotation slot is zero until a node fills it. */
  readonly parameters: Float32Array;
}

/** Offset in `parameters` of the random rotation quaternion. */
const ROTATION_SLOT = 20;
/** Number of floats in the parameters of a particle draw. */
export const PARTICLE_PARAMETER_COUNT = 236;
/** The shared particle pool size used by the Stage and effect players. */
export const DEFAULT_MAXIMUM_PARTICLES = 10000;

function fail(reason: string): never {
  throw new RangeError(`Unsupported particle program: ${reason}`);
}

/** The words and pointers of a scene resource that a particle node's settings are read from. */
export type ParticleSettingsSource = Pick<EffectResource, "u32" | "i32" | "f32" | "pointer">;

export function readParticleProgram(r: ParticleSettingsSource, settings: number): ParticleProgram {
  if (r.i32(settings + 72) !== 0 || [11, 12].includes(r.i32(settings + 48)))
    fail("external coordinate or wrap provider");
  const read = (offset: number) => r.f32(settings + offset);
  const int = (offset: number) => r.i32(settings + offset);
  const array = (offset: number, stride: number) => {
    const count = r.u32(settings + offset);
    const head = r.pointer(settings + offset + 4, count === 0);
    if (count && head === null) fail("missing settings array");
    return Array.from({ length: count }, (_, i) => head! + i * stride);
  };
  const maximum = Math.max(int(104), int(108));
  const minimum = int(108) < 0 ? maximum : Math.min(int(104), int(108));
  const rate = f(f(maximum) / Math.max(read(96), f(0.0001)));
  const lifetime = read(124);
  if (!(rate > 0) || lifetime < 0 || int(84) < 0) fail("positive rate and particle limits");
  const parameters = new Float32Array(59 * 4);
  const set = (index: number, values: readonly number[]) => parameters.set(values, index * 4);
  set(0, [0, f(1 / rate), f(int(68)), f(int(160))]);
  const width = [read(128), read(132) < 0 ? read(128) : read(132)].sort((a, b) => b - a);
  const height = [read(136), read(140) < 0 ? read(136) : read(140)].sort((a, b) => b - a);
  set(1, [
    f(width[0] - width[1]),
    width[1],
    height[0] < 0 ? -1 : f(height[0] - height[1]),
    height[1],
  ]);
  const angle = [144, 148, 152, 156].map((offset) => f(f(int(offset)) * f(0.000095873802)));
  if (angle[1] > angle[0]) [angle[0], angle[1]] = [angle[1], angle[0]];
  if (angle[3] > angle[2]) [angle[2], angle[3]] = [angle[3], angle[2]];
  set(2, [f(angle[0] - angle[1]), angle[1], f(angle[2] - angle[3]), angle[3]]);
  const shape = int(48);
  set(3, [10000, 10000, 10000, 10000]);
  if ([2, 11, 12].includes(shape))
    set(3, [f(read(52) * 0.5), f(read(56) * 0.5), f(read(60) * 0.5), 10000]);
  else {
    parameters[15] = read(52);
    if (shape === 3) parameters[13] = 0;
  }
  parameters[26] = read(100);
  parameters[27] = f(f(maximum - minimum) / f(maximum));
  const color = (value: number) =>
    [(value >>> 16) & 255, (value >>> 8) & 255, value & 255, value >>> 24].map((v) => f(v / 255));
  const colors = array(0, 28).map((at) => ({
    first: color(r.u32(at + 4)),
    last: color(r.u32(at + (r.u32(at) === 1 ? 8 : 4))),
    time: r.f32(at + 16),
  }));
  if (colors.length > 5) fail("at most five color keys");
  for (let i = 0; i < 5; i++) {
    const key = colors[i] ?? colors[colors.length - 1];
    if (key) {
      set(
        8 + i * 2,
        key.first.map((value, j) => f(value - key.last[j])),
      );
      set(9 + i * 2, key.last);
      if (i < colors.length) parameters[i < 4 ? 28 + i : 24] = key.time;
    } else {
      set(8 + i * 2, [1, 1, 1, 1]);
      set(9 + i * 2, [1, 1, 1, 1]);
    }
  }
  const scales = array(8, 32).map((at) => [r.f32(at + 4), r.f32(at + 8), 1, r.f32(at + 20)]);
  if (scales.length > 5) fail("at most five scale keys");
  for (let i = 0; i < 4; i++) {
    const key = scales[i];
    const last = scales[scales.length - 1];
    set(18 + i, key ?? (last ? [last[0], last[1], last[2], 1] : [1, 1, 1, 0]));
  }
  const groups: number[][][] = Array.from({ length: 5 }, () => []);
  for (const at of array(16, 52)) {
    const kind = r.i32(at + 32);
    if (kind === 3) continue;
    const group = kind === 1 ? 1 : kind === 2 ? 2 : 0;
    groups[group].push([
      ...[16, 20, 24, 0, 4, 8].map((offset) => r.f32(at + offset)),
      r.f32(at + 36),
      r.f32(at + 40),
    ]);
  }
  for (const at of array(24, 40))
    groups[3].push([
      ...[16, 20, 24, 0, 4, 8].map((offset) => r.f32(at + offset)),
      r.f32(at + 32),
      r.f32(at + 32),
    ]);
  for (const at of array(32, 8))
    groups[4].push([r.f32(at), 0, 0, 0, 0, 0, r.f32(at + 4), r.f32(at + 4)]);
  for (const [group, keys] of groups.entries()) {
    if (keys.length > 3) fail("at most three motion keys");
    for (let i = 0; i < 3; i++) {
      const key = keys[i] ?? keys[keys.length - 1];
      if (!key) continue;
      const index = 22 + group * 6 + i * 2;
      set(index, [
        f(key[0] - key[3]),
        f(key[1] - key[4]),
        f(key[2] - key[5]),
        i < keys.length ? key[6] : 1,
      ]);
      set(index + 1, [
        key[3],
        key[4],
        key[5],
        i < keys.length ? (key[7] < 0 ? 10000000 : key[7]) : 1,
      ]);
    }
  }
  const columns = int(188);
  const rows = int(192) <= 0 ? columns : int(192);
  const count = int(200) <= 0 ? columns * rows : int(200);
  const interval = read(204) < 0 ? f(lifetime / f(count)) : read(204);
  if (columns <= 0 || rows <= 0 || count <= 0) fail("positive texture pattern dimensions");
  set(54, [f(1 / f(columns)), f(1 / f(rows)), f(Math.min(int(196), 1)), f(count)]);
  parameters[220] = Math.max(interval, f(0.0001));
  parameters[221] = int(208) !== 0 ? 1 : 0;
  return {
    rate,
    capacity: int(84),
    lifetime,
    timeOffset: int(92),
    emitMode: int(112),
    emitLimit: read(116),
    initiallyEmitting: int(88) !== 0,
    property: int(88),
    reverse: int(212) !== 0,
    box: [2, 11, 12].includes(shape),
    minimumDistance: read(220),
    maximumDistance: read(224) > 0 ? read(224) : 1000000000,
    parameters,
  };
}

/** The running state of one particle node. */
export interface ParticleState {
  rotation: Float32Array;
  emitting: boolean;
  /** Start and end of up to four emission intervals, with room for the one that pushes the oldest out. */
  intervals: Float64Array;
  intervalCount: number;
  time: number;
  scale: number;
  matrix: Float32Array;
  previousMatrix: Float32Array;
  /** Two native draw-ring copies of each birth translation and signed-normalized quaternion. */
  births: Float32Array | null;
  birthCursor: number;
  birthWrapped: number;
  birthCapacity: number;
  updated: boolean;
}

const draws = new Float64Array(3);
const rotationOut = new Float32Array(4);

/** Builds a particle node, drawing three values from the particle stream and returning the stream's next state. */
export function createParticleState(
  program: ParticleProgram,
  crt: number,
  maximumParticles = DEFAULT_MAXIMUM_PARTICLES,
): [ParticleState, number] {
  let state = crt;
  for (let i = 0; i < 3; i++) {
    draws[i] = nextParticleRandom(state);
    state = nextParticleState(state);
  }
  particleRandomRotation(draws[0], draws[1], draws[2], rotationOut);
  const intervals = new Float64Array(10);
  const birthCapacity = particleCapacity(program, maximumParticles);
  return [
    {
      rotation: new Float32Array(rotationOut),
      emitting: program.initiallyEmitting,
      intervals,
      intervalCount: 1,
      time: 0,
      scale: 0,
      matrix: new Float32Array(16),
      previousMatrix: new Float32Array(16),
      births: program.parameters[2] === 0 ? null : new Float32Array(birthCapacity * 2 * 7),
      birthCursor: 0,
      birthWrapped: 0,
      birthCapacity,
      updated: false,
    },
    state,
  ];
}

function particleCapacity(program: ParticleProgram, maximumParticles: number): number {
  return 2 * Math.min(Math.trunc(f(program.lifetime * program.rate)), program.capacity) <=
    Math.floor(maximumParticles / 5)
    ? Math.floor(maximumParticles / 5)
    : maximumParticles;
}

const currentQuaternion = new Float32Array(4);
const previousQuaternion = new Float32Array(4);
const birthQuaternion = new Float32Array(4);
const birthRange: ParticleRange = { small: false, start: 0, count: 0, shaderTime: 0 };
const QUATERNION_EPSILON = 1.1920928955078125e-7;

/** Converts the transposed affine matrix passed to the native particle shape. */
function matrixQuaternion(m: Matrix, out: Float32Array): void {
  const x = m[0],
    y = m[5],
    z = m[10];
  const trace = f(f(x + y) + z);
  if (trace >= 0) {
    const root = f(Math.sqrt(f(trace + 1)));
    const factor = f(-0.5 / root);
    out[0] = f(f(m[9] - m[6]) * factor);
    out[1] = f(f(m[2] - m[8]) * factor);
    out[2] = f(f(m[4] - m[1]) * factor);
    out[3] = f(root * 0.5);
  } else if (x >= y && x >= z) {
    const root = f(Math.sqrt(f(f(f(x - y) - z) + 1)));
    const factor = f(0.5 / root);
    out[0] = f(root * 0.5);
    out[1] = f(f(m[1] + m[4]) * factor);
    out[2] = f(f(m[2] + m[8]) * factor);
    out[3] = -f(f(m[9] - m[6]) * factor);
  } else if (y >= z) {
    const root = f(Math.sqrt(f(f(f(y - x) - z) + 1)));
    const factor = f(0.5 / root);
    out[0] = f(f(m[1] + m[4]) * factor);
    out[1] = f(root * 0.5);
    out[2] = f(f(m[6] + m[9]) * factor);
    out[3] = -f(f(m[2] - m[8]) * factor);
  } else {
    const root = f(Math.sqrt(f(f(z - f(x + y)) + 1)));
    const factor = f(0.5 / root);
    out[0] = f(f(m[2] + m[8]) * factor);
    out[1] = f(f(m[6] + m[9]) * factor);
    out[2] = f(root * 0.5);
    out[3] = -f(f(m[4] - m[1]) * factor);
  }
}

/** The native birth record stores a normalized quaternion as four truncated signed 16-bit values. */
function interpolateBirthRotation(
  current: Float32Array,
  previous: Float32Array,
  weight: number,
): void {
  let dot = f(
    f(f(f(previous[1] * current[1]) + f(previous[0] * current[0])) + f(previous[2] * current[2])) +
      f(previous[3] * current[3]),
  );
  const sign = dot < 0 ? -1 : 1;
  dot *= sign;
  let first = weight;
  let second = f(1 - weight);
  if (QUATERNION_EPSILON <= f(1 - dot)) {
    const angle = f(Math.acos(dot));
    const denominator = f(Math.sin(angle));
    second = f(f(Math.sin(f(f(1 - weight) * angle))) / denominator);
    first = f(f(Math.sin(f(weight * angle))) / denominator);
  }
  first = f(first * sign);
  let square = 0;
  for (let i = 0; i < 4; i++) {
    birthQuaternion[i] = f(f(previous[i] * second) + f(first * current[i]));
    square = f(square + f(birthQuaternion[i] * birthQuaternion[i]));
  }
  const norm = f(Math.sqrt(square));
  const inverse = norm === 0 ? 1 : f(1 / norm);
  for (let i = 0; i < 4; i++) {
    const value = norm === 0 ? birthQuaternion[i] : f(birthQuaternion[i] * inverse);
    birthQuaternion[i] = (Math.trunc(f(value * 32767)) | 0) / 32767;
  }
}

function advanceBirths(program: ParticleProgram, state: ParticleState): void {
  const births = state.births;
  if (!births) return;
  particleDrawRangeForCapacity(program, state.time, state.birthCapacity, birthRange);
  const start = program.reverse
    ? 2 * state.birthCapacity - birthRange.start - birthRange.count
    : birthRange.start;
  const end = start + birthRange.count;
  if (end - state.birthCursor < 0) state.birthCursor = state.birthWrapped;
  let count = end - state.birthCursor;
  if (count + end > 2 * state.birthCapacity) count = Math.max(2 * state.birthCapacity - end, 0);
  if (count <= 0) return;
  matrixQuaternion(state.matrix, currentQuaternion);
  matrixQuaternion(state.previousMatrix, previousQuaternion);
  const inverse = f(1 / count);
  const first = program.reverse
    ? 2 * state.birthCapacity - count - state.birthCursor
    : state.birthCursor;
  const copy =
    state.birthCursor < state.birthCapacity
      ? -1
      : program.reverse
        ? first + state.birthCapacity
        : first - state.birthCapacity;
  for (let i = 0; i < count; i++) {
    const weight = f(i * inverse);
    const index = program.reverse ? count - 1 - i : i;
    const at = (first + index) * 7;
    for (let axis = 0; axis < 3; axis++) {
      const previous = state.previousMatrix[12 + axis];
      births[at + axis] = f(f(f(state.matrix[12 + axis] - previous) * weight) + previous);
    }
    interpolateBirthRotation(currentQuaternion, previousQuaternion, weight);
    births.set(birthQuaternion, at + 3);
    if (copy >= 0) births.set(births.subarray(at, at + 7), (copy + index) * 7);
  }
  state.birthWrapped =
    state.birthCursor < state.birthCapacity ? 0 : count + state.birthCursor - state.birthCapacity;
  state.birthCursor = end;
}

/** Advances the emission intervals to the node's age. */
export function advanceEmission(program: ParticleProgram, s: ParticleState, nodeAge: number): void {
  const time = f(f(program.timeOffset) + nodeAge);
  let emitting = program.property === 1;
  if (program.emitMode === 2 && time >= program.emitLimit) emitting = false;
  if (program.emitMode === 1 && f(program.rate * time) > f(program.emitLimit + 1)) {
    emitting = false;
  } else if (emitting) {
    const earliest = Math.max(f(time - program.lifetime), 0);
    let duration = 0;
    for (let i = 0; i < s.intervalCount; i++)
      duration = f(
        Math.max(
          f(Math.min(time, s.intervals[i * 2 + 1]) - Math.max(earliest, s.intervals[i * 2])),
          0,
        ) + duration,
      );
    const count = Math.trunc(f(program.rate * duration));
    if (count >= program.capacity) {
      emitting = false;
      if (s.emitting)
        s.intervals[(s.intervalCount - 1) * 2 + 1] = Math.max(
          f(time - f(f(count - program.capacity) / program.rate)),
          0,
        );
    }
  }
  if (s.emitting !== emitting) {
    if (emitting) {
      s.intervals[s.intervalCount * 2] = time;
      s.intervals[s.intervalCount * 2 + 1] = time;
      s.intervalCount++;
      if (s.intervalCount > 4) {
        s.intervals.copyWithin(0, 2, 10);
        s.intervalCount = 4;
      }
    }
    s.emitting = emitting;
  }
  if (emitting) s.intervals[(s.intervalCount - 1) * 2 + 1] = time;
}

/** Updates a particle node from the matrix its tree node just computed and the node's age. */
export function advanceParticle(
  program: ParticleProgram,
  s: ParticleState,
  age: number,
  matrix: Matrix,
): void {
  const a0 = f(f(matrix[0] + matrix[4]) + matrix[8]);
  const a1 = f(f(matrix[1] + matrix[5]) + matrix[9]);
  const a2 = f(f(matrix[2] + matrix[6]) + matrix[10]);
  const norm = f(Math.sqrt(f(f(f(a0 * a0) + f(a1 * a1)) + f(a2 * a2))));
  advanceEmission(program, s, age);
  if (!s.updated) {
    for (let i = 0; i < 16; i++) s.previousMatrix[i] = matrix[i];
    s.updated = true;
  } else {
    const swap = s.previousMatrix;
    s.previousMatrix = s.matrix;
    s.matrix = swap;
  }
  for (let i = 0; i < 16; i++) s.matrix[i] = matrix[i];
  s.time = f(f(program.timeOffset) + age);
  s.scale = f(norm / f(Math.sqrt(3)));
  advanceBirths(program, s);
}

/** The span of the particle ring a draw covers: which ring, where it starts, how many particles, and the shader's clock. */
export interface ParticleRange {
  small: boolean;
  start: number;
  count: number;
  shaderTime: number;
}

export function particleDrawRange(
  program: ParticleProgram,
  time: number,
  maximumParticles: number,
  out: ParticleRange,
): void {
  const capacity = particleCapacity(program, maximumParticles);
  particleDrawRangeForCapacity(program, time, capacity, out);
  out.small = capacity !== maximumParticles;
}

function particleDrawRangeForCapacity(
  program: ParticleProgram,
  time: number,
  capacity: number,
  out: ParticleRange,
): void {
  const first = Math.trunc(f(program.rate * Math.max(f(time - program.lifetime), 0))) >>> 0;
  const current = f(program.rate * time);
  let count = ((Math.trunc(current) >>> 0) - first) >>> 0;
  let start = first % capacity;
  if (count > capacity) {
    start += count - capacity;
    count = capacity;
  }
  if (start + count > 2 * capacity) count = Math.max(2 * capacity - start, 0);
  out.shaderTime = f(
    f(f(f(start + count) + f(current - f(Math.trunc(current) >>> 0))) / program.rate) -
      f(1 / program.rate),
  );
  out.start = program.reverse ? 2 * capacity - start - count : start;
  out.count = count;
}

/** Index of the tangent ring a draw reads: box shapes first, then small rings, then reversed rings. */
export function particleRingIndex(program: ParticleProgram, range: ParticleRange): number {
  return (program.box ? 4 : 0) + (range.small ? 2 : 0) + (program.reverse ? 1 : 0);
}

/** Writes the 236 floats of a particle draw's parameters for a node colored `color`. */
export function particleFrameParameters(
  program: ParticleProgram,
  s: ParticleState,
  shaderTime: number,
  color: number,
  out: Float32Array,
): void {
  out.set(program.parameters);
  out.set(s.rotation, ROTATION_SLOT);
  out[0] = shaderTime;
  out[16] = f(((color >>> 16) & 255) / 255);
  out[17] = f(((color >>> 8) & 255) / 255);
  out[18] = f((color & 255) / 255);
  out[19] = f((color >>> 24) / 255);
  out.fill(0, 208, 216);
  for (let i = 0; i < s.intervalCount; i++) {
    out[208 + i * 2] = f(s.intervals[i * 2] - s.time);
    out[209 + i * 2] = f(s.intervals[i * 2 + 1] - s.time);
  }
  out.fill(0, 224, 227);
  out.fill(1000000000, 228, 231);
  out.fill(0, 232, 235);
  out[227] = program.minimumDistance;
  out[231] = program.maximumDistance;
  out[223] = s.scale;
}
