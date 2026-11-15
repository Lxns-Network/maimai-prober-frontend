import { DEGREES_TO_ANGLE_CODE, sinCosAngleCode } from "../../math/trig";

const f = Math.fround;
const trig = new Float64Array(2);

/** Moves the matrix along its own axes by (x, y, z). */
export function translateLocal(m: Float32Array, x: number, y: number, z: number): void {
  for (let row = 0; row < 3; row++)
    m[12 + row] = f(f(f(f(m[4 + row] * y) + f(m[row] * x)) + f(m[8 + row] * z)) + m[12 + row]);
  m[15] = 1;
}

/** The angle code of a rotation in degrees, folding values past one turn. */
export function angleCode(degrees: number): number {
  let d = degrees;
  if (d > 360) d = f(d - f(Math.trunc(Math.trunc(d) / 360) * 360));
  return Math.trunc(f(d * DEGREES_TO_ANGLE_CODE));
}

export function sine(code: number): number {
  sinCosAngleCode(code, trig);
  return trig[0];
}
