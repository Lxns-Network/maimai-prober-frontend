/**
 * Records drawn at a given grid step: the visible intervals narrowed by each record's removal time.
 *
 * A record is present while any of its intervals covers the step, and is dropped once its removal
 * time has passed even when an interval is still open. Presence is therefore decided by two
 * independent reasons, so both are tracked separately and membership is recomputed from them rather
 * than from whichever event happened to arrive last — an interval closing after another has opened,
 * or a removal landing inside an open interval, must not evict a record that is still drawn.
 *
 * Forward stepping touches only the events at that step; a seek rebuilds by binary search.
 */

import type { VisibleIntervals } from "./appear";
import { stepForSeconds } from "../loop/audioClock";

/** Record indices present at one grid step. */
export interface ActiveSet {
  /** Grid step the set currently reflects. */
  readonly step: number;
  /** Present record indices, ascending, valid up to {@link count}. */
  records(): Int32Array;
  /** Number of entries in {@link records}. */
  count(): number;
  /** Rebuilds the set for an arbitrary step; safe to call with steps in any order. */
  rebuild(step: number): void;
  /** Advances to a step at or after the current one, touching only the events crossed. */
  advanceTo(step: number): void;
}

/**
 * Sentinel for a record that is never removed.
 *
 * It must fit an int32: the removal column is stored in an `Int32Array`, and a larger value would
 * truncate — `MAX_SAFE_INTEGER` becomes -1, which reads as "removed from the very first step".
 * Any step count below this is treated as unremoved.
 */
export const NEVER_REMOVED = 0x7fffffff;

/**
 * First grid step at which a record removed at this time is no longer drawn.
 *
 * The step strictly after the removal time, so a record removed mid-step is still drawn for the
 * whole of the step that covers the removal. A non-finite time means the record is never removed.
 */
export function removalStep(seconds: number): number {
  if (!Number.isFinite(seconds)) return NEVER_REMOVED;
  return Math.min(NEVER_REMOVED, (seconds < 0 ? -1 : stepForSeconds(seconds)) + 1);
}

interface Event {
  step: number;
  record: number;
}

/** First event index whose step is strictly greater than the query step. */
function upperBoundStep(events: Event[], step: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid].step <= step) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** First index of a non-decreasing value column strictly greater than the query value. */
function upperBoundValue(values: Int32Array, value: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Builds the active set. `removalSeconds[i]` is when record `i` stops being drawn; a non-finite
 * value keeps it present for as long as it is visible.
 */
export function createActiveSet(table: VisibleIntervals, removalSeconds: Float64Array): ActiveSet {
  const { intervals, intervalCounts } = table;
  const recordCount = intervalCounts.length;
  if (removalSeconds.length !== recordCount)
    throw new RangeError(
      `Active set needs one removal time per record: ${removalSeconds.length} for ${recordCount} records`,
    );

  let intervalTotal = 0;
  for (const count of intervalCounts) intervalTotal += count;

  const enters = new Array<Event>(intervalTotal);
  const leaves = new Array<Event>(intervalTotal);
  let at = 0;
  let eventCount = 0;
  for (let record = 0; record < recordCount; record++) {
    for (let n = 0; n < intervalCounts[record]; n++) {
      enters[eventCount] = { step: intervals[at + n * 2], record };
      leaves[eventCount] = { step: intervals[at + n * 2 + 1], record };
      eventCount++;
    }
    at += intervalCounts[record] * 2;
  }
  enters.length = eventCount;
  leaves.length = eventCount;
  // Ties keep record order so the active list stays ascending and comparable across rebuilds.
  enters.sort((a, b) => a.step - b.step || a.record - b.record);
  leaves.sort((a, b) => a.step - b.step || a.record - b.record);

  const removalSteps = new Int32Array(recordCount);
  for (let record = 0; record < recordCount; record++)
    removalSteps[record] = removalStep(removalSeconds[record]);
  // Removal times in ascending order, with the record index beside each, so the cursor can be
  // located by binary search and replayed in order.
  const removalOrder = new Int32Array(recordCount);
  for (let record = 0; record < recordCount; record++) removalOrder[record] = record;
  const sorted = Array.from(removalOrder).sort(
    (a, b) => removalSteps[a] - removalSteps[b] || a - b,
  );
  const removalColumn = new Int32Array(recordCount);
  for (let k = 0; k < recordCount; k++) {
    removalOrder[k] = sorted[k];
    removalColumn[k] = removalSteps[sorted[k]];
  }

  const openCount = new Int32Array(recordCount);
  const removed = new Uint8Array(recordCount);
  const active = new Int32Array(recordCount);
  /** Position of each record within `active`, or -1 when it is not present. */
  const activeAt = new Int32Array(recordCount).fill(-1);
  let activeCount = 0;

  const insert = (record: number): void => {
    if (activeAt[record] >= 0) return;
    activeAt[record] = activeCount;
    active[activeCount++] = record;
  };

  const remove = (record: number): void => {
    const position = activeAt[record];
    if (position < 0) return;
    const last = active[--activeCount];
    active[position] = last;
    activeAt[last] = position;
    activeAt[record] = -1;
  };

  /** Membership is derived from both reasons at once, so event order cannot change the outcome. */
  const sync = (record: number): void => {
    if (openCount[record] > 0 && removed[record] === 0) insert(record);
    else remove(record);
  };

  /**
   * Insertion sort over the live prefix.
   *
   * Indexed directly rather than through `subarray`: a typed-array view allocates a small object per
   * call, which is invisible in a timing run but shows up as heap growth across frames.
   */
  const sortActive = (): void => {
    for (let i = 1; i < activeCount; i++) {
      const value = active[i];
      let j = i - 1;
      while (j >= 0 && active[j] > value) {
        active[j + 1] = active[j];
        j--;
      }
      active[j + 1] = value;
    }
    for (let i = 0; i < activeCount; i++) activeAt[active[i]] = i;
  };

  let currentStep = -1;
  let enterCursor = 0;
  let leaveCursor = 0;
  let removalCursor = 0;

  const rebuild = (step: number): void => {
    activeCount = 0;
    activeAt.fill(-1);
    openCount.fill(0);
    removed.fill(0);
    enterCursor = upperBoundStep(enters, step);
    leaveCursor = upperBoundStep(leaves, step);
    removalCursor = upperBoundValue(removalColumn, step);
    // Tally both interval streams in full, then the removals, so the result does not depend on how
    // the three event orders interleave.
    for (let i = 0; i < enterCursor; i++) openCount[enters[i].record]++;
    for (let i = 0; i < leaveCursor; i++) openCount[leaves[i].record]--;
    for (let k = 0; k < removalCursor; k++) removed[removalOrder[k]] = 1;
    for (let record = 0; record < recordCount; record++)
      if (openCount[record] > 0 && !removed[record]) insert(record);
    sortActive();
    currentStep = step;
  };

  const advanceTo = (step: number): void => {
    if (!Number.isFinite(step)) return;
    const target = Math.trunc(step);
    if (currentStep < 0 || target < currentStep) {
      rebuild(target);
      return;
    }
    while (enterCursor < enters.length && enters[enterCursor].step <= target) {
      const record = enters[enterCursor++].record;
      openCount[record]++;
      sync(record);
    }
    while (leaveCursor < leaves.length && leaves[leaveCursor].step <= target) {
      const record = leaves[leaveCursor++].record;
      openCount[record]--;
      sync(record);
    }
    while (removalCursor < recordCount && removalColumn[removalCursor] <= target) {
      const record = removalOrder[removalCursor++];
      removed[record] = 1;
      sync(record);
    }
    sortActive();
    currentStep = target;
  };

  rebuild(0);

  return {
    get step() {
      return currentStep;
    },
    records: () => active,
    count: () => activeCount,
    rebuild,
    advanceTo,
  };
}
