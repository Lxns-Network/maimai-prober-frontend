const f = Math.fround;

/** Scale from degrees to the 16-bit angle code (65536 per turn). */
export const DEGREES_TO_ANGLE_CODE = 182.04444885253906;
const ANGLE_CODE_TO_RADIANS = 0.0000958738019107841;
const SIN_LINEAR = 0.1666666716337204;
const SIN_CUBIC = 0.008333333767950535;
const COS_QUADRATIC = 0.0416666679084301;
const COS_QUARTIC = 0.0013888889225199819;
const QUADRANT_MASK = 0xe000;
const OFFSET_4000 = -16384;
const OFFSET_8000 = -32768;
const OFFSET_C000 = -49152;
const OFFSET_10000 = -65536;

const radians = (n: number) => f(f(n) * ANGLE_CODE_TO_RADIANS);
const sinPolynomial = (x: number) => {
  const x2 = f(x * x);
  return f(f(1 - f(f(SIN_LINEAR - f(x2 * SIN_CUBIC)) * x2)) * x);
};
const cosPolynomial = (x: number) => {
  const x2 = f(x * x);
  return f(f(f(f(f(COS_QUADRATIC - f(x2 * COS_QUARTIC)) * x2) - 0.5) * x2) + 1);
};

/** Sine and cosine of a 16-bit angle code, folded by quadrant onto a polynomial; written to `out[0]` and `out[1]`. */
export function sinCosAngleCode(angle: number, out: { [index: number]: number }): void {
  const a = angle | 0;
  const lo = a & 0xffff;
  const q = a & QUADRANT_MASK;
  if (q > 0x8000) {
    if (q === 0xe000) {
      const x = radians(lo + OFFSET_10000);
      out[0] = sinPolynomial(x);
      out[1] = cosPolynomial(x);
    } else {
      const x = radians(lo + OFFSET_C000);
      out[0] = -cosPolynomial(x);
      out[1] = sinPolynomial(x);
    }
  } else if (q === 0x8000 || q === 0x6000) {
    const x = radians(lo + OFFSET_8000);
    out[0] = -sinPolynomial(x);
    out[1] = -cosPolynomial(x);
  } else if (q === 0x2000 || q === 0x4000) {
    const x = radians(lo + OFFSET_4000);
    out[0] = cosPolynomial(x);
    out[1] = -sinPolynomial(x);
  } else {
    const x = radians(lo);
    out[0] = sinPolynomial(x);
    out[1] = cosPolynomial(x);
  }
}

/** Sine alone, for the oscillating curves. */
export function sinAngleCode(angle: number, scratch: { [index: number]: number }): number {
  sinCosAngleCode(angle, scratch);
  return scratch[0];
}
