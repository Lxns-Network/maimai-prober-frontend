import {
  EVENT_STRIDE,
  NOTE_FIELDS,
  SPACE_FIELDS,
  SPAWN_CONSTANTS,
  speedForRowIndex,
} from "../../notes/tables";
import {
  endPosition,
  isLongNote,
  registerImmutableTimeline,
  spawnSide,
  toFrames,
  type NoteTimelineScore,
} from "../../notes/timing";
import { registerImmutableScroll } from "../../notes/space";

/** Depth scale and view offset of the note state a spawn scan evaluates. */
const DEPTH_SCALE = 1.5;
const VIEW_OFFSET = 0;
const STEP_FRAMES = 0.5;
const C = SPAWN_CONSTANTS;
/** Depth products whose depth lies inside the spawn window. */
const Y_LOW = C.depthOrigin - C.windowMaximum;
const Y_HIGH = C.depthOrigin - C.windowMinimum;
/** Relative bound on single-precision rounding, with headroom for chained operations. */
const ROUND = 2 ** -22;

/** Maximum over index ranges of a fixed array. */
class RangeMax {
  private readonly levels: Float64Array[];
  constructor(values: Float64Array) {
    this.levels = [values];
    for (let width = 1; width * 2 <= values.length; width *= 2) {
      const below = this.levels[this.levels.length - 1];
      const level = new Float64Array(below.length - width);
      for (let i = 0; i < level.length; i++) level[i] = Math.max(below[i], below[i + width]);
      this.levels.push(level);
    }
  }
  /** Maximum of `values[lo..hi]`, both inclusive; `-Infinity` when the range is empty. */
  max(lo: number, hi: number): number {
    if (lo > hi) return -Infinity;
    const level = 31 - Math.clz32(hi - lo + 1);
    const values = this.levels[level];
    return Math.max(values[lo], values[hi - (1 << level) + 1]);
  }
}

const firstAbove = (sorted: Float64Array, x: number): number => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};
const firstAtOrAbove = (sorted: Float64Array, x: number): number => {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

/** A key's ordered rate rows with prefix sums of their full integral terms. */
interface Rates {
  start: Float64Array;
  end: Float64Array;
  value: Float64Array;
  prefix: Float64Array;
  prefixAbs: Float64Array;
  absRate: RangeMax;
  absExcess: RangeMax;
}

function readRates(events: DataView): Rates | null {
  if (events.byteLength % EVENT_STRIDE !== 0) return null;
  const count = events.byteLength / EVENT_STRIDE;
  const start = new Float64Array(count);
  const end = new Float64Array(count);
  const value = new Float64Array(count);
  let previousEnd = -Infinity;
  for (let i = 0; i < count; i++) {
    const at = i * EVENT_STRIDE;
    start[i] = events.getFloat32(at + NOTE_FIELDS.eventStart, true);
    end[i] = events.getFloat32(at + NOTE_FIELDS.eventEnd, true);
    value[i] = events.getFloat32(at + NOTE_FIELDS.eventValue, true);
    if (![start[i], end[i], value[i]].every(Number.isFinite)) return null;
    if (start[i] < previousEnd || end[i] < start[i]) return null;
    previousEnd = end[i];
  }
  const prefix = new Float64Array(count + 1);
  const prefixAbs = new Float64Array(count + 1);
  const absRate = new Float64Array(count);
  const absExcess = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const term = (end[i] - start[i]) * (value[i] - 1);
    prefix[i + 1] = prefix[i] + term;
    prefixAbs[i + 1] = prefixAbs[i] + Math.abs(term);
    absRate[i] = Math.abs(value[i]);
    absExcess[i] = Math.abs(1 - value[i]);
  }
  return {
    start,
    end,
    value,
    prefix,
    prefixAbs,
    absRate: new RangeMax(absRate),
    absExcess: new RangeMax(absExcess),
  };
}

/** Scroll multipliers as constant runs between every row boundary. */
interface Scales {
  bounds: Float64Array;
  low: RangeMax;
  high: RangeMax;
}

function readScales(records: DataView): Scales | null {
  if (records.byteLength % SPACE_FIELDS.scrollStride !== 0) return null;
  const kept: { start: number; end: number; value: number }[] = [];
  let previousStart = -Infinity;
  for (let at = 0; at < records.byteLength; at += SPACE_FIELDS.scrollStride) {
    const start = records.getFloat32(at + SPACE_FIELDS.scrollStart, true);
    const end = records.getFloat32(at + SPACE_FIELDS.scrollEnd, true);
    const value = records.getFloat32(at + SPACE_FIELDS.scrollValue, true);
    if (![start, end, value].every(Number.isFinite) || start < previousStart) return null;
    previousStart = start;
    if (value !== 0 && end > start) kept.push({ start, end, value });
  }
  const bounds = Float64Array.from(new Set(kept.flatMap((row) => [row.start, row.end]))).sort();
  const values = new Float64Array(bounds.length + 1).fill(1);
  for (let j = 1; j <= bounds.length; j++) {
    const at = bounds[j - 1];
    const row = kept.find((candidate) => candidate.start <= at && at < candidate.end);
    if (row) values[j] = row.value;
  }
  return { bounds, low: new RangeMax(values.map((v) => -v)), high: new RangeMax(values) };
}

interface Side {
  /** Note time in frames. */
  t: number;
  key: number;
  /** Single-precision note time in milliseconds, as the retime integrates it. */
  tMs: number;
  rates: Rates | null;
  /** Whether the side can be bounded; otherwise every step is evaluated. */
  bounded: boolean;
}

interface Estimate {
  dt: number;
  error: number;
}

function estimate(side: Side, k: number): Estimate {
  const now = k * STEP_FRAMES;
  if (side.key < 0) return { dt: side.t - now, error: ROUND * (Math.abs(side.t) + now) + 1e-6 };
  const to = side.tMs;
  let acc = to;
  let rows = 0;
  let magnitude = 0;
  const rates = side.rates;
  const from = now * C.msPerFrame;
  if (rates && from <= to) {
    const lo = firstAbove(rates.end, from);
    const hi = firstAtOrAbove(rates.start, to);
    if (lo < hi) {
      const partial = (i: number) => {
        const s = Math.max(rates.start[i], from);
        const e = Math.min(rates.end[i], to);
        return s > e ? 0 : (e - s) * (rates.value[i] - 1);
      };
      const full = (i: number) => (rates.end[i] - rates.start[i]) * (rates.value[i] - 1);
      let sum = rates.prefix[hi] - rates.prefix[lo] - full(lo) + partial(lo);
      if (hi - 1 !== lo) sum += partial(hi - 1) - full(hi - 1);
      acc = to + sum;
      rows = hi - lo;
      magnitude = rates.prefixAbs[hi] - rates.prefixAbs[lo];
    }
  }
  const frames = acc * C.framesPerMs;
  return {
    dt: frames - now,
    error:
      2 *
        ROUND *
        ((rows + 4) * (Math.abs(to) + magnitude + from) * C.framesPerMs + Math.abs(frames) + now) +
      1e-6,
  };
}

/**
 * Whether the depth product can reach the spawn window at some step of `[k, k + n]`, from an
 * estimate at `k`. A false answer guarantees the spawn window is closed at every one of those steps.
 */
function mayReach(
  side: Side,
  scales: Scales,
  speed: number,
  k: number,
  n: number,
  base: Estimate,
): boolean {
  const now = k * STEP_FRAMES;
  let rate = 1;
  let excess = 0;
  const rates = side.rates;
  if (side.key >= 0 && rates) {
    const from = now * C.msPerFrame;
    const lo = firstAbove(rates.end, from);
    const hi = firstAbove(rates.start, (now + n * STEP_FRAMES) * C.msPerFrame) - 1;
    rate = Math.max(1, rates.absRate.max(lo, hi));
    excess = Math.max(0, rates.absExcess.max(lo, hi));
  }
  const error = 2 * (base.error + (n > 0 ? estimate(side, k + n).error : base.error)) + 1e-4;
  const dtLow = base.dt - n * STEP_FRAMES * rate - error;
  const dtHigh = base.dt + n * STEP_FRAMES * rate + error;
  let scaleLow = Infinity;
  let scaleHigh = -Infinity;
  if (dtLow <= 0) {
    scaleLow = 1;
    scaleHigh = 1;
  }
  if (dtHigh > 0) {
    const query = (base.dt + now) * C.msPerFrame + 1;
    const reach =
      (n * STEP_FRAMES * excess + error) * C.msPerFrame + 4 * ROUND * Math.abs(query) + 1e-3;
    const lo = firstAbove(scales.bounds, query - reach);
    const hi = firstAbove(scales.bounds, query + reach);
    scaleLow = Math.min(scaleLow, -scales.low.max(lo, hi));
    scaleHigh = Math.max(scaleHigh, scales.high.max(lo, hi));
  }
  const factor = DEPTH_SCALE * speed;
  const xLow = VIEW_OFFSET + dtLow;
  const xHigh = VIEW_OFFSET + dtHigh;
  const a = xLow * scaleLow * factor;
  const b = xLow * scaleHigh * factor;
  const c = xHigh * scaleLow * factor;
  const d = xHigh * scaleHigh * factor;
  const yLow = Math.min(a, b, c, d);
  const yHigh = Math.max(a, b, c, d);
  const slack = 4 * ROUND * Math.max(Math.abs(yLow), Math.abs(yHigh)) + 1e-3;
  return !(yHigh + slack < Y_LOW || yLow - slack > Y_HIGH);
}

/** First step at which the early rule alone opens the spawn window. */
function earlyStep(t: number): number {
  const early = (k: number) => C.earlyFrames > Math.fround(t - Math.fround(k * STEP_FRAMES));
  let k = Math.max(0, Math.floor(2 * (t - C.earlyFrames)) - 2);
  while (k > 0 && early(k - 1)) k--;
  while (!early(k)) k++;
  return k;
}

/** A note state at a speed row's speed, with the depth scale and view offset automatic play uses. */
export function scanState(row: number, multiplier = 1): DataView {
  const state = new DataView(new ArrayBuffer(0x3b0));
  state.setFloat32(NOTE_FIELDS.speed, speedForRowIndex(row) * multiplier, true);
  state.setFloat32(NOTE_FIELDS.depthScale, DEPTH_SCALE, true);
  state.setFloat32(NOTE_FIELDS.viewOffset, VIEW_OFFSET, true);
  return state;
}

/**
 * Grid steps at which each record's spawn predicate first holds for a speed row, or -1 when it
 * never holds before `stepCount`. Equal to evaluating the predicate at every step, without doing so.
 */
export function spawnSteps(
  score: NoteTimelineScore,
  row: number,
  stepCount: number,
  multiplier = 1,
): Int32Array {
  registerImmutableTimeline(score);
  registerImmutableScroll(score.scroll);
  const speed = speedForRowIndex(row) * multiplier;
  const state = scanState(row, multiplier);
  const scales = readScales(score.scroll);
  const rateCache = new Map<number, Rates | null>();
  const ratesOf = (key: number): { rates: Rates | null; bounded: boolean } => {
    if (key < 0) return { rates: null, bounded: true };
    const events = score.timeline.get(key | 0) ?? null;
    if (!events) return { rates: null, bounded: true };
    if (!rateCache.has(key)) rateCache.set(key, readRates(events));
    const rates = rateCache.get(key)!;
    return { rates, bounded: rates !== null };
  };
  const sideOf = (time: number, key: number): Side => {
    const t = toFrames(time);
    const { rates, bounded } = ratesOf(key);
    return {
      t,
      key,
      tMs: Math.fround(t * C.msPerFrame),
      rates,
      bounded: bounded && scales !== null,
    };
  };
  const exact = (side: Side, k: number) => {
    state.setFloat32(NOTE_FIELDS.now, Math.fround(k * STEP_FRAMES), true);
    return spawnSide(state, score, side.t, side.key);
  };
  const firstOpen = (side: Side, limit: number): number => {
    const opened = earlyStep(side.t);
    const end = Math.min(limit, opened);
    let k = 0;
    while (k < end) {
      if (!side.bounded) {
        if (exact(side, k)) return k;
        k++;
        continue;
      }
      const base = estimate(side, k);
      if (mayReach(side, scales!, speed, k, 0, base)) {
        if (exact(side, k)) return k;
        k++;
        continue;
      }
      const most = end - 1 - k;
      let closed = 0;
      let n = 1;
      while (n <= most && !mayReach(side, scales!, speed, k, n, base)) {
        closed = n;
        n *= 2;
      }
      let open = Math.min(n, most + 1);
      while (open - closed > 1) {
        const mid = (closed + open) >>> 1;
        if (mayReach(side, scales!, speed, k, mid, base)) open = mid;
        else closed = mid;
      }
      k += closed + 1;
    }
    return opened < limit ? opened : -1;
  };
  const out = new Int32Array(score.records.length);
  score.records.forEach((record, i) => {
    const head = firstOpen(
      sideOf(
        record.getFloat32(NOTE_FIELDS.noteTime, true),
        record.getInt32(NOTE_FIELDS.headKey, true),
      ),
      stepCount,
    );
    if (!isLongNote(record, 0)) {
      out[i] = head;
      return;
    }
    const tail = firstOpen(
      sideOf(
        endPosition(record, 0).getFloat32(NOTE_FIELDS.noteTime, true),
        record.getInt32(NOTE_FIELDS.tailKey, true),
      ),
      head >= 0 ? head : stepCount,
    );
    out[i] = tail >= 0 ? tail : head;
  });
  return out;
}
