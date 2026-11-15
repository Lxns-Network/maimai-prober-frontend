import { DEGREES_TO_ANGLE_CODE, sinCosAngleCode } from "./trig";

const f = Math.fround;
const EPSILON = f(0.0000001);

/** A 4x4 affine matrix as 16 floats, translation in elements 12 to 14. */
export type Matrix = { [index: number]: number; readonly length: number };

/** The camera the billboard motions face: position and up vector. */
export interface EffectCamera {
  readonly position: readonly [number, number, number];
  readonly up: readonly [number, number, number];
}

const trig = new Float64Array(2);

export function setIdentity(m: Matrix): void {
  for (let i = 0; i < 16; i++) m[i] = 0;
  m[0] = m[5] = m[10] = m[15] = 1;
}

/** `a` applied after `b`, element by element in the order the product is summed. `out` must not alias an input. */
export function multiplyAffine(a: Matrix, b: Matrix, out: Matrix): void {
  out[3] = out[7] = out[11] = 0;
  out[15] = 1;
  for (let column = 0; column < 4; column++)
    for (let row = 0; row < 3; row++) {
      const v = f(
        f(f(a[row + 4] * b[column * 4 + 1]) + f(a[row] * b[column * 4])) +
          f(a[row + 8] * b[column * 4 + 2]),
      );
      out[column * 4 + row] = column === 3 ? f(v + a[row + 12]) : v;
    }
}

/** The affine inverse; all zeros when the linear part is singular. The identity inverts to a matrix with negative zeros. */
export function inverseAffine(a: Matrix, out: Matrix): void {
  const c0 = f(f(a[10] * a[5]) - f(a[6] * a[9]));
  const c1 = f(f(a[2] * a[9]) - f(a[10] * a[1]));
  const c2 = f(f(a[6] * a[1]) - f(a[2] * a[5]));
  const determinant = f(f(f(c1 * a[4]) + f(c0 * a[0])) + f(c2 * a[8]));
  if (Math.abs(determinant) < EPSILON) {
    for (let i = 0; i < 16; i++) out[i] = 0;
    return;
  }
  const reciprocal = f(1 / determinant);
  setIdentity(out);
  out[0] = f(reciprocal * c0);
  out[1] = f(reciprocal * c1);
  out[2] = f(reciprocal * c2);
  out[4] = -f(f(f(a[10] * a[4]) - f(a[6] * a[8])) * reciprocal);
  out[8] = f(f(f(a[9] * a[4]) - f(a[5] * a[8])) * reciprocal);
  out[5] = f(f(f(a[10] * a[0]) - f(a[2] * a[8])) * reciprocal);
  out[9] = -f(f(f(a[9] * a[0]) - f(a[1] * a[8])) * reciprocal);
  out[6] = -f(f(f(a[6] * a[0]) - f(a[2] * a[4])) * reciprocal);
  out[10] = f(f(f(a[5] * a[0]) - f(a[1] * a[4])) * reciprocal);
  for (let row = 0; row < 3; row++)
    out[12 + row] = f(f(-f(out[row] * a[12]) - f(out[4 + row] * a[13])) - f(out[8 + row] * a[14]));
}

/** Translation then scale of an identity matrix; a mirrored request negates the X scale. Negative scales keep their signed zeros. */
export function requestMatrix(
  position: readonly number[],
  scale: readonly number[],
  mirror: boolean,
  out: Matrix,
): void {
  setIdentity(out);
  for (let row = 0; row < 3; row++)
    out[12 + row] = f(
      f(
        f(f(out[row] * position[0]) + f(out[row + 4] * position[1])) +
          f(out[row + 8] * position[2]),
      ) + out[12 + row],
    );
  const sx = mirror ? f(scale[0] * -1) : scale[0];
  for (let column = 0; column < 3; column++)
    for (let row = 0; row < 3; row++)
      out[column * 4 + row] = f(out[column * 4 + row] * (column === 0 ? sx : scale[column]));
}

/** Multiplies the matrix on the right by a diagonal scale and a translation, keeping zero products and each float32 sum. */
export function multiplyDiagonalTranslation(
  m: Matrix,
  sx: number,
  sy: number,
  sz: number,
  tx: number,
  ty: number,
  tz: number,
): void {
  for (let row = 0; row < 3; row++) {
    const x = m[row];
    const y = m[row + 4];
    const z = m[row + 8];
    const t = m[row + 12];
    const x0 = f(x * 0);
    const y0 = f(y * 0);
    const z0 = f(z * 0);
    m[row] = f(f(y0 + f(x * sx)) + z0);
    m[row + 4] = f(f(f(y * sy) + x0) + z0);
    m[row + 8] = f(f(y0 + x0) + f(z * sz));
    m[row + 12] = f(f(f(f(y * ty) + f(x * tx)) + f(z * tz)) + t);
  }
  m[3] = m[7] = m[11] = 0;
  m[15] = 1;
}

export function translate(m: Matrix, x: number, y: number, z: number): void {
  multiplyDiagonalTranslation(m, 1, 1, 1, x, y, z);
}

export function scaleBy(m: Matrix, x: number, y: number, z: number): void {
  multiplyDiagonalTranslation(m, x, y, z, 0, 0, 0);
}

const codes = new Int32Array(3);

/** Rotations about Z, then Y, then X; the angles are degrees. */
export function rotateDegrees(m: Matrix, x: number, y: number, z: number): void {
  codes[0] = Math.trunc(f(f(x % 360) * DEGREES_TO_ANGLE_CODE));
  codes[1] = Math.trunc(f(f(y % 360) * DEGREES_TO_ANGLE_CODE));
  codes[2] = Math.trunc(f(f(z % 360) * DEGREES_TO_ANGLE_CODE));
  rotateCodes(m, codes);
}

/** The rotation about Z, Y and X by angle codes, skipping an axis whose code is zero. */
export function rotateCodes(m: Matrix, axisCodes: { [index: number]: number }): void {
  for (let axis = 2; axis >= 0; axis--) {
    if (axisCodes[axis] === 0) continue;
    sinCosAngleCode(axisCodes[axis], trig);
    const sin = trig[0];
    const cos = trig[1];
    const a = axis === 0 ? 4 : 0;
    const b = axis === 2 ? 4 : 8;
    for (let row = 0; row < 3; row++) {
      const x = m[a + row];
      const y = m[b + row];
      if (axis === 1) {
        m[a + row] = f(f(x * cos) - f(y * sin));
        m[b + row] = f(f(x * sin) + f(y * cos));
      } else {
        m[a + row] = f(f(y * sin) + f(x * cos));
        m[b + row] = f(f(y * cos) - f(x * sin));
      }
    }
  }
}

/** Normalizes unless the squared length is near zero or one. */
export function normalize3(v: { [index: number]: number }): void {
  const squared = f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2]));
  if (Math.abs(squared) < EPSILON || Math.abs(f(squared - 1)) < EPSILON) return;
  const factor = f(1 / f(Math.sqrt(squared)));
  v[0] = f(v[0] * factor);
  v[1] = f(v[1] * factor);
  v[2] = f(v[2] * factor);
}

const bz = new Float64Array(3);
const bx = new Float64Array(3);

/** Replaces the rotation columns with the camera basis: X from up and the direction to the camera, Y the camera up, Z the direction. */
export function billboard(m: Matrix, camera: EffectCamera): void {
  for (let i = 0; i < 3; i++) bz[i] = f(camera.position[i] - m[12 + i]);
  normalize3(bz);
  const up = camera.up;
  bx[0] = f(f(up[1] * bz[2]) - f(up[2] * bz[1]));
  bx[1] = f(f(up[2] * bz[0]) - f(up[0] * bz[2]));
  bx[2] = f(f(up[0] * bz[1]) - f(up[1] * bz[0]));
  normalize3(bx);
  for (let i = 0; i < 3; i++) {
    m[i] = bx[i];
    m[4 + i] = up[i];
    m[8 + i] = bz[i];
  }
}

const inv = new Float64Array(16);
const target = new Float64Array(3);
const rotation = new Float64Array(16);
const composed = new Float64Array(9);

/** Rotates the local +Z axis toward the camera and composes that with the matrix. */
export function cameraFacing(m: Matrix, camera: EffectCamera): void {
  inverseAffine(m, inv);
  const dx = f(camera.position[0] - m[12]);
  const dy = f(camera.position[1] - m[13]);
  const dz = f(camera.position[2] - m[14]);
  for (let row = 0; row < 3; row++)
    target[row] = f(f(f(inv[row + 4] * dy) + f(inv[row] * dx)) + f(inv[row + 8] * dz));
  const squared = f(
    f(f(target[1] * target[1]) + f(target[0] * target[0])) + f(target[2] * target[2]),
  );
  if (Math.abs(squared) >= EPSILON && Math.abs(f(squared - 1)) >= EPSILON) {
    const factor = f(1 / f(Math.sqrt(squared)));
    target[0] = f(target[0] * factor);
    target[1] = f(target[1] * factor);
    target[2] = f(target[2] * factor);
  }
  setIdentity(rotation);
  const root = f(Math.sqrt(f(f(target[2] + target[2]) + 2)));
  if (root >= f(0.01)) {
    const reciprocal = f(1 / root);
    const x = f(reciprocal * f(f(target[1] * 1) - f(target[2] * 0)));
    const y = f(reciprocal * f(f(0 * target[2]) - f(target[0] * 1)));
    const z = f(reciprocal * f(f(target[0] * 0) - f(0 * target[1])));
    const w = f(root * 0.5);
    const xy = f(y * x);
    const zz2 = f(f(z * z) + f(z * z));
    const yy2 = f(f(y * y) + f(y * y));
    const xx2 = f(f(x * x) + f(x * x));
    const wz = f(w * z);
    const wy = f(w * y);
    const zx = f(z * x);
    const zy = f(z * y);
    const wx = f(w * x);
    rotation[0] = f(1 - f(yy2 + zz2));
    rotation[1] = f(f(xy - wz) + f(xy - wz));
    rotation[4] = f(f(wz + wz) + f(xy + xy));
    rotation[2] = f(f(wy + wy) + f(zx + zx));
    rotation[8] = f(f(zx - wy) + f(zx - wy));
    rotation[5] = f(1 - f(xx2 + zz2));
    rotation[10] = f(1 - f(xx2 + yy2));
    rotation[6] = f(f(zy - wx) + f(zy - wx));
    rotation[9] = f(f(wx + wx) + f(zy + zy));
  } else {
    rotation[5] = -1;
    rotation[10] = -1;
  }
  for (let column = 0; column < 3; column++)
    for (let row = 0; row < 3; row++)
      composed[column * 3 + row] = f(
        f(f(m[row + 4] * rotation[column * 4 + 1]) + f(m[row] * rotation[column * 4])) +
          f(m[row + 8] * rotation[column * 4 + 2]),
      );
  for (let column = 0; column < 3; column++)
    for (let row = 0; row < 3; row++) m[column * 4 + row] = composed[column * 3 + row];
}
