import {
  fromNumber,
  multiply,
  precisionBits,
  subtract,
  toFloat32,
  type ExtendedValue,
} from "./x87";

export interface BindRow {
  enable: boolean;
  unify: boolean;
  earlyLimit: number;
  earlyFloor: number;
  lateFloor: number;
  lateLimit: number;
}

const f = Math.fround;
const EPSILON = f(0.0052083335);
const SCALE = f(0.06);
const BITS = precisionBits(0x37f);
const UNSET_MIN = 9999;
const LANES = 16;
const EX_FLAG = 0x8c;
const EARLY_FLAG = 0xa4;
const LATE_FLAG = 0xb4;
const EARLY_WIN = 0xc4;
const LATE_WIN = 0x104;

/** Scalar max/min: ties and unordered operands yield the second operand. */
const max = (a: number, b: number) => (a > b ? a : b);
const min = (a: number, b: number) => (a < b ? a : b);

interface Participant {
  rec: DataView;
  row: BindRow;
  pos: number;
  lane: number;
  width: number;
  time: number;
  scaled: number;
  product: ExtendedValue | null;
}

/** `earlierTime × SCALE` held at extended precision. */
export const extendedProduct = (earlierTime: number): ExtendedValue =>
  multiply(fromNumber(earlierTime), fromNumber(SCALE), BITS);

/** `f32(scaledLater − product)` with `product` at extended precision. */
export const extendedScaledGap = (scaledLater: number, product: ExtendedValue): number =>
  toFloat32(subtract(fromNumber(scaledLater), product, BITS));

/**
 * `f32(scaledLater − earlierTime × SCALE)` computed in doubles, or `null` when the double
 * difference is inexact. The product of two singles is exact in a double; when the difference has
 * zero TwoSum error it is exact too, so one rounding to f32 equals the extended-precision result.
 */
export function exactScaledGap(scaledLater: number, earlierTime: number): number | null {
  const nb = -(earlierTime * SCALE);
  const s = scaledLater + nb;
  const bb = s - scaledLater;
  return scaledLater - (s - bb) + (nb - bb) === 0 ? f(s) : null;
}

/** `f32(scaledLater − extended(earlierTime × SCALE))`. */
export const scaledGap = (scaledLater: number, earlierTime: number): number =>
  exactScaledGap(scaledLater, earlierTime) ??
  extendedScaledGap(scaledLater, extendedProduct(earlierTime));

const gapOf = (i: Participant, j: Participant): number =>
  exactScaledGap(j.scaled, i.time) ??
  extendedScaledGap(j.scaled, (i.product ??= extendedProduct(i.time)));

function rowFor(rec: DataView, rows: readonly BindRow[]): BindRow | null {
  const type = rec.getInt32(0x10, true);
  const ex = rec.getUint8(EX_FLAG) !== 0;
  const row =
    type === 0
      ? rows[0]
      : type === 1 || type === 2 || type === 13
        ? ex
          ? rows[1]
          : rows[0]
        : type === 4
          ? rows[1]
          : type === 6
            ? rows[2]
            : type === 11
              ? rows[3]
              : null;
  return row && row.enable ? row : null;
}

/** Lowers the late (or early) window on lanes `first..last` (clamped to 0..15) towards `value`. */
function tighten(p: Participant, value: number, first: number, last: number, late: boolean) {
  const lo = Math.max(0, first);
  const hi = Math.min(LANES - 1, last);
  const floor = late ? p.row.lateFloor : p.row.earlyFloor;
  const limit = late ? p.row.lateLimit : p.row.earlyLimit;
  const flagAt = late ? LATE_FLAG : EARLY_FLAG;
  const winAt = late ? LATE_WIN : EARLY_WIN;
  const v = max(floor, value);
  for (let lane = lo; lane <= hi; lane++) {
    const cur = p.rec.getUint8(flagAt + lane) ? p.rec.getFloat32(winAt + 4 * lane, true) : limit;
    if (!(v > cur)) {
      p.rec.setUint8(flagAt + lane, 1);
      p.rec.setFloat32(winAt + 4 * lane, v, true);
    }
  }
}

/**
 * Narrows each note's per-lane early/late judge windows so they do not overlap the windows of
 * neighbouring notes on shared lanes; writes the flags and windows into the records in place.
 */
export function tightenJudgeWindows(
  records: DataView[],
  rows: readonly BindRow[],
  realWidth: (idx: number) => number,
): void {
  const ps: Participant[] = [];
  for (const rec of records) {
    const row = rowFor(rec, rows);
    if (!row) continue;
    const time = rec.getFloat32(8, true);
    ps.push({
      rec,
      row,
      pos: f(f(rec.getFloat32(0, true) * 4) + rec.getFloat32(4, true)),
      lane: rec.getInt32(0x28, true),
      width: realWidth(rec.getInt32(0x2c, true)),
      time,
      scaled: f(time * SCALE),
      product: null,
    });
  }
  const pair = (i: Participant, j: Participant) => {
    if (!(f(j.pos + EPSILON) >= i.pos)) return;
    if (f(i.pos + EPSILON) >= j.pos && f(j.pos + EPSILON) >= i.pos) return;
    if (!(j.width + j.lane > i.lane && i.width + i.lane > j.lane)) return;
    const lo = Math.max(i.lane, j.lane);
    const hi = Math.min(i.lane + i.width - 1, j.lane + j.width - 1);
    if (lo > hi) return;
    const gap = gapOf(i, j);
    if (gap >= f(j.row.earlyLimit + i.row.lateLimit)) return;
    const half = f(gap * 0.5);
    tighten(i, half, lo, hi, true);
    tighten(j, half, lo, hi, false);
  };
  const sorted = [...ps].sort((a, b) => a.pos - b.pos || a.time - b.time);
  const ordered = sorted.every((p, k) => k === 0 || !(p.time < sorted[k - 1].time));
  if (!ordered) for (const i of ps) for (const j of ps) pair(i, j);
  else {
    // Later notes only follow in position order, and a gap that reaches every row's limit stays reached.
    const earliest = Math.max(...rows.map((row) => row.earlyLimit));
    let from = 0;
    for (const i of sorted) {
      while (from < sorted.length && f(i.pos + EPSILON) >= sorted[from].pos) from++;
      const reach = f(earliest + i.row.lateLimit);
      for (let k = from; k < sorted.length; k++) {
        const j = sorted[k];
        if (!(gapOf(i, j) < reach)) break;
        pair(i, j);
      }
    }
  }
  for (const p of ps) {
    if (!p.row.unify) continue;
    const first = p.lane;
    const last = first + p.width - 1;
    let anyEarly = false;
    let anyLate = false;
    let minEarly = UNSET_MIN;
    let minLate = UNSET_MIN;
    for (let lane = first; lane <= last; lane++) {
      if (lane < 0 || lane >= LANES) continue;
      if (p.rec.getUint8(EARLY_FLAG + lane)) {
        anyEarly = true;
        minEarly = min(p.rec.getFloat32(EARLY_WIN + 4 * lane, true), minEarly);
      }
      if (p.rec.getUint8(LATE_FLAG + lane)) {
        anyLate = true;
        minLate = min(p.rec.getFloat32(LATE_WIN + 4 * lane, true), minLate);
      }
    }
    if (anyEarly) tighten(p, minEarly, 0, LANES - 1, false);
    if (anyLate) tighten(p, minLate, 0, LANES - 1, true);
  }
}
