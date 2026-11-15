/** Finite binary value `m × 2^e`; only round-to-nearest-even, with subnormal and overflow rejected on store. */
export interface ExactValue {
  m: bigint;
  e: number;
}

/** Precision selector for the x87 control word. */
export type StripPrecision = "single" | "extended";

const scratch = new DataView(new ArrayBuffer(8));

/** Exact representation of a double. */
export function exact(x: number): ExactValue {
  if (!Number.isFinite(x)) throw new RangeError("non-finite x87 operand");
  if (x === 0) return { m: 0n, e: 0 };
  scratch.setFloat64(0, x, true);
  const hi = scratch.getUint32(4, true),
    lo = scratch.getUint32(0, true);
  const exp = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e: number;
  if (exp === 0) e = -1074;
  else {
    m |= 1n << 52n;
    e = exp - 1075;
  }
  return { m: hi >>> 31 ? -m : m, e };
}

const bitLength = (m: bigint): number => {
  const hex = (m < 0n ? -m : m).toString(16);
  return hex === "0" ? 1 : (hex.length - 1) * 4 + 32 - Math.clz32(parseInt(hex[0], 16));
};

/** Rounds to `bits` significant bits, round-half-to-even. */
export function round(v: ExactValue, bits: number): ExactValue {
  if (v.m === 0n) return v;
  const neg = v.m < 0n,
    a = neg ? -v.m : v.m;
  const drop = bitLength(a) - bits;
  if (drop <= 0) return v;
  const D = BigInt(drop),
    q = a >> D,
    r = a - (q << D),
    half = 1n << (D - 1n);
  const q2 = r > half || (r === half && q & 1n) ? q + 1n : q;
  return { m: neg ? -q2 : q2, e: v.e + drop };
}

/** Sum without precision loss; the result is exact. */
export function add(a: ExactValue, b: ExactValue): ExactValue {
  if (a.m === 0n) return b;
  if (b.m === 0n) return a;
  const e = Math.min(a.e, b.e);
  return { m: (a.m << BigInt(a.e - e)) + (b.m << BigInt(b.e - e)), e };
}

/** Negation. */
export const neg = (a: ExactValue): ExactValue => ({ m: -a.m, e: a.e });
/** Difference; exact. */
export const sub = (a: ExactValue, b: ExactValue): ExactValue => add(a, neg(b));
/** Product; exact. */
export const mul = (a: ExactValue, b: ExactValue): ExactValue => ({ m: a.m * b.m, e: a.e + b.e });

/** Stores to single precision, rounding once; rejects a result that is subnormal or overflows. */
export function toF32(v: ExactValue): number {
  if (v.m === 0n) return 0;
  const r = round(v, 24);
  const top = bitLength(r.m) - 1 + r.e;
  if (top < -126 || top > 127)
    throw new RangeError("f32 subnormal/overflow at store is not modelled");
  return Number(r.m) * 2 ** r.e;
}

/** Significant-bit count selected by a precision selector. */
export function precisionBits(x87: StripPrecision): number {
  if (x87 === "single") return 24;
  if (x87 === "extended") return 64;
  throw new TypeError("x87 precision must be single or extended");
}
