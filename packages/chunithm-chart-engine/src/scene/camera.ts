import * as X87 from "../stage/camera/extended";
import type { StageCameraEnvironment } from "../stage/view";
import {
  ANGLE_CODE_TO_DEGREES,
  DEGREES_TO_ANGLE_CODE,
  DEGREES_TO_RADIANS,
  FAR_MINIMUM_GAP,
  lookAt,
  multiply,
  perspective,
  upFromDirection,
  wrapDegrees,
  type FloatEnv,
  type Mat4,
  type Vec3,
} from "../stage/camera/math";

export interface PlayCameraState {
  readonly id: number;
  readonly position: Vec3;
  readonly target: Vec3;
}

/** The camera node: 23 unsigned 32-bit settings words and its states with unique ids. */
export interface PlayCameraResource {
  readonly settings: readonly number[];
  readonly states: readonly PlayCameraState[];
}

/** A property table of 13 entries, each three unsigned 32-bit words, with its dirty flags. */
export interface PlayCameraTable {
  readonly words: readonly (readonly number[])[];
  readonly dirty: readonly number[];
  readonly changed: number;
}

/** The display camera before the first evaluation: its table and its 16-entry matrices. */
export interface PlayCameraSnapshot {
  readonly table: PlayCameraTable;
  readonly view: readonly number[];
  readonly projection: readonly number[];
  readonly viewProjection: readonly number[];
}

export interface PlayCameraInput {
  readonly resource: PlayCameraResource;
  readonly initial: PlayCameraSnapshot;
  readonly state: number;
  readonly world: Vec3;
  readonly environment: FloatEnv;
}

export interface PlayCameraView {
  readonly stageEnvironment: StageCameraEnvironment;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly view: Mat4;
  readonly projection: Mat4;
  readonly viewProjection: Mat4;
  readonly eye: Vec3;
  readonly up: Vec3;
}

const f = Math.fround;
const MXCSR = 0x1f80;
const MAX_DIMENSION = 0x7fffffff;
const SETTINGS_WORDS = 0x17;
const TABLE_ENTRIES = 13;
const MINIMUM_EPSILON = 1.1920928955078125e-7;
const ORTHOGRAPHIC_MODE = 1;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

const SETTING = {
  roll: 0x00,
  relativePath: 0x04,
  projectionMode: 0x08,
  fieldOfView: 0x0c,
  near: 0x10,
  far: 0x14,
  aspectFallback: 0x18,
  worldOffset: 0x2c,
  aspectWidth: 0x38,
  aspectHeight: 0x3c,
  aspectEnabled: 0x40,
  referenceNodeA: 0x44,
  referenceNodeB: 0x50,
} as const;

const ENTRY = {
  near: 0,
  far: 1,
  fieldOfView: 2,
  aspect: 3,
  perspective: 6,
  keepDirty: 7,
  position: 8,
  target: 9,
  up: 10,
  offsetX: 11,
  offsetY: 12,
} as const;
const PROJECTION_ENTRIES = [0, 1, 2, 3, 4, 5, 6, 11, 12];
const VIEW_ENTRIES = [8, 9, 10];

const scratch = new DataView(new ArrayBuffer(4));
const bitsToFloat = (bits: number): number => {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
};
const floatToBits = (value: number): number => {
  scratch.setFloat32(0, value, true);
  return scratch.getUint32(0, true);
};

function truncateToInt32(x: number): number {
  if (!(x > -2147483649 && x < 2147483648)) return -2147483648;
  return Math.trunc(x) | 0;
}

function requireLength(values: ArrayLike<unknown>, length: number, what: string): void {
  if (!values || values.length !== length)
    throw new RangeError(`${what} must have ${length} entries`);
}

function requireEnvironment(environment: FloatEnv): void {
  if (!environment || environment.mxcsr !== MXCSR)
    throw new RangeError(`Unsupported SIMD control word ${environment?.mxcsr}`);
  X87.precisionBits(environment.fpcw);
}

function requireDimension(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DIMENSION)
    throw new RangeError(`The canvas ${name} must be a positive integer, got ${value}`);
  return value;
}

interface Table {
  words: number[][];
  dirty: number[];
  changed: number;
}

interface DisplayCamera {
  table: Table;
  view: Mat4;
  projection: Mat4;
  viewProjection: Mat4;
}

interface CameraParameters {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  roll: number;
  projectionMode: number;
  fieldOfViewCode: number;
  aspect: number;
  offsetX: number;
  offsetY: number;
  near: number;
  far: number;
}

const floatAt = (t: Table, i: number): number => bitsToFloat(t.words[i][0]);

const vec3At = (t: Table, i: number): Vec3 => {
  const w = t.words[i];
  return [bitsToFloat(w[0]), bitsToFloat(w[1]), bitsToFloat(w[2])];
};

function markDirty(t: Table, i: number): void {
  t.dirty[i] = 1;
  t.changed = 1;
}

function setFloat(t: Table, i: number, value: number): void {
  if (bitsToFloat(t.words[i][0]) === value) return;
  markDirty(t, i);
  t.words[i][0] = floatToBits(value);
}

function setVec3(t: Table, i: number, value: Vec3): void {
  const w = t.words[i];
  if (
    bitsToFloat(w[0]) === value[0] &&
    bitsToFloat(w[1]) === value[1] &&
    bitsToFloat(w[2]) === value[2]
  )
    return;
  markDirty(t, i);
  w[0] = floatToBits(value[0]);
  w[1] = floatToBits(value[1]);
  w[2] = floatToBits(value[2]);
}

function setBool(t: Table, i: number, value: 0 | 1): void {
  if (t.words[i][0] === value) return;
  markDirty(t, i);
  t.words[i][0] = value;
}

function fromSnapshot(snapshot: PlayCameraSnapshot): DisplayCamera {
  requireLength(snapshot.table.words, TABLE_ENTRIES, "The camera table");
  for (const word of snapshot.table.words) requireLength(word, 3, "A camera table entry");
  requireLength(snapshot.table.dirty, TABLE_ENTRIES, "The camera dirty flags");
  requireLength(snapshot.view, 16, "The camera view");
  requireLength(snapshot.projection, 16, "The camera projection");
  requireLength(snapshot.viewProjection, 16, "The camera view-projection");
  return {
    table: {
      words: snapshot.table.words.map((w) => w.map((x) => x >>> 0)),
      dirty: [...snapshot.table.dirty],
      changed: snapshot.table.changed,
    },
    view: Float32Array.from(snapshot.view),
    projection: Float32Array.from(snapshot.projection),
    viewProjection: Float32Array.from(snapshot.viewProjection),
  };
}

// Kept as a matrix sum: the signed zeros it produces differ from a plain copy of the translation.
function translateIdentity(t: Vec3): Vec3 {
  const m = IDENTITY;
  return [
    f(f(f(f(m[4] * t[1]) + f(m[0] * t[0])) + f(m[8] * t[2])) + m[12]),
    f(f(f(f(m[1] * t[0]) + f(m[5] * t[1])) + f(m[9] * t[2])) + m[13]),
    f(f(f(f(m[2] * t[0]) + f(m[6] * t[1])) + f(m[10] * t[2])) + m[14]),
  ];
}

const addWorld = (world: Vec3, p: Vec3): Vec3 => [
  f(world[0] + p[0]),
  f(world[1] + p[1]),
  f(world[2] + p[2]),
];

function multiplyExtended(
  a: X87.ExtendedValue,
  b: X87.ExtendedValue,
  bits: number,
): X87.ExtendedValue {
  if (a.k === "nan" || b.k === "nan") return { k: "nan", s: 1 };
  const s = a.s ^ b.s;
  if ((a.k === "inf" && b.k === "zero") || (a.k === "zero" && b.k === "inf"))
    return { k: "nan", s: 1 };
  if (a.k === "inf" || b.k === "inf") return { k: "inf", s };
  if (a.k !== "fin" || b.k !== "fin") return { k: "zero", s };
  return X87.add({ k: "fin", s, m: a.m * b.m, e: a.e + b.e }, { k: "zero", s: 0 }, bits);
}

function projectionFromTable(t: Table, env: FloatEnv): Mat4 {
  const bits = X87.precisionBits(env.fpcw);
  const fov = X87.toFloat32(
    multiplyExtended(
      X87.fromNumber(floatAt(t, ENTRY.fieldOfView)),
      X87.fromNumber(DEGREES_TO_RADIANS),
      bits,
    ),
  );
  const near = floatAt(t, ENTRY.near);
  const far = floatAt(t, ENTRY.far);
  const floor = f(near + FAR_MINIMUM_GAP);
  const limitedFar = far > floor ? far : floor;
  const m = perspective(fov, floatAt(t, ENTRY.aspect), near, limitedFar, env);
  m[2] = floatAt(t, ENTRY.offsetX);
  m[6] = floatAt(t, ENTRY.offsetY);
  return m;
}

function updateDisplayCamera(cam: DisplayCamera, env: FloatEnv): void {
  const t = cam.table;
  if (t.changed) {
    if (PROJECTION_ENTRIES.some((i) => t.dirty[i])) {
      cam.projection = projectionFromTable(t, env);
      cam.viewProjection = multiply(cam.projection, cam.view, env);
    }
    if (VIEW_ENTRIES.some((i) => t.dirty[i])) {
      const eye = vec3At(t, ENTRY.position);
      const at = vec3At(t, ENTRY.target);
      const up = vec3At(t, ENTRY.up);
      const dx = f(at[0] - eye[0]);
      const dy = f(at[1] - eye[1]);
      const dz = f(at[2] - eye[2]);
      const length = f(Math.sqrt(f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz))));
      if (MINIMUM_EPSILON > length) eye[2] = f(eye[2] + FAR_MINIMUM_GAP);
      cam.view = lookAt(eye, at, up, env);
      cam.viewProjection = multiply(cam.projection, cam.view, env);
    }
  }
  const keep = t.dirty[ENTRY.keepDirty];
  t.dirty.fill(0);
  if (keep) markDirty(t, ENTRY.keepDirty);
}

function setAspect(cam: DisplayCamera, width: number, height: number): void {
  setFloat(cam.table, ENTRY.aspect, f(f(width) / f(height)));
}

function readBack(t: Table, env: FloatEnv) {
  return {
    fieldOfViewCode: truncateToInt32(
      f(wrapDegrees(floatAt(t, ENTRY.fieldOfView), env) * DEGREES_TO_ANGLE_CODE),
    ),
    near: floatAt(t, ENTRY.near),
    far: floatAt(t, ENTRY.far),
    aspect: floatAt(t, ENTRY.aspect),
    offsetX: floatAt(t, ENTRY.offsetX),
    offsetY: floatAt(t, ENTRY.offsetY),
  };
}

function nodeParameters(
  resource: PlayCameraResource,
  state: PlayCameraState,
  world: Vec3,
  base: ReturnType<typeof readBack>,
  env: FloatEnv,
): CameraParameters {
  const settings = resource.settings;
  const word = (offset: number) => settings[offset >> 2];
  const float = (offset: number) => bitsToFloat(word(offset));
  if (word(SETTING.relativePath) !== 0)
    throw new RangeError("Relative camera paths are not supported");
  if ((word(SETTING.referenceNodeA) | 0) >= 0 || (word(SETTING.referenceNodeB) | 0) >= 0)
    throw new RangeError("Cameras with reference nodes are not supported");
  let position = translateIdentity(state.position);
  let target = translateIdentity(state.target);
  if (word(SETTING.worldOffset) === 0) {
    position = addWorld(world, position);
    target = addWorld(world, target);
  }
  const p: CameraParameters = {
    position,
    target,
    up: upFromDirection(position, target, [0, 1, 0], null, env),
    roll: 0,
    projectionMode: word(SETTING.projectionMode) | 0,
    fieldOfViewCode: base.fieldOfViewCode,
    aspect: base.aspect,
    offsetX: base.offsetX,
    offsetY: base.offsetY,
    near: base.near,
    far: base.far,
  };
  if (float(SETTING.fieldOfView) >= 0)
    p.fieldOfViewCode = truncateToInt32(
      f(wrapDegrees(float(SETTING.fieldOfView), env) * DEGREES_TO_ANGLE_CODE),
    );
  if (float(SETTING.near) >= 0) p.near = float(SETTING.near);
  if (float(SETTING.far) >= 0) p.far = float(SETTING.far);
  if (word(SETTING.worldOffset) !== 0 && word(SETTING.aspectEnabled) !== 0)
    p.aspect = f(float(SETTING.aspectWidth) / float(SETTING.aspectHeight));
  else if (float(SETTING.aspectFallback) > 0) p.aspect = float(SETTING.aspectFallback);
  if (float(SETTING.roll) >= 0)
    p.roll = truncateToInt32(f(wrapDegrees(float(SETTING.roll), env) * DEGREES_TO_ANGLE_CODE));
  return p;
}

function effectiveUp(c: CameraParameters, env: FloatEnv): Vec3 {
  if ((c.roll | 0) === 0) return [c.up[0], c.up[1], c.up[2]];
  return upFromDirection(
    c.position,
    c.target,
    [f(c.up[0] * 0), c.up[1], f(c.up[2] * 0)],
    c.roll,
    env,
  );
}

function applyParameters(c: CameraParameters, cam: DisplayCamera, env: FloatEnv): void {
  const t = cam.table;
  setVec3(t, ENTRY.position, c.position);
  setVec3(t, ENTRY.target, c.target);
  setVec3(t, ENTRY.up, effectiveUp(c, env));
  setFloat(t, ENTRY.near, c.near);
  setFloat(t, ENTRY.far, c.far);
  if (t.words[ENTRY.perspective][0] === 0) setBool(t, ENTRY.perspective, 1);
  setFloat(t, ENTRY.fieldOfView, f(f(c.fieldOfViewCode | 0) * ANGLE_CODE_TO_DEGREES));
  setFloat(t, ENTRY.aspect, c.aspect);
  setFloat(t, ENTRY.offsetX, c.offsetX);
  setFloat(t, ENTRY.offsetY, c.offsetY);
  updateDisplayCamera(cam, env);
}

/**
 * The play camera's view, projection and effect inputs for one state at one canvas size.
 *
 * The camera is evaluated from the snapshot exactly as the display camera would: the canvas aspect is
 * written first, the node's settings and state are applied, and the matrices are rebuilt only for the
 * table entries that changed.
 */
export function evaluatePlayCamera(
  input: PlayCameraInput,
  width: number,
  height: number,
): PlayCameraView {
  requireEnvironment(input.environment);
  const viewport = {
    width: requireDimension(width, "width"),
    height: requireDimension(height, "height"),
  };
  requireLength(input.resource.settings, SETTINGS_WORDS, "The camera settings");
  const state = input.resource.states.find((s) => s.id === input.state);
  if (!state) throw new RangeError(`The camera resource has no state ${input.state}`);
  const cam = fromSnapshot(input.initial);
  setAspect(cam, viewport.width, viewport.height);
  const params = nodeParameters(
    input.resource,
    state,
    input.world,
    readBack(cam.table, input.environment),
    input.environment,
  );
  if (params.projectionMode === ORTHOGRAPHIC_MODE)
    throw new RangeError("Orthographic play cameras are not supported");
  applyParameters(params, cam, input.environment);
  return {
    stageEnvironment: {
      eye: params.position,
      target: params.target,
      up: effectiveUp(params, input.environment),
      fovCode: params.fieldOfViewCode,
      near: params.near,
      far: params.far,
      aspect: params.aspect,
      rollCode: 0,
      offsetX: params.offsetX,
      offsetY: params.offsetY,
    },
    viewport,
    view: Float32Array.from(cam.view),
    projection: Float32Array.from(cam.projection),
    viewProjection: Float32Array.from(cam.viewProjection),
    eye: params.position,
    up: params.up,
  };
}
