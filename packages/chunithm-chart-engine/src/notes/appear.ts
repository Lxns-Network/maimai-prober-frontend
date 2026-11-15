/**
 * Visible intervals per record for one speed row.
 *
 * A record's visibility is not a single window: at some rows it leaves and returns, and a handful of
 * records have three separate windows. The normal representation is therefore a set of grid-step
 * intervals per record, not one appear time.
 *
 * Intervals are grid-step indices on the 120 Hz grid, `[start, end)` in half-frames, matching how the
 * renderer advances time. Records begin invisible, so a visible run opens at a rising edge and closes
 * at the next falling edge, or at the end of the scanned grid if the run is still open.
 */

import { speedForRowIndex } from "./tables";
import { registerImmutableScroll } from "./space";
import {
  endPosition,
  isLongNote,
  registerImmutableTimeline,
  spawnPredicate,
  type NoteTimelineScore,
} from "./timing";

/** Seconds per grid step: two steps per 60 Hz frame, so 120 steps per second. */
export const STEP_SECONDS = 1 / 120;
/** Frames advanced per grid step. */
export const FRAMES_PER_STEP = 0.5;
/** Trailing time scanned past the last note, in seconds. */
export const TAIL_SECONDS = 2;
/** Widest interval count a record may have; beyond this the scan is not authoritative. */
export const MAX_INTERVALS = 4;
/** Total grid steps for a scan that runs `steps` steps, including step 0. */
const stepCount = (steps: number) => steps + 1;

/** Visible step intervals for every record at one speed row. */
export interface VisibleIntervals {
  /** Speed row this scan was made for. */
  row: number;
  /** Grid steps scanned, excluding step 0. */
  steps: number;
  /** First grid step this scan sampled. Absent on a table a test built by hand. */
  fromStep?: number;
  /** One past the last grid step this scan sampled. Absent on a table a test built by hand. */
  toStep?: number;
  /**
   * Whether each record's last interval ends at `toStep` because the band ran out rather than
   * because the record became invisible. The next block resumes such a run.
   */
  openAtEnd?: Uint8Array;
  /** Flat `[start, end)` step pairs, grouped by record in record order. */
  intervals: Int32Array;
  /** Interval count per record; a record never visible at this row has 0. */
  intervalCounts: Uint32Array;
}

export interface ComputeAppearInput {
  /** Bound-score records, in the order the renderer indexes them. */
  records: readonly DataView[];
  /** Bound score whose timeline and scroll rows the visibility predicates read. */
  score: NoteTimelineScore;
  /** Settings row the scan is made for. */
  row: number;
  /** Grid steps to scan; when omitted it is derived from the last note time plus a short tail. */
  steps?: number;
  /**
   * First grid step this scan evaluates; defaults to 0.
   *
   * A caller that cannot afford the whole grid builds the table in **half-open blocks**: block `n`
   * is `[fromStep, toStep)` and owns exactly the steps it sampled, so consecutive blocks tile with
   * neither a gap nor an overlap.
   */
  fromStep?: number;
  /**
   * One past the last grid step this scan samples; defaults to `steps + 1` (the whole grid).
   *
   * Half-open rather than inclusive so blocks tile by construction. A run still visible at
   * `toStep - 1` is reported as closing at `toStep`, which is the *provisional* end of that block:
   * the next block resumes the same run and reports it from `toStep`, so the pieces abut exactly and
   * their union is what the full scan reports. {@link VisibleIntervals.openAtEnd} says whether the
   * last interval of each record is such a provisional close.
   */
  toStep?: number;
  /** Highest interval count accepted before the scan is treated as non-authoritative. */
  maxIntervals?: number;
}

/**
 * The latest time a record shows anything: its head, or the end of its long note or of the AIR long
 * note on it.
 */
export function recordEndMs(record: DataView): number {
  let last = record.getFloat32(8, true);
  for (const side of [0, 1])
    if (isLongNote(record, side)) {
      const tail = endPosition(record, side).getFloat32(8, true);
      if (tail > last) last = tail;
    }
  return last;
}

/** Steps covering the score: up to two seconds past the latest record end. */
export function stepsForScore(records: readonly DataView[]): number {
  let lastMs = 0;
  for (const record of records) {
    const end = recordEndMs(record);
    if (end > lastMs) lastMs = end;
  }
  return Math.ceil((lastMs / 1000 + TAIL_SECONDS) * 120);
}

/**
 * Scans the row on the 120 Hz grid and records each record's visible runs as step intervals.
 *
 * The scan is one pass over the grid, so a record whose visibility flickers more than
 * `maxIntervals` times would be truncated; that case throws instead of silently losing windows,
 * because a truncated interval set is indistinguishable from a correct one downstream.
 */
export function computeAppear(input: ComputeAppearInput): VisibleIntervals {
  const { records, score, row } = input;
  const steps = input.steps ?? stepsForScore(records);
  const maxIntervals = input.maxIntervals ?? MAX_INTERVALS;
  if (!Number.isInteger(steps) || steps < 0)
    throw new RangeError(`Invalid grid step count ${steps}`);

  // The scanned band, both ends inclusive. The default covers the whole grid, so an unblocked call
  // behaves exactly as it did before the band existed.
  const total = stepCount(steps);
  const fromStep = input.fromStep ?? 0;
  const toStep = input.toStep ?? total;
  if (!Number.isInteger(fromStep) || fromStep < 0)
    throw new RangeError(`Invalid fromStep ${fromStep}`);
  if (!Number.isInteger(toStep) || toStep <= fromStep || toStep > total)
    throw new RangeError(`Invalid toStep ${toStep} for a grid of ${total} steps`);

  registerImmutableTimeline(score);
  registerImmutableScroll(score.scroll);

  const state = new DataView(new ArrayBuffer(0x3b0));
  state.setFloat32(0x354, speedForRowIndex(row), true);
  state.setFloat32(0x358, 1.5, true);
  state.setFloat32(0x3a4, 0, true);

  const count = records.length;
  const intervals = new Int32Array(count * maxIntervals * 2);
  const intervalCounts = new Uint32Array(count);
  const openAt = new Int32Array(count).fill(-1);

  for (let k = fromStep; k < toStep; k++) {
    state.setFloat32(0x300, Math.fround(k * FRAMES_PER_STEP), true);
    for (let i = 0; i < count; i++) {
      const visible = spawnPredicate(state, score, records[i]);
      const open = openAt[i];
      if (visible && open < 0) openAt[i] = k;
      else if (!visible && open >= 0) {
        if (intervalCounts[i] >= maxIntervals)
          throw new RangeError(
            `Record ${i} has more than ${maxIntervals} visible intervals at row ${row}`,
          );
        const at = i * maxIntervals * 2 + intervalCounts[i] * 2;
        intervals[at] = open;
        intervals[at + 1] = k;
        intervalCounts[i]++;
        openAt[i] = -1;
      }
    }
  }

  // A run still open when the band ends covers `toStep` itself and closes just past it, so the
  // band's own last sampled step is included and no further step is claimed.
  let used = 0;
  const packed = new Int32Array(intervals.length);
  const openAtEnd = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    if (openAt[i] >= 0) {
      openAtEnd[i] = 1;
      if (intervalCounts[i] >= maxIntervals)
        throw new RangeError(
          `Record ${i} has more than ${maxIntervals} visible intervals at row ${row}`,
        );
      const at = i * maxIntervals * 2 + intervalCounts[i] * 2;
      intervals[at] = openAt[i];
      intervals[at + 1] = toStep;
      intervalCounts[i]++;
    }
    // Compact the per-record slots so the columns hold no unused gaps.
    for (let n = 0; n < intervalCounts[i]; n++) {
      packed[used++] = intervals[i * maxIntervals * 2 + n * 2];
      packed[used++] = intervals[i * maxIntervals * 2 + n * 2 + 1];
    }
  }

  return {
    row,
    steps,
    fromStep,
    toStep,
    openAtEnd,
    intervals: packed.subarray(0, used),
    intervalCounts,
  };
}

/** First visible time in seconds for each record, or NaN when it is never visible at this row. */
export function firstAppearTimes(table: VisibleIntervals): Float64Array {
  const out = new Float64Array(table.intervalCounts.length).fill(NaN);
  let at = 0;
  for (let i = 0; i < out.length; i++) {
    const count = table.intervalCounts[i];
    if (count > 0) out[i] = table.intervals[at] * STEP_SECONDS;
    at += count * 2;
  }
  return out;
}

/** Whether a step index is inside any of a record's intervals. */
export function visibleAtStep(table: VisibleIntervals, record: number, step: number): boolean {
  let at = 0;
  for (let i = 0; i < record; i++) at += table.intervalCounts[i] * 2;
  for (let n = 0; n < table.intervalCounts[record]; n++) {
    const start = table.intervals[at + n * 2];
    const end = table.intervals[at + n * 2 + 1];
    if (step >= start && step < end) return true;
  }
  return false;
}
