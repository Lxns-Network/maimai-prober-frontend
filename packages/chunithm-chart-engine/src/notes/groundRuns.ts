import type { Timeline } from "../chart/timeline/reader";
import { isGroundPart } from "../chart/bake/events";
import { secondsForStep, stepForSeconds } from "../loop/audioClock";
import type { VisibleIntervals } from "./appear";

/** Grid-step runs `[start, end)` per record, ascending and disjoint; `end` is `Infinity` when open. */
export type StepRuns = ReadonlyMap<number, readonly (readonly [number, number])[]>;

/** First grid step whose time is at or after `seconds`, where an event at that time takes effect. */
function effectiveStep(seconds: number): number {
  const step = stepForSeconds(seconds);
  return secondsForStep(step) < seconds ? step + 1 : step;
}

function merged(list: [number, number][]): [number, number][] {
  list.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [start, end] of list) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

/**
 * The grid steps at which the bake observed any ground part of each record shown, keyed by record in
 * ascending order. A part's state at a step is its latest `airmodel` event at or before the step.
 *
 * @throws RangeError when an event names a record outside the score.
 */
export function groundRunsOf(
  timeline: Timeline,
  recordCount: number,
): Map<number, [number, number][]> {
  const time = timeline.column("airmodel", "time") as Float64Array;
  const note = timeline.column("airmodel", "note") as Uint32Array;
  const part = timeline.column("airmodel", "part") as Uint16Array;
  const shown = timeline.column("airmodel", "shown") as Uint8Array;
  const opened = new Map<number, number>();
  const pieces = new Map<number, [number, number][]>();
  const add = (record: number, start: number, end: number) => {
    if (end <= start) return;
    let list = pieces.get(record);
    if (!list) pieces.set(record, (list = []));
    list.push([start, end]);
  };
  for (let i = 0; i < time.length; i++) {
    if (!isGroundPart(part[i])) continue;
    if (note[i] >= recordCount)
      throw new RangeError(`Model event ${i} names record ${note[i]} of ${recordCount}`);
    const key = note[i] * 0x10000 + part[i];
    const step = effectiveStep(time[i]);
    const start = opened.get(key);
    if (shown[i]) {
      if (start === undefined) opened.set(key, step);
    } else if (start !== undefined) {
      opened.delete(key);
      add(note[i], start, step);
    }
  }
  for (const [key, start] of opened) add(Math.floor(key / 0x10000), start, Infinity);
  const runs = new Map<number, [number, number][]>();
  for (const record of [...pieces.keys()].sort((a, b) => a - b))
    runs.set(record, merged(pieces.get(record)!));
  return runs;
}

/**
 * Widens each record's visible intervals to cover its runs, clipped to the scanned band. A record's
 * last interval is open at the end when the scan left it open or one of its runs continues past the
 * band.
 */
export function coverRuns(visible: VisibleIntervals, runs: StepRuns): VisibleIntervals {
  const fromStep = visible.fromStep ?? 0;
  const toStep = visible.toStep ?? visible.steps + 1;
  const counts = visible.intervalCounts;
  const intervals: number[] = [];
  const intervalCounts = new Uint32Array(counts.length);
  const openAtEnd = new Uint8Array(counts.length);
  let at = 0;
  for (let record = 0; record < counts.length; record++) {
    const list: [number, number][] = [];
    for (let n = 0; n < counts[record]; n++, at += 2)
      list.push([visible.intervals[at], visible.intervals[at + 1]]);
    let open = visible.openAtEnd?.[record] === 1;
    for (const [start, end] of runs.get(record) ?? []) {
      const from = Math.max(start, fromStep);
      const to = Math.min(end, toStep);
      if (from >= to) continue;
      list.push([from, to]);
      if (end > toStep) open = true;
    }
    const covered = merged(list);
    for (const [start, end] of covered) intervals.push(start, end);
    intervalCounts[record] = covered.length;
    openAtEnd[record] = open ? 1 : 0;
  }
  return { ...visible, openAtEnd, intervals: Int32Array.from(intervals), intervalCounts };
}
