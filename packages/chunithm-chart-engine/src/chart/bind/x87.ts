/**
 * Exact extended-precision arithmetic: finite values are binary rationals `(-1)^s · m · 2^e`, rounded
 * to the precision selected by the control word (24/53/64 significant bits) with a 15-bit exponent
 * range; stores to single precision round again under IEEE rules.
 *
 * Only round-to-nearest is implemented; other rounding modes throw.
 */
export type ExtendedValue =
  | { k: "fin"; s: number; m: bigint; e: number }
  | { k: "zero" | "inf" | "nan"; s: number };

const F64 = new Float64Array(1);
const U64 = new BigUint64Array(F64.buffer);

/**
 * Significant bits selected by a floating-point control word.
 *
 * @throws {Error} For rounding modes other than round-to-nearest, or the reserved precision value.
 */
export function precisionBits(fpcw: number): number {
  if (!Number.isInteger(fpcw)) throw new TypeError("control word must be an explicit integer");
  if ((fpcw >> 10) & 3) throw new Error(`unsupported rounding mode ${(fpcw >> 10) & 3}`);
  const pc = (fpcw >> 8) & 3;
  if (pc === 1) throw new Error("precision control value 1 is reserved");
  return pc === 0 ? 24 : pc === 2 ? 53 : 64;
}

/** Exact representation of a double. */
export function fromNumber(x: number): ExtendedValue {
  if (Number.isNaN(x)) return { k: "nan", s: 0 };
  F64[0] = x;
  const bits = U64[0];
  const s = Number(bits >> 63n);
  if (x === 0) return { k: "zero", s };
  if (!Number.isFinite(x)) return { k: "inf", s };
  const exp = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & ((1n << 52n) - 1n);
  return exp === 0
    ? { k: "fin", s, m: frac, e: -1074 }
    : { k: "fin", s, m: frac | (1n << 52n), e: exp - 1075 };
}

const bitLength = (m: bigint) => m.toString(2).length;

/** Rounds to `p` significant bits; leading-bit exponent floor `eminLead` (subnormal), ceiling `emaxLead` (overflow to infinity). */
function roundTo(v: ExtendedValue, p: number, eminLead: number, emaxLead: number): ExtendedValue {
  if (v.k !== "fin") return v;
  let { m, e } = v;
  const lead = bitLength(m) - 1 + e;
  const q = Math.max(lead - p + 1, eminLead - p + 1);
  if (q > e) {
    const sh = BigInt(q - e);
    const kept = m >> sh;
    const rem = m - (kept << sh);
    const half = 1n << (sh - 1n);
    m = kept + (rem > half || (rem === half && kept & 1n) ? 1n : 0n);
    e = q;
  }
  if (m === 0n) return { k: "zero", s: v.s };
  if (bitLength(m) - 1 + e > emaxLead) return { k: "inf", s: v.s };
  return { k: "fin", s: v.s, m, e };
}

const roundToPrecision = (v: ExtendedValue, bits: number) => roundTo(v, bits, -16382, 16383);

function specialToNumber(v: ExtendedValue): number {
  if (v.k === "nan") return NaN;
  if (v.k === "zero") return v.s ? -0 : 0;
  return v.s ? -Infinity : Infinity;
}

/** Stores to single precision (round to nearest). */
export function toFloat32(v: ExtendedValue): number {
  const r = roundTo(v, 24, -126, 127);
  if (r.k === "fin") {
    const x = Number(r.m) * 2 ** (r.e + 64) * 2 ** -64;
    return Math.fround(r.s ? -x : x);
  }
  return Math.fround(specialToNumber(r));
}

export function negate(v: ExtendedValue): ExtendedValue {
  return v.k === "nan" ? v : { ...v, s: v.s ^ 1 };
}

export function add(a: ExtendedValue, b: ExtendedValue, bits: number): ExtendedValue {
  if (a.k === "nan" || b.k === "nan") return { k: "nan", s: 1 };
  if (a.k === "inf" || b.k === "inf") {
    if (a.k === "inf" && b.k === "inf" && a.s !== b.s) return { k: "nan", s: 1 };
    return a.k === "inf" ? a : b;
  }
  if (a.k === "zero" && b.k === "zero") return { k: "zero", s: a.s & b.s };
  if (a.k === "zero") return roundToPrecision(b, bits);
  if (b.k === "zero") return roundToPrecision(a, bits);
  if (a.k !== "fin" || b.k !== "fin") return { k: "nan", s: 1 };
  const e = Math.min(a.e, b.e);
  const ma = (a.s ? -1n : 1n) * (a.m << BigInt(a.e - e));
  const mb = (b.s ? -1n : 1n) * (b.m << BigInt(b.e - e));
  const m = ma + mb;
  if (m === 0n) return { k: "zero", s: 0 };
  return roundToPrecision({ k: "fin", s: m < 0n ? 1 : 0, m: m < 0n ? -m : m, e }, bits);
}

export const subtract = (a: ExtendedValue, b: ExtendedValue, bits: number) =>
  add(a, negate(b), bits);

export function multiply(a: ExtendedValue, b: ExtendedValue, bits: number): ExtendedValue {
  if (a.k === "nan" || b.k === "nan") return { k: "nan", s: 1 };
  const s = a.s ^ b.s;
  if ((a.k === "inf" && b.k === "zero") || (a.k === "zero" && b.k === "inf"))
    return { k: "nan", s: 1 };
  if (a.k === "inf" || b.k === "inf") return { k: "inf", s };
  if (a.k !== "fin" || b.k !== "fin") return { k: "zero", s };
  return roundToPrecision({ k: "fin", s, m: a.m * b.m, e: a.e + b.e }, bits);
}

/** Quotient rounded once at `bits`; a zero divisor gives infinity, and 0/0 NaN. */
export function divide(a: ExtendedValue, b: ExtendedValue, bits: number): ExtendedValue {
  if (a.k === "nan" || b.k === "nan") return { k: "nan", s: 1 };
  const s = a.s ^ b.s;
  if (a.k === "inf") return b.k === "inf" ? { k: "nan", s: 1 } : { k: "inf", s };
  if (b.k === "inf") return { k: "zero", s };
  if (b.k === "zero") return a.k === "zero" ? { k: "nan", s: 1 } : { k: "inf", s };
  if (a.k !== "fin" || b.k !== "fin") return { k: "zero", s };
  const k = Math.max(0, bits + 3 + bitLength(b.m) - bitLength(a.m) + 1);
  const numerator = a.m << BigInt(k);
  const quotient = numerator / b.m;
  const sticky = numerator - quotient * b.m !== 0n ? 1n : 0n;
  return roundToPrecision(
    { k: "fin", s, m: (quotient << 1n) | sticky, e: a.e - b.e - k - 1 },
    bits,
  );
}
