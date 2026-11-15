import { toFloat32 } from "./extended";

const P = 448;
const SCALE = 1n << BigInt(P);
const F32 = new Float32Array(1);
const U32 = new Uint32Array(F32.buffer);

function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt((n.toString(2).length >> 1) + 1);
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

function atanSmall(u: bigint): bigint {
  const u2 = (u * u) >> BigInt(P);
  let term = u;
  let acc = 0n;
  let k = 0n;
  while (term !== 0n) {
    const t = term / (2n * k + 1n);
    acc += k & 1n ? -t : t;
    term = (term * u2) >> BigInt(P);
    k += 1n;
  }
  return acc;
}

const PI = 16n * atanSmall(SCALE / 5n) - 4n * atanSmall(SCALE / 239n);

function atanUnit(u: bigint): bigint {
  for (let i = 0; i < 3; i++) u = (u << BigInt(P)) / (SCALE + isqrt(SCALE * SCALE + u * u));
  return 8n * atanSmall(u);
}

function decompose(x: number): [bigint, number] {
  const f = new Float64Array([Math.abs(x)]);
  const b = new BigUint64Array(f.buffer)[0];
  const exp = Number(b >> 52n);
  const frac = b & ((1n << 52n) - 1n);
  return exp === 0 ? [frac, -1074] : [frac | (1n << 52n), exp - 1075];
}

const shift = (m: bigint, k: number) => (k >= 0 ? m << BigInt(k) : m >> BigInt(-k));

function atan2Exact(y: number, x: number): { s: number; a: bigint } {
  const [my, ey] = decompose(y);
  const [mx, ex] = decompose(x);
  const t = shift(my, P + ey - ex) / mx;
  let a = t > SCALE ? PI / 2n - atanUnit(shift(mx, P + ex - ey) / my) : atanUnit(t);
  if (x < 0) a = PI - a;
  return { s: y < 0 ? 1 : 0, a };
}

function float32Neighbours(f: number): [number, number] {
  F32[0] = f;
  const b = U32[0];
  return [
    new Float32Array(new Uint32Array([b - 1]).buffer)[0],
    new Float32Array(new Uint32Array([b + 1]).buffer)[0],
  ];
}

function atan2Float32Slow(y: number, x: number): number {
  const { s, a } = atan2Exact(y, x);
  const err = (1n << 8n) + (a >> 60n);
  const lo = toFloat32({ k: "fin", s, m: a - err, e: -P });
  const hi = toFloat32({ k: "fin", s, m: a + err, e: -P });
  if (lo !== hi) throw new Error(`atan2(${y}, ${x}) is too close to a rounding midpoint`);
  return lo;
}

/** The single-precision result of the processor's arctangent of two single-precision values. */
export function atan2Float32(y: number, x: number): number {
  if (Math.fround(y) !== y && !Number.isNaN(y)) throw new TypeError("y must be a float32 value");
  if (Math.fround(x) !== x && !Number.isNaN(x)) throw new TypeError("x must be a float32 value");
  if (Number.isNaN(y) || Number.isNaN(x)) return NaN;
  if (y === 0 || x === 0 || !Number.isFinite(y) || !Number.isFinite(x))
    return Math.fround(Math.atan2(y, x));
  const d = Math.atan2(y, x);
  const f = Math.fround(d);
  const af = Math.abs(f);
  if (af > 0 && Number.isFinite(f)) {
    const [lo, hi] = float32Neighbours(af);
    const margin = Math.abs(d) * 2 ** -40;
    const ad = Math.abs(d);
    if (Math.abs(ad - (af + lo) / 2) > margin && Math.abs(ad - (af + hi) / 2) > margin) return f;
  }
  return atan2Float32Slow(y, x);
}
