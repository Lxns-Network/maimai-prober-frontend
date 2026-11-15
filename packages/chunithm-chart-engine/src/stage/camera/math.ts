import { atan2Float32 } from "./arctangent";
import * as X87 from "./extended";

const f = Math.fround;

/** Floating-point environment of the extended-precision steps (round to nearest only). */
export interface FloatEnv {
  fpcw: number;
  mxcsr: number;
}

/** A row-major matrix with column vectors (translation in m[3], m[7], m[11]); clip depth [0, 1]. */
export type Mat4 = Float32Array;
export type Vec3 = [number, number, number];

const ONE = 1;
const HALF = 0.5;
const EPSILON = 1.1920928955078125e-7;
const LENGTH_TOLERANCE = 1.0000000116860974e-7;
const ANGLE_CODE_TO_RADIANS = 0.0000958738019107841;
const FULL_TURN = 360;
const YAW_TO_ANGLE_CODE = 10430.3779296875;
const PITCH_TO_ANGLE_CODE = -10430.3779296875;
const SIN_CUBIC = 0.008333333767950535;
const SIN_LINEAR = 0.1666666716337204;
const COS_QUARTIC = 0.0013888889225199819;
const COS_QUADRATIC = 0.0416666679084301;
export const DEGREES_TO_ANGLE_CODE = 182.04444885253906;
export const ANGLE_CODE_TO_DEGREES = 0.0054931640625;
export const DEGREES_TO_RADIANS = 0.01745329238474369;
export const FAR_MINIMUM_GAP = 0.00009999999747378752;
const TANGENT_INVERSE_PI = 0.3183098861837907;
const TANGENT_PI = 3.141592653589793;
const TANGENT_SPLIT = [0, 0.5, 0.25, 0.75, -0.5, -0.25, -0.75];
const TANGENT_COEFFICIENTS = [
  0.00003927832388331683, 0.00009691537956929451, 0.00023912911424355248, 0.000590027440945586,
  0.0014558343870513183, 0.003592128036572481, 0.008863235529902197, 0.021869488536155203,
  0.05396825396825397, 0.13333333333333333, 0.3333333333333333,
];
const PERSPECTIVE_W = -1;
const WRAP_MAGIC = 3054198967 | 0;
const WRAP_SHIFT = 8;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function truncateToInt32(x: number): number {
  if (!(x > -2147483649 && x < 2147483648)) return -2147483648;
  return Math.trunc(x) | 0;
}

function precision(env: FloatEnv, extended: boolean): number {
  if (!env || env.mxcsr !== 0x1f80) throw new Error(`Unsupported SIMD control word ${env?.mxcsr}`);
  return extended ? X87.precisionBits(env.fpcw) : 0;
}

function tangentCore(a: number): number {
  const x = a * TANGENT_PI;
  const x2 = x * x;
  const c = TANGENT_COEFFICIENTS;
  let p = x2 * c[0];
  for (let i = 1; i < c.length; i++) {
    p = p + c[i];
    p = p * x2;
  }
  p = p + 1;
  return p * x;
}

/** Tangent of a float32 argument as an extended-precision value. */
export function tangentExtended(x: number, env: FloatEnv): X87.ExtendedValue {
  const bits = precision(env, true);
  if (f(x) !== x && !Number.isNaN(x)) throw new TypeError("The argument must be a float32 value");
  const [s0, s1, s2, s3, s4, s5, s6] = TANGENT_SPLIT;
  const t = x * TANGENT_INVERSE_PI;
  const n = !(t > -2147483649 && t < 2147483648) ? -2147483648 : Math.trunc(t) | 0;
  const r = t - n;
  const one = X87.fromNumber(1);
  const core = (a: number) => X87.fromNumber(tangentCore(a));
  const reciprocal = (a: number) => X87.divide(one, core(a), bits);
  const negativeReciprocal = (a: number) => X87.divide(X87.fromNumber(-1), core(a), bits);
  if (r >= s0) {
    if (s1 >= r) {
      if (s2 >= r) return core(r);
      return reciprocal(s1 - r);
    }
    if (s3 >= r) return negativeReciprocal(r - s1);
    return core(r - 1);
  }
  if (r >= s4) {
    if (r >= s5) return core(r);
    return reciprocal(s4 - r);
  }
  if (r >= s6) return negativeReciprocal(r + s1);
  return core(r + 1);
}

/** Perspective projection; the field of view is in radians. */
export function perspective(
  fov: number,
  aspect: number,
  near: number,
  far: number,
  env: FloatEnv,
): Mat4 {
  const bits = precision(env, true);
  const m = new Float32Array(16);
  const h = f(fov * HALF);
  const ys = X87.toFloat32(X87.divide(X87.fromNumber(1), tangentExtended(h, env), bits));
  m[14] = PERSPECTIVE_W;
  m[5] = ys;
  m[0] = f(ys / aspect);
  const r = f(ONE / f(near - far));
  m[11] = f(f(near * far) * r);
  m[10] = f(r * far);
  return m;
}

/** Parallel projection with top-down display bounds and the renderer's forward [0, 1] depth. */
export function orthographic(
  left: number,
  right: number,
  top: number,
  bottom: number,
  near: number,
  far: number,
): Mat4 {
  const m = new Float32Array(16);
  const horizontal = f(1 / f(right - left));
  const vertical = f(1 / f(top - bottom));
  const depth = f(1 / f(far - near));
  m[0] = f(horizontal + horizontal);
  m[3] = -f(f(left + right) * horizontal);
  m[5] = f(vertical + vertical);
  m[7] = -f(f(top + bottom) * vertical);
  m[10] = -depth;
  m[11] = f(1 - f(depth * far));
  m[15] = 1;
  return m;
}

/** Right-handed look-at; an up vector below machine epsilon in all components becomes (0, 1, 0). */
export function lookAt(eye: Vec3, at: Vec3, up: Vec3, env: FloatEnv): Mat4 {
  return cameraViewMatrix(eye, at, up, env, true);
}

/** Builds the direct view matrix with unconditional axis normalization. */
export function normalizedLookAt(eye: Vec3, at: Vec3, up: Vec3, env: FloatEnv): Mat4 {
  return cameraViewMatrix(eye, at, up, env, false);
}

/** Scene camera refresh separates coincident eye/target positions and always normalizes both axes. */
export function sceneLookAt(eye: Vec3, at: Vec3, up: Vec3, env: FloatEnv): Mat4 {
  const delta = eye.map((value, axis) => f(value - at[axis]));
  const length = f(
    Math.sqrt(f(f(f(delta[0] * delta[0]) + f(delta[1] * delta[1])) + f(delta[2] * delta[2]))),
  );
  const position: Vec3 = length < EPSILON ? [eye[0], eye[1], f(eye[2] + FAR_MINIMUM_GAP)] : eye;
  return normalizedLookAt(position, at, up, env);
}

function cameraViewMatrix(
  eye: Vec3,
  at: Vec3,
  up: Vec3,
  env: FloatEnv,
  preserveShortAxes: boolean,
): Mat4 {
  precision(env, false);
  const abs = (v: number) => (0 > v ? -v : v);
  let ux: number, uy: number, uz: number;
  if (EPSILON > abs(up[0]) && EPSILON > abs(up[1]) && EPSILON > abs(up[2]))
    [ux, uy, uz] = [0, 1, 0];
  else [ux, uy, uz] = up;
  const dx = f(eye[0] - at[0]);
  const dy = f(eye[1] - at[1]);
  const dz = f(eye[2] - at[2]);
  const length = f(f(f(dx * dx) + f(dy * dy)) + f(dz * dz));
  const inv =
    preserveShortAxes &&
    (Math.abs(length) < LENGTH_TOLERANCE || Math.abs(f(length - ONE)) < LENGTH_TOLERANCE)
      ? ONE
      : f(ONE / f(Math.sqrt(length)));
  const zz = f(inv * dz);
  const zy = f(inv * dy);
  const zx = f(inv * dx);
  const cx = f(f(zz * uy) - f(zy * uz));
  const cy = f(f(zx * uz) - f(zz * ux));
  const cz = f(f(zy * ux) - f(zx * uy));
  const crossLength = f(f(f(cx * cx) + f(cy * cy)) + f(cz * cz));
  const inv2 =
    preserveShortAxes &&
    (Math.abs(crossLength) < LENGTH_TOLERANCE || Math.abs(f(crossLength - ONE)) < LENGTH_TOLERANCE)
      ? ONE
      : f(ONE / f(Math.sqrt(crossLength)));
  const xx = f(inv2 * cx);
  const xz = f(inv2 * cz);
  const xy = f(inv2 * cy);
  const yx = f(f(zy * xz) - f(zz * xy));
  const yy = f(f(zz * xx) - f(zx * xz));
  const yz = f(f(zx * xy) - f(zy * xx));
  const m = new Float32Array(16);
  m[0] = xx;
  m[1] = xy;
  m[2] = xz;
  m[3] = f(f(f(-xy * eye[1]) + f(-xx * eye[0])) + f(-xz * eye[2]));
  m[4] = yx;
  m[5] = yy;
  m[6] = yz;
  m[7] = f(f(f(-yy * eye[1]) + f(-yx * eye[0])) + f(-yz * eye[2]));
  m[8] = zx;
  m[9] = zy;
  m[10] = zz;
  m[11] = f(f(f(-zy * eye[1]) + f(-zx * eye[0])) + f(-zz * eye[2]));
  m[15] = 1;
  return m;
}

/** Row-major product a·b, each element summed as ((a3b3 + a2b2) + (a1b1 + a0b0)). */
export function multiply(a: Mat4, b: Mat4, env: FloatEnv): Mat4 {
  precision(env, false);
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      const t32 = f(f(a[4 * i + 3] * b[12 + j]) + f(a[4 * i + 2] * b[8 + j]));
      const t10 = f(f(a[4 * i + 1] * b[4 + j]) + f(a[4 * i] * b[j]));
      o[4 * i + j] = f(t32 + t10);
    }
  return o;
}

/** Sine and cosine of a 16-bit angle code. */
export function sinCosCode(angle: number): { sin: number; cos: number } {
  const a = angle | 0;
  const lo = a & 0xffff;
  const q = a & 0xe000;
  const rad = (n: number) => f(f(n) * ANGLE_CODE_TO_RADIANS);
  const sinp = (x: number) => {
    const x2 = f(x * x);
    return f(f(ONE - f(f(SIN_LINEAR - f(x2 * SIN_CUBIC)) * x2)) * x);
  };
  const cosp = (x: number) => {
    const x2 = f(x * x);
    return f(f(f(f(f(COS_QUADRATIC - f(x2 * COS_QUARTIC)) * x2) - HALF) * x2) + ONE);
  };
  if (q > 0x8000) {
    if (q === 0xe000) {
      const x = rad(lo - 65536);
      return { sin: sinp(x), cos: cosp(x) };
    }
    const x = rad(lo - 49152);
    return { sin: -cosp(x), cos: sinp(x) };
  }
  if (q === 0x8000 || q === 0x6000) {
    const x = rad(lo - 32768);
    return { sin: -sinp(x), cos: -cosp(x) };
  }
  if (q === 0x2000 || q === 0x4000) {
    const x = rad(lo - 16384);
    return { sin: cosp(x), cos: -sinp(x) };
  }
  const x = rad(lo);
  return { sin: sinp(x), cos: cosp(x) };
}

/** The up vector derived from the view direction: yaw, pitch and optional roll applied to `source`. */
export function upFromDirection(
  position: Vec3,
  target: Vec3,
  source: Vec3,
  roll: number | null,
  env: FloatEnv,
): Vec3 {
  precision(env, false);
  const dx = f(target[0] - position[0]);
  const dz = f(target[2] - position[2]);
  const dy = f(target[1] - position[1]);
  const yaw = truncateToInt32(f(atan2Float32(dx, dz) * YAW_TO_ANGLE_CODE));
  const hxz = f(Math.sqrt(f(f(dz * dz) + f(dx * dx))));
  const pitch = truncateToInt32(f(atan2Float32(dy, hxz) * PITCH_TO_ANGLE_CODE));
  const I = IDENTITY;
  let [r00, r01, r02, r10, r11, r12, r20, r21, r22] = [
    I[0],
    I[1],
    I[2],
    I[4],
    I[5],
    I[6],
    I[8],
    I[9],
    I[10],
  ];
  if (yaw !== 0) {
    const { sin: s, cos: c } = sinCosCode(yaw);
    [r00, r20] = [f(f(r00 * c) - f(r20 * s)), f(f(r00 * s) + f(r20 * c))];
    [r01, r21] = [f(f(r01 * c) - f(r21 * s)), f(f(r21 * c) + f(r01 * s))];
    [r02, r22] = [f(f(r02 * c) - f(r22 * s)), f(f(r02 * s) + f(r22 * c))];
  }
  if (pitch !== 0) {
    const { sin: s, cos: c } = sinCosCode(pitch);
    [r20, r10] = [f(f(r20 * c) - f(r10 * s)), f(f(r20 * s) + f(r10 * c))];
    [r21, r11] = [f(f(r21 * c) - f(r11 * s)), f(f(r21 * s) + f(r11 * c))];
    [r12, r22] = [f(f(r22 * s) + f(r12 * c)), f(f(r22 * c) - f(r12 * s))];
  }
  if (roll !== null) {
    const { sin: s, cos: c } = sinCosCode(roll);
    [r00, r10] = [f(f(r00 * c) + f(r10 * s)), f(f(r10 * c) - f(r00 * s))];
    [r01, r11] = [f(f(r01 * c) + f(r11 * s)), f(f(r11 * c) - f(r01 * s))];
    [r02, r12] = [f(f(r02 * c) + f(r12 * s)), f(f(r12 * c) - f(r02 * s))];
  }
  const [a0, a1, a2] = source;
  const Y = f(f(f(f(r11 * a1) + f(r01 * a0)) + f(r21 * a2)) + I[13]);
  const Z = f(f(f(f(r12 * a1) + f(r02 * a0)) + f(r22 * a2)) + I[14]);
  const X = f(f(f(f(r10 * a1) + f(r00 * a0)) + f(r20 * a2)) + I[12]);
  const L2 = f(f(f(X * X) + f(Y * Y)) + f(Z * Z));
  if (LENGTH_TOLERANCE > Math.abs(L2)) return [X, Y, Z];
  if (LENGTH_TOLERANCE > Math.abs(f(L2 - ONE))) return [X, Y, Z];
  const inv = f(ONE / f(Math.sqrt(L2)));
  return [f(X * inv), f(Y * inv), f(Z * inv)];
}

/** Degrees above a full turn lose their whole turns, with an extended-precision subtraction. */
export function wrapDegrees(v: number, env: FloatEnv): number {
  if (!(v > FULL_TURN)) return v;
  const i = truncateToInt32(v);
  const hi = Number((BigInt(i) * BigInt(WRAP_MAGIC)) >> 32n) | 0;
  const e = ((hi + i) | 0) >> WRAP_SHIFT;
  const q = (e + (e >>> 31)) | 0;
  const m = f(f(q) * FULL_TURN);
  return X87.toFloat32(
    X87.subtract(X87.fromNumber(v), X87.fromNumber(m), X87.precisionBits(env.fpcw)),
  );
}
