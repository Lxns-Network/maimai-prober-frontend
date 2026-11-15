import { advanceEffectRandom, type EffectRandom } from "./random";
import { DEGREES_TO_ANGLE_CODE, sinCosAngleCode } from "../../math/trig";
import {
  billboard,
  cameraFacing,
  multiplyAffine,
  rotateCodes,
  rotateDegrees,
  scaleBy,
  setIdentity,
  translate,
  type EffectCamera,
  type Matrix,
} from "../../math/matrix";
import type {
  AnimationProgram,
  Curve,
  GoalRecord,
  MaterialKey,
  MotionProgram,
  PatternProgram,
} from "./program";

const f = Math.fround;
const EPSILON = f(0.0000001);
const RANDOM_SCALE = f(4.6566129e-10);

/** The shared random cursors: the effect node stream (two words) and the particle stream (one word). */
export interface EffectStreams {
  low: number;
  high: number;
  crt: number;
}

export interface MaterialKeyState {
  elapsed: number;
  duration: number;
  phase: number;
  period: number;
  index: number;
  previousIndex: number;
  cached: number;
  previous: number;
  finished: boolean;
}

export interface MotionState {
  elapsed: number;
  index: number;
  previous: number;
  finished: boolean;
  goalTimes: Float64Array | null;
  goalStates: Uint8Array | null;
  goalValue: Float64Array | null;
  hasPhase: boolean;
  phaseTime: number;
  patternIndex: number;
  patternElapsed: number;
  matrixValues: Float64Array | null;
  matrixIntegrated: Float64Array | null;
  waves: Float64Array | null;
  instanceSelected: number;
  instanceMatrix: Float32Array | null;
  selection: number;
  keys: MaterialKeyState | null;
}

/** The running state of one animated node. */
export interface AnimationState {
  color: number;
  motions: MotionState[];
  /** X and Y offset of each texture element; null until a scroll motion runs. */
  textureOffsets: Float64Array | null;
  /** Rectangle of each texture element; null until a rectangle motion runs. */
  textureUvs: Float64Array | null;
  hasBirth: boolean;
  center: Float64Array;
  angleCode: number;
  hasAngle: boolean;
  randomBeforeLow: number;
  randomBeforeHigh: number;
  positions: Float32Array | null;
}

const RANDOM_CHANNEL_SHIFTS = [16, 8, 0, 24];
const OSCILLATION_CHANNEL_SHIFTS = [0, 8, 16, 24];
const trig = new Float64Array(2);
const uv = new Float64Array(4);
const valueScratch = new Float64Array(3);

function fail(message: string): never {
  throw new RangeError(`Unsupported effect animation: ${message}`);
}

function next31(rng: EffectRandom): number {
  advanceEffectRandom(rng, rng);
  return rng.low & 0x7fffffff;
}

function randomScalar(rng: EffectRandom, start: number, range: number): number {
  return f(f(f(f(next31(rng)) * range) * RANDOM_SCALE) + start);
}

function emptyMotion(): MotionState {
  return {
    elapsed: 0,
    index: 0,
    previous: 0,
    finished: false,
    goalTimes: null,
    goalStates: null,
    goalValue: null,
    hasPhase: false,
    phaseTime: 0,
    patternIndex: 0,
    patternElapsed: 0,
    matrixValues: null,
    matrixIntegrated: null,
    waves: null,
    instanceSelected: -1,
    instanceMatrix: null,
    selection: 0,
    keys: null,
  };
}

function materialTarget(
  state: MaterialKeyState,
  key: MaterialKey,
  delta: number,
  rng: EffectRandom | null,
): void {
  if (key.mode === 0) state.cached = key.color;
  else if (key.mode === 3 && state.index !== state.previousIndex) {
    if (!rng) fail("material random stream");
    let color = 0;
    for (const shift of RANDOM_CHANNEL_SHIFTS) {
      const first = (key.color >>> shift) & 255;
      const last = (key.secondColor >>> shift) & 255;
      let channel = first;
      if (first !== last)
        channel = Math.min(first, last) + (next31(rng) % (Math.abs(first - last) + 1));
      color |= channel << shift;
    }
    state.cached = color >>> 0;
    state.previousIndex = state.index;
  } else if (key.mode === 5) {
    let degrees = Math.abs(state.period) > EPSILON ? f(f(state.phase / state.period) * 360) : 0;
    if (degrees > 360) degrees = f(degrees - f(Math.trunc(Math.trunc(degrees) / 360) * 360));
    sinCosAngleCode(Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE)), trig);
    const sine = trig[0];
    let color = 0;
    for (const shift of OSCILLATION_CHANNEL_SHIFTS) {
      const first = (key.secondColor >>> shift) & 255;
      const last = (key.color >>> shift) & 255;
      color |=
        (Math.trunc(f(f(f(f(last - first) * 0.5) * sine) + f(f(first + last) * 0.5))) & 255) <<
        shift;
    }
    state.cached = color >>> 0;
    state.phase = f(state.phase + delta);
    if (Math.abs(state.period) > EPSILON) state.phase = f(state.phase % state.period);
  }
}

function createMaterialKeys(
  keys: readonly MaterialKey[],
  delta: number,
  rng: EffectRandom | null,
): MaterialKeyState {
  const state: MaterialKeyState = {
    elapsed: 0,
    duration: 0,
    phase: 0,
    period: 0,
    index: 0,
    previousIndex: 0xffffffff,
    cached: 0xffffffff,
    previous: 0xffffffff,
    finished: false,
  };
  if (keys[0].mode === 3) materialTarget(state, keys[0], delta, rng);
  materialTarget(state, keys[keys[0].duration >= EPSILON ? keys.length - 1 : 0], delta, rng);
  state.previous = state.cached;
  state.duration = keys[0].duration;
  state.period = keys[0].period;
  return state;
}

function advanceMaterialKeys(
  keys: readonly MaterialKey[],
  loop: boolean,
  state: MaterialKeyState,
  delta: number,
  rng: EffectRandom | null,
): number {
  let color = state.previous;
  if (!state.finished || keys.length === 1) {
    const key = keys[state.index];
    materialTarget(state, key, delta, rng);
    color = state.cached;
    if (keys.length === 1) state.previousIndex = state.index;
    else {
      if (key.duration > EPSILON) {
        const fraction = Math.min(f(state.elapsed / state.duration), 1);
        color = packedChannels(state.previous, state.cached, fraction);
      }
      state.elapsed = f(state.elapsed + delta);
      if (state.elapsed > state.duration) {
        state.elapsed = delta;
        state.previousIndex = state.index++;
        state.previous = state.cached;
        if (state.index >= keys.length) {
          if (loop) {
            state.index = 0;
            state.elapsed = 0;
          } else {
            state.index = keys.length - 1;
            state.finished = true;
          }
        }
        state.duration = keys[state.index].duration;
        state.period = keys[state.index].period;
      }
    }
  }
  return color;
}

function packedChannels(previous: number, target: number, fraction: number): number {
  let color = 0;
  for (let shift = 0; shift < 32; shift += 8) {
    const channel = f(
      f(f(1 - fraction) * ((previous >>> shift) & 255)) + f(((target >>> shift) & 255) * fraction),
    );
    color |= (Math.trunc(channel) & 255) << shift;
  }
  return color >>> 0;
}

function packedLerp(previous: number, next: number, fraction: number): number {
  if (previous === next) return next;
  return packedChannels(previous, next, fraction);
}

function createPattern(program: PatternProgram, rng: EffectRandom): number {
  let index = program.initial;
  if (index < 0) {
    if (program.first === program.last) index = program.first;
    else {
      index = program.first + (next31(rng) % (program.last - program.first + 1));
    }
  }
  return Math.min(index, program.last);
}

function advancePattern(program: PatternProgram, s: MotionState, delta: number): void {
  const dx = f(1 / f(program.columns));
  const dy = f(1 / f(program.rows));
  const x = f(
    f(
      program.order === 0
        ? s.patternIndex % program.columns
        : Math.trunc(s.patternIndex / program.rows),
    ) * dx,
  );
  const y = f(
    f(
      program.order === 0
        ? Math.trunc(s.patternIndex / program.columns)
        : s.patternIndex % program.rows,
    ) * dy,
  );
  s.patternElapsed = f(s.patternElapsed + delta);
  while (s.patternElapsed >= program.interval) {
    s.patternIndex += program.direction === 0 ? 1 : -1;
    if (s.patternIndex > program.last) s.patternIndex = program.loop ? program.first : program.last;
    if (s.patternIndex < program.first)
      s.patternIndex = program.loop ? program.last : program.first;
    s.patternElapsed = f(s.patternElapsed - program.interval);
  }
  uv[0] = x;
  uv[1] = y;
  uv[2] = f(x + dx);
  uv[3] = f(y + dy);
}

/**
 * Builds the running state of an animated node. The random cursor `rng` advances through every
 * draw the constructors make; it may be null where the program makes none.
 */
export function createAnimation(
  program: AnimationProgram,
  rng: EffectRandom | null,
  delta: number,
): AnimationState {
  const motions: MotionState[] = [];
  for (const motion of program.motions) {
    const s = emptyMotion();
    motions.push(s);
    if (motion.type === 300) {
      s.previous = motion.keys.length
        ? motion.keys[motion.keys[0].duration >= EPSILON ? motion.keys.length - 1 : 0].color
        : 0;
      if (motion.hasOscillation) {
        s.hasPhase = true;
        s.phaseTime = delta;
      }
      if (motion.keyed) s.keys = createMaterialKeys(motion.keys, delta, rng);
    } else if (motion.type === 700) {
      if (!rng) fail("texture selection random stream");
      let ordinal = motion.requested;
      if (ordinal === -1) ordinal = next31(rng) % motion.count;
      s.selection = ordinal;
    } else if (motion.type === 401) {
      if (!rng) fail("texture pattern random stream");
      s.patternIndex = createPattern(motion.pattern, rng);
      s.patternElapsed = 0;
    } else if (motion.type === 100) {
      const records = motion.records;
      s.matrixValues = new Float64Array(records.length * 3);
      if (motion.hasIntegrated) s.matrixIntegrated = new Float64Array(records.length * 3);
      if (motion.hasRandom) {
        for (let j = 0; j < records.length; j++) {
          const record = records[j];
          if (record.mode !== 4 && record.mode !== 5 && record.mode !== 7) {
            s.matrixValues.set(record.value, j * 3);
            continue;
          }
          if (!rng || (record.valueMode !== 2 && record.valueMode !== 3))
            fail("matrix constructor random");
          if (record.mode === 7) {
            if (!s.waves) s.waves = new Float64Array(records.length * 8);
            const low = [0, 1, 2].map((axis) =>
              randomScalar(rng, record.value[axis], record.randomRange[axis]),
            );
            const high = [0, 1, 2].map((axis) =>
              randomScalar(
                rng,
                record.waveHighMin[axis],
                f(record.waveHighMax[axis] - record.waveHighMin[axis]),
              ),
            );
            const period = randomScalar(
              rng,
              record.period[0],
              f(record.period[1] - record.period[0]),
            );
            const phase = randomScalar(rng, record.phase[0], f(record.phase[1] - record.phase[0]));
            if (!(period > 0)) fail("wave period");
            s.matrixValues.set(low, j * 3);
            s.waves.set(low, j * 8);
            s.waves.set(high, j * 8 + 3);
            s.waves[j * 8 + 6] = f(360 / period);
            s.waves[j * 8 + 7] = phase;
          } else if (record.uniformAxes) {
            const value = randomScalar(rng, record.value[0], record.randomRange[0]);
            s.matrixValues[j * 3] = s.matrixValues[j * 3 + 1] = s.matrixValues[j * 3 + 2] = value;
          } else
            for (let axis = 0; axis < 3; axis++)
              s.matrixValues[j * 3 + axis] = randomScalar(
                rng,
                record.value[axis],
                record.randomRange[axis],
              );
        }
      } else for (let j = 0; j < records.length; j++) s.matrixValues.set(records[j].value, j * 3);
    } else if (motion.type === 106) {
      const count = motion.goals.length;
      s.goalTimes = new Float64Array(count);
      s.goalStates = new Uint8Array(count);
      s.goalValue = new Float64Array(3).fill(motion.goals[0].kind === 2 ? 1 : 0);
    } else if (motion.type === 202) s.instanceMatrix = new Float32Array(16);
  }
  const state: AnimationState = {
    color: program.colorInitial,
    motions,
    textureOffsets: null,
    textureUvs: null,
    hasBirth: false,
    center: new Float64Array(3),
    angleCode: 0,
    hasAngle: false,
    randomBeforeLow: 0,
    randomBeforeHigh: 0,
    positions: null,
  };
  if (program.node.type === 100) {
    const primitive = program.primitive!;
    if (!rng) fail("primitive random stream");
    state.hasBirth = true;
    state.randomBeforeLow = rng.low;
    state.randomBeforeHigh = rng.high;
    primitiveCenter(rng, primitive.minimumRadius, primitive.maximumRadius, state.center);
    if (primitive.angleMaximum !== primitive.angleMinimum) {
      state.hasAngle = true;
      state.angleCode =
        (next31(rng) % (primitive.angleMaximum - primitive.angleMinimum + 1)) +
        primitive.angleMinimum;
    }
    state.positions = primitivePositions(program, state);
  }
  return state;
}

function primitiveCenter(
  rng: EffectRandom,
  minimumRadius: number,
  maximumRadius: number,
  out: Float64Array,
): void {
  const radius = f(
    f(f(f(next31(rng)) * f(maximumRadius - minimumRadius)) * RANDOM_SCALE) + minimumRadius,
  );
  for (let i = 0; i < 3; i++) out[i] = f(f(f(f(next31(rng)) * 2) * RANDOM_SCALE) - 1);
  const squared = f(f(f(out[0] * out[0]) + f(out[1] * out[1])) + f(out[2] * out[2]));
  if (Math.abs(squared) >= EPSILON && Math.abs(f(squared - 1)) >= EPSILON) {
    const inverse = f(1 / f(Math.sqrt(squared)));
    for (let i = 0; i < 3; i++) out[i] = f(out[i] * inverse);
  }
  for (let i = 0; i < 3; i++) out[i] = f(out[i] * radius);
}

const CORNERS = [
  [-1, 1, 0, 1],
  [-1, -1, 0, 3],
  [1, 1, 2, 1],
  [1, 1, 2, 1],
  [-1, -1, 0, 3],
  [1, -1, 2, 3],
] as const;

function primitivePositions(program: AnimationProgram, state: AnimationState): Float32Array {
  const { halfWidth, halfHeight } = program.primitive!;
  const positions = new Float32Array(18);
  const angle = state.hasAngle ? state.angleCode : 0;
  if (angle) sinCosAngleCode(angle, trig);
  const sin = trig[0];
  const cos = trig[1];
  for (let k = 0; k < CORNERS.length; k++) {
    const [x, y] = CORNERS[k];
    const offsetX = angle
      ? f(f(x * f(cos * halfWidth)) - f(y * f(sin * halfHeight)))
      : f(x * halfWidth);
    const offsetY = angle
      ? f(f(x * f(sin * halfWidth)) + f(y * f(cos * halfHeight)))
      : f(y * halfHeight);
    positions[k * 3] = f(state.center[0] + offsetX);
    positions[k * 3 + 1] = f(state.center[1] + offsetY);
    positions[k * 3 + 2] = state.center[2];
  }
  return positions;
}

function easing(elapsed: number, duration: number, kind: number, exponent: number): number {
  if (duration <= EPSILON) return 0;
  const fraction = f(elapsed / duration);
  if (kind === 0) return fraction;
  if (kind === 1 || kind === 2) {
    const angle = f(f(elapsed * 90) / duration);
    const degrees = kind === 2 ? f(angle + 270) : angle;
    sinCosAngleCode(Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE)), trig);
    const sine = trig[0];
    return kind === 2 ? f(sine + 1) : sine;
  }
  return f(Math.pow(fraction, kind === 4 ? f(1 / exponent) : exponent));
}

const coefficients = new Float64Array(4);

function polynomial(count: number, time: number): number {
  let value = 0;
  for (let i = count - 1; i >= 0; i--) value = f(f(value * time) + coefficients[i]);
  return value;
}

function cubicRoot(): number | null {
  const epsilon = f(0.000001);
  let low = 0;
  let high = 1;
  let left = polynomial(4, low);
  let right = polynomial(4, high);
  if (Math.abs(left) <= epsilon) return low;
  if (Math.abs(right) <= epsilon) return high;
  const iterations = 2 * Math.ceil(f(f(f(Math.log(f(high - low))) + 6) * f(1.4426950408889634)));
  let root = 0;
  for (let i = 0; i < iterations; i++) {
    root = f(f(low + high) * 0.5);
    const value = polynomial(4, root);
    if (Math.abs(value) <= epsilon) break;
    if (f(value * left) >= 0) {
      if (f(value * right) >= 0) return null;
      low = root;
      left = value;
    } else {
      high = root;
      right = value;
    }
  }
  return root;
}

/** Value of an authored curve at `time`: before the first key, after the last, or interpolated between two. */
export function evaluateCurve(curve: Curve, time: number): number {
  const keys = curve.keys;
  const count = curve.count;
  if (time <= keys[1]) return keys[0];
  let nextIndex = -1;
  for (let i = 0; i < count; i++)
    if (keys[i * 6 + 1] > time) {
      nextIndex = i;
      break;
    }
  if (nextIndex === -1) return keys[(count - 1) * 6];
  const a = (nextIndex - 1) * 6;
  const b = nextIndex * 6;
  const aValue = keys[a];
  const aTime = keys[a + 1];
  const bValue = keys[b];
  const duration = f(keys[b + 1] - aTime);
  const fraction = f(f(time - aTime) / duration);
  if (curve.interpolation === 0) return aValue;
  if (curve.interpolation === 1) return f(f(f(1 - fraction) * aValue) + f(fraction * bValue));
  if (curve.interpolation === 2) {
    const square = f(fraction * fraction);
    const cube2 = f(f(fraction * 2) * square);
    const square3 = f(square * 3);
    return f(f(f(f(cube2 - square3) + 1) * aValue) + f(f(square3 - cube2) * bValue));
  }
  const outgoingX = keys[a + 4] < f(0.001) ? f(0.0000001) : keys[a + 4];
  const incomingX = Math.max(keys[b + 2], f(0.0000001));
  const outTime = f(f(Math.abs(outgoingX) / duration) * duration);
  const inTime = f(f(Math.abs(incomingX) / duration) * duration);
  const outValue = f(f(keys[a + 5] / outgoingX) * outTime);
  const inValue = f(f(keys[b + 3] / incomingX) * inTime);
  const difference = f(bValue - aValue);
  coefficients[0] = f(aTime - time);
  coefficients[1] = outTime;
  coefficients[2] = f(f(f(duration * 3) - f(outTime + outTime)) - inTime);
  coefficients[3] = f(f(outTime - f(duration + duration)) + inTime);
  const root = cubicRoot();
  if (root === null) return aValue;
  coefficients[0] = aValue;
  coefficients[1] = outValue;
  coefficients[2] = f(f(f(difference * 3) - f(outValue * 2)) - inValue);
  coefficients[3] = f(f(outValue - f(difference + difference)) + inValue);
  return polynomial(4, root);
}

/** Result of an instance placement motion applied to `m`; the linear and circular layouts of an instance among its siblings. */
export function applyPlacement(
  motion: Extract<MotionProgram, { type: 200 | 201 }>,
  count: number,
  ordinal: number,
  m: Matrix,
  scratch: Matrix,
  result: Matrix,
): void {
  if (motion.type === 200) {
    const ratio = count > 1 ? f(f(ordinal) / f(count - 1)) : null;
    const t = [0, 1, 2].map((i) =>
      ratio === null
        ? f(f(motion.first[i] + motion.last[i]) * 0.5)
        : f(f(motion.first[i] * f(1 - ratio)) + f(motion.last[i] * ratio)),
    );
    placeTranslate(m, t[0], t[1], t[2]);
    return;
  }
  let code = 0;
  if (count > 1) {
    const difference = f(motion.last - motion.first);
    const open = Math.abs(difference) >= f(0.0000001);
    const degrees = f(
      f(f(1 / f(count - Number(open))) * f(f(ordinal) * (open ? difference : 360))) + motion.first,
    );
    const normalized =
      degrees > 360 ? f(degrees - f(Math.trunc(Math.trunc(degrees) / 360) * 360)) : degrees;
    code = Math.trunc(f(normalized * DEGREES_TO_ANGLE_CODE));
  }
  sinCosAngleCode(code, trig);
  const sin = trig[0];
  const cos = trig[1];
  if (!motion.rotate) {
    const x = f(cos * motion.radius);
    const y = f(sin * motion.radius);
    if (motion.axis === 0) placeTranslate(m, 0, y, x);
    else if (motion.axis === 1) placeTranslate(m, y, 0, x);
    else placeTranslate(m, x, y, 0);
    return;
  }
  setIdentity(scratch);
  const a = motion.axis === 0 ? 4 : 0;
  const b = motion.axis === 2 ? 4 : 8;
  if (code !== 0)
    for (let row = 0; row < 3; row++) {
      const x = scratch[a + row];
      const y = scratch[b + row];
      scratch[a + row] =
        motion.axis === 1 ? f(f(x * cos) - f(y * sin)) : f(f(y * sin) + f(x * cos));
      scratch[b + row] =
        motion.axis === 1 ? f(f(x * sin) + f(y * cos)) : f(f(y * cos) - f(x * sin));
    }
  const column = motion.axis === 2 ? 0 : 8;
  for (let row = 0; row < 3; row++)
    scratch[12 + row] = f(f(scratch[column + row] * motion.radius) + scratch[12 + row]);
  scratch[15] = 1;
  multiplyAffine(m, scratch, result);
  for (let i = 0; i < 16; i++) m[i] = result[i];
}

function placeTranslate(m: Matrix, x: number, y: number, z: number): void {
  for (let row = 0; row < 3; row++)
    m[12 + row] = f(f(f(f(m[row + 4] * y) + f(m[row] * x)) + f(m[row + 8] * z)) + m[12 + row]);
  m[15] = 1;
}

const local = new Float64Array(16);
const scaleMatrix = new Float64Array(16);
const product = new Float64Array(16);
const codes = new Int32Array(3);

function selectInstanceTransform(
  motion: Extract<MotionProgram, { type: 202 }>,
  s: MotionState,
  ordinal: number,
): void {
  s.instanceSelected = ordinal % motion.count;
  const base = s.instanceSelected * 9;
  const rows = motion.rows;
  setIdentity(local);
  local[12] = rows[base];
  local[13] = rows[base + 1];
  local[14] = rows[base + 2];
  for (let k = 0; k < 3; k++) {
    let value = rows[base + 3 + k];
    if (value > 360) value = f(value - f(Math.trunc(Math.trunc(value) / 360) * 360));
    codes[k] = Math.trunc(f(value * DEGREES_TO_ANGLE_CODE));
  }
  rotateCodes(local, codes);
  setIdentity(scaleMatrix);
  for (let i = 0; i < 3; i++) scaleMatrix[i * 5] = rows[base + 6 + i];
  multiplyAffine(local, scaleMatrix, product);
  const out = s.instanceMatrix!;
  for (let i = 0; i < 16; i++) out[i] = product[i];
}

const placementScratch = new Float64Array(16);
const composedScratch = new Float64Array(16);

/** Everything one animation step reads. */
export interface AnimationInput {
  delta: number;
  parentMatrix: Matrix;
  parentColor: number;
  camera: EffectCamera;
  instanceOrdinal: number;
  rng: EffectRandom;
  /** Receives the node's vertices when the node is a primitive or a geometry. */
  vertices: Float32Array | null;
}

/**
 * Advances one animated node by a step: applies each motion in order to the matrix (initially the
 * parent matrix), then writes the node's vertices. Returns the node's state, which a self-reset
 * motion replaces with a freshly built one.
 */
export function advanceAnimation(
  program: AnimationProgram,
  state: AnimationState,
  input: AnimationInput,
  matrix: Matrix,
): AnimationState {
  const { delta, camera, rng } = input;
  for (let i = 0; i < 16; i++) matrix[i] = input.parentMatrix[i];
  let hasUv = false;
  let reset = false;
  const motions = program.motions;
  for (let i = 0; i < motions.length; i++) {
    const motion = motions[i];
    const s = state.motions[i];
    switch (motion.type) {
      case 751:
        reset = !s.finished && s.elapsed >= motion.resetAt;
        s.elapsed = f(s.elapsed + delta);
        if (reset) s.finished = true;
        break;
      case 120:
        cameraFacing(matrix, camera);
        break;
      case 200:
      case 201:
        applyPlacement(
          motion,
          motion.count,
          input.instanceOrdinal,
          matrix,
          placementScratch,
          composedScratch,
        );
        break;
      case 202: {
        if (s.instanceSelected < 0) selectInstanceTransform(motion, s, input.instanceOrdinal);
        multiplyAffine(matrix, s.instanceMatrix!, composedScratch);
        for (let k = 0; k < 16; k++) matrix[k] = composedScratch[k];
        break;
      }
      case 700:
        break;
      case 401:
        advancePattern(motion.pattern, s, delta);
        hasUv = true;
        break;
      case 403: {
        const count = program.elements300.length;
        if (!state.textureOffsets) state.textureOffsets = new Float64Array(count * 2);
        for (let index = 0; index < count; index++)
          if (motion.target === -1 || motion.target === index)
            for (let axis = 0; axis < 2; axis++)
              state.textureOffsets[index * 2 + axis] = motion.relative
                ? f(state.textureOffsets[index * 2 + axis] + f(motion.value[axis] * delta))
                : motion.value[axis];
        s.elapsed = f(s.elapsed + delta);
        break;
      }
      case 402: {
        const count = program.elements300.length;
        if (!state.textureUvs) {
          state.textureUvs = new Float64Array(count * 4);
          for (let index = 0; index < count; index++) {
            state.textureUvs[index * 4 + 2] = 1;
            state.textureUvs[index * 4 + 3] = 1;
          }
        }
        for (let index = 0; index < count; index++)
          if (motion.target === -1 || motion.target === index)
            for (let axis = 0; axis < 4; axis++)
              state.textureUvs[index * 4 + axis] = motion.rect[axis];
        for (let axis = 0; axis < 4; axis++) uv[axis] = state.textureUvs[axis];
        hasUv = true;
        break;
      }
      case 100:
        advanceMatrixMotion(motion, s, delta, camera, rng, matrix);
        break;
      case 1003: {
        let translation = false;
        let rotation = false;
        let scaling = false;
        let tx = 0;
        let ty = 0;
        let tz = 0;
        let rx = 0;
        let ry = 0;
        let rz = 0;
        let sx = 1;
        let sy = 1;
        let sz = 1;
        for (const curve of motion.curves) {
          const value = evaluateCurve(curve, s.elapsed);
          const c = curve.component;
          if (c < 3) {
            if (c === 0) tx = value;
            else if (c === 1) ty = value;
            else tz = value;
            translation = true;
          } else if (c < 6) {
            if (c === 3) rx = value;
            else if (c === 4) ry = value;
            else rz = value;
            rotation = true;
          } else {
            if (c === 6) sx = value;
            else if (c === 7) sy = value;
            else sz = value;
            scaling = true;
          }
        }
        if (translation) translate(matrix, tx, ty, tz);
        if (rotation) rotateDegrees(matrix, rx, ry, rz);
        if (scaling) scaleBy(matrix, sx, sy, sz);
        s.elapsed = f(s.elapsed + delta);
        break;
      }
      case 106:
        advanceGoals(motion.goals, motion.endless, s, delta, matrix);
        break;
      default:
        advanceMaterial(motion, s, state, delta, input.parentColor, rng);
        break;
    }
  }
  const vertices = input.vertices;
  if (program.node.type === 204 && vertices) {
    const geometry = program.geometry!;
    const words = new Uint32Array(vertices.buffer, vertices.byteOffset, vertices.length);
    const u0 = hasUv ? uv[0] : 0;
    const v0 = hasUv ? uv[1] : 0;
    const color = state.color;
    for (let i = 0; i < geometry.count; i++) {
      const at = i * 5;
      const o = i * 6;
      vertices[o] = geometry.values[at + 2];
      vertices[o + 1] = geometry.values[at + 3];
      vertices[o + 2] = geometry.values[at + 4];
      vertices[o + 3] = 0;
      vertices[o + 4] = f(geometry.values[at] + u0);
      vertices[o + 5] = f(geometry.values[at + 1] + v0);
      const original = geometry.colors[i];
      let argb = 0;
      for (let shift = 0; shift < 32; shift += 8)
        argb |=
          Math.trunc((((original >>> shift) & 255) * ((color >>> shift) & 255)) / 255) << shift;
      words[o + 3] = ((argb & 0xff00ff00) | ((argb & 255) << 16) | ((argb >>> 16) & 255)) >>> 0;
    }
  }
  if (program.node.type === 100 && vertices) {
    const words = new Uint32Array(vertices.buffer, vertices.byteOffset, vertices.length);
    const color = state.color;
    const packed = ((color & 0xff00ff00) | ((color & 0xff) << 16) | ((color >>> 16) & 0xff)) >>> 0;
    const u0 = hasUv ? uv[0] : 0;
    const v0 = hasUv ? uv[1] : 0;
    const u1 = hasUv ? uv[2] : 1;
    const v1 = hasUv ? uv[3] : 1;
    const positions = state.positions!;
    for (let k = 0; k < CORNERS.length; k++) {
      const corner = CORNERS[k];
      vertices[k * 6] = positions[k * 3];
      vertices[k * 6 + 1] = positions[k * 3 + 1];
      vertices[k * 6 + 2] = positions[k * 3 + 2];
      words[k * 6 + 3] = packed;
      vertices[k * 6 + 4] = corner[2] === 0 ? u0 : u1;
      vertices[k * 6 + 5] = corner[3] === 1 ? v0 : v1;
    }
  }
  if (!reset) return state;
  const scratch: EffectRandom | null = state.hasBirth
    ? { low: state.randomBeforeLow, high: state.randomBeforeHigh }
    : null;
  const fresh = createAnimation(program, scratch, delta);
  fresh.color = state.color;
  if (state.textureOffsets) fresh.textureOffsets = state.textureOffsets;
  if (state.textureUvs) fresh.textureUvs = state.textureUvs;
  return fresh;
}

function advanceMatrixMotion(
  motion: Extract<MotionProgram, { type: 100 }>,
  s: MotionState,
  delta: number,
  camera: EffectCamera,
  rng: EffectRandom,
  matrix: Matrix,
): void {
  const records = motion.records;
  for (let j = 0; j < records.length; j++) {
    const record = records[j];
    const mode = record.mode;
    const values = s.matrixValues!;
    if ((mode === 4 || mode === 5) && record.valueMode === 3) {
      const first = randomScalar(rng, record.value[0], record.randomRange[0]);
      if (record.uniformAxes) values[j * 3] = values[j * 3 + 1] = values[j * 3 + 2] = first;
      else {
        values[j * 3] = first;
        values[j * 3 + 1] = randomScalar(rng, record.value[1], record.randomRange[1]);
        values[j * 3 + 2] = randomScalar(rng, record.value[2], record.randomRange[2]);
      }
    }
    for (let axis = 0; axis < 3; axis++) {
      const v = mode === 4 || mode === 5 || mode === 7 ? values[j * 3 + axis] : record.value[axis];
      valueScratch[axis] = mode === 1 ? f(v * s.elapsed) : v;
    }
    if (mode === 5) {
      const integrated = s.matrixIntegrated!;
      for (let axis = 0; axis < 3; axis++) {
        valueScratch[axis] = f(integrated[j * 3 + axis] + f(valueScratch[axis] * delta));
        integrated[j * 3 + axis] = valueScratch[axis];
      }
    }
    if (mode === 7) {
      const waves = s.waves!;
      let degrees = f(f(waves[j * 8 + 6] * s.elapsed) + waves[j * 8 + 7]);
      if (degrees > 360) degrees = f(degrees - f(Math.trunc(Math.trunc(degrees) / 360) * 360));
      sinCosAngleCode(Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE)), trig);
      const sine = trig[0];
      for (let axis = 0; axis < 3; axis++) {
        const lo = waves[j * 8 + axis];
        const hi = waves[j * 8 + 3 + axis];
        valueScratch[axis] = f(f(f(f(lo - hi) * 0.5) * sine) + f(f(lo + hi) * 0.5));
      }
    }
    const kind = record.kind;
    if (kind === 100) cameraFacing(matrix, camera);
    else if (kind === 101) billboard(matrix, camera);
    else if (kind === 0) translate(matrix, valueScratch[0], valueScratch[1], valueScratch[2]);
    else if (kind === 1) {
      if (mode === 5) {
        const integrated = s.matrixIntegrated!;
        for (let axis = 0; axis < 3; axis++) {
          valueScratch[axis] = f(valueScratch[axis] % 360);
          integrated[j * 3 + axis] = valueScratch[axis];
        }
      }
      rotateDegrees(matrix, valueScratch[0], valueScratch[1], valueScratch[2]);
    } else if (kind === 2)
      scaleBy(
        matrix,
        mode === 1 ? f(valueScratch[0] + 1) : valueScratch[0],
        mode === 1 ? f(valueScratch[1] + 1) : valueScratch[1],
        mode === 1 ? f(valueScratch[2] + 1) : valueScratch[2],
      );
    else fail("matrix operation");
  }
  s.elapsed = f(s.elapsed + delta);
}

function advanceGoals(
  goals: readonly GoalRecord[],
  endless: boolean,
  s: MotionState,
  delta: number,
  matrix: Matrix,
): void {
  const kind = goals[0].kind;
  const value = s.goalValue!;
  const times = s.goalTimes!;
  const states = s.goalStates!;
  if (!s.finished) {
    value.fill(kind === 2 ? 1 : 0);
    let allFinished = true;
    for (let j = 0; j < goals.length; j++) {
      const key = goals[j];
      if (key.start >= 0) {
        if (s.elapsed < key.start) {
          allFinished = false;
          continue;
        }
        if (states[j] === 0) {
          times[j] = f(s.elapsed - key.start);
          states[j] = 1;
        }
      } else if (j > 0) {
        if (states[j - 1] !== 2) {
          allFinished = false;
          continue;
        }
        if (states[j] === 0) {
          const fraction = f(goals[j - 1].duration - Math.trunc(goals[j - 1].duration));
          times[j] = fraction > EPSILON ? f(delta - fraction) : 0;
          states[j] = 1;
        }
      }
      const elapsed = times[j];
      if (elapsed < key.duration) {
        allFinished = false;
        const fraction = easing(elapsed, key.duration, key.easing, key.exponent);
        for (let k = 0; k < 3; k++)
          value[k] = f(value[k] + f(f(key.target[k] - value[k]) * fraction));
      } else {
        value[0] = key.target[0];
        value[1] = key.target[1];
        value[2] = key.target[2];
        states[j] = 2;
      }
      times[j] = f(elapsed + delta);
    }
    if (allFinished && endless) {
      s.elapsed = 0;
      times.fill(0);
      states.fill(0);
    } else if (allFinished) s.finished = true;
    else s.elapsed = f(s.elapsed + delta);
  }
  if (kind === 2) scaleBy(matrix, value[0], value[1], value[2]);
  else translate(matrix, value[0], value[1], value[2]);
}

const MASKS: readonly (readonly [number, number])[] = [
  [1, 16],
  [2, 8],
  [4, 0],
  [8, 24],
];

function advanceMaterial(
  motion: Extract<MotionProgram, { type: 300 }>,
  s: MotionState,
  state: AnimationState,
  delta: number,
  parentColor: number,
  rng: EffectRandom,
): void {
  const keys = motion.keys;
  const key = keys[s.index];
  let color = s.previous;
  if (s.keys) color = advanceMaterialKeys(keys, motion.loop, s.keys, delta, rng);
  else if (keys.length === 1 && key.mode === 5) {
    let degrees = f(f(s.phaseTime / key.period) * 360);
    if (degrees > 360) degrees = f(degrees - f(f(Math.trunc(Math.trunc(degrees) / 360)) * 360));
    sinCosAngleCode(Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE)), trig);
    const sine = trig[0];
    color = 0;
    for (let shift = 0; shift < 32; shift += 8) {
      const first = (key.secondColor >>> shift) & 255;
      const last = (key.color >>> shift) & 255;
      const value = f(f(f(f(last - first) * 0.5) * sine) + f(f(first + last) * 0.5));
      color |= (Math.trunc(value) & 255) << shift;
    }
    color >>>= 0;
    s.phaseTime = f(f(s.phaseTime + delta) % key.period);
  } else if (!s.finished) {
    color =
      key.duration <= EPSILON
        ? key.color
        : packedLerp(s.previous, key.color, Math.min(f(s.elapsed / key.duration), 1));
    s.elapsed = f(s.elapsed + delta);
    if (s.elapsed > key.duration) {
      s.elapsed = delta;
      s.previous = key.color;
      s.index++;
      if (s.index >= keys.length) {
        if (motion.loop) {
          s.index = 0;
          s.elapsed = 0;
        } else {
          s.index = keys.length - 1;
          s.finished = true;
        }
      }
    }
  }
  if (motion.parentColor) color = parentColor;
  for (const [bit, shift] of MASKS)
    if (motion.mask & bit)
      state.color = ((state.color & ~(255 << shift)) | (color & (255 << shift))) >>> 0;
}
