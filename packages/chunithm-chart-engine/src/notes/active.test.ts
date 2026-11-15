import { describe, expect, it } from "vitest";
import { type VisibleIntervals } from "./appear";
import { createActiveSet, removalStep, type ActiveSet } from "./active";
/**
 * Removal times for this task only. The plan's Task 5 uses "the last judge time of each record" as a
 * temporary stand-in for `end`; the real semantics arrive in Task 6. This helper is test-local and
 * must not be exported or written into any artifact.
 */
function temporaryRemovalTimes(input: {
  judgeTimes: Float64Array;
  judgeRecords: Uint32Array;
  recordCount: number;
}): Float64Array {
  const out = new Float64Array(input.recordCount).fill(NaN);
  for (let i = 0; i < input.judgeTimes.length; i++) {
    const record = input.judgeRecords[i];
    if (record >= input.recordCount) continue;
    // Record order is by time within a record's own events, so the last write is the latest judge.
    if (!Number.isFinite(out[record]) || input.judgeTimes[i] >= out[record])
      out[record] = input.judgeTimes[i];
  }
  return out;
}
const activeIds = (set: ActiveSet) => [...set.records().subarray(0, set.count())];
describe("createActiveSet", () => {
  it("treats a removal in the middle of a step as present for that step", () => {
    const table: VisibleIntervals = {
      row: 0,
      steps: 100,
      intervals: Int32Array.from([0, 100]),
      intervalCounts: Uint32Array.from([1]),
    };
    // A removal at 0.005 s falls inside step 0 (which spans [0, 1/120)) and step 1 begins after it.
    const set = createActiveSet(table, Float64Array.from([0.005]));
    set.rebuild(0);
    expect(activeIds(set)).toEqual([0]);
    set.rebuild(removalStep(0.005));
    expect(activeIds(set)).toEqual([]);
    // Never removed means present right up to the interval's last covered step. The interval is
    // half-open `[0, 100)`, so step 99 is covered and step 100 is not.
    const kept = createActiveSet(table, Float64Array.from([Number.NaN]));
    kept.rebuild(99);
    expect(activeIds(kept)).toEqual([0]);
    kept.rebuild(100);
    expect(activeIds(kept)).toEqual([]);
  });
  it("keeps an exact-grid removal through that step and removes it on the next", () => {
    const table: VisibleIntervals = {
      row: 0,
      steps: 200,
      intervals: Int32Array.of(0, 200),
      intervalCounts: Uint32Array.of(1),
    };
    const set = createActiveSet(table, Float64Array.of(1.025));
    set.advanceTo(123);
    expect(activeIds(set)).toEqual([0]);
    set.advanceTo(124);
    expect(activeIds(set)).toEqual([]);
    set.rebuild(123);
    expect(activeIds(set)).toEqual([0]);
  });
  it("rejects a removal column that does not cover every record", () => {
    const table: VisibleIntervals = {
      row: 0,
      steps: 10,
      intervals: Int32Array.from([0, 5]),
      intervalCounts: Uint32Array.from([1, 0]),
    };
    expect(() => createActiveSet(table, Float64Array.from([1]))).toThrow(
      /one removal time per record/,
    );
  });
  it("uses the temporary judge-derived removal times without exposing them", () => {
    // Times deliberately out of record order to prove the last-write rule is time-based, not
    // write-order-based.
    const judgeTimes = Float64Array.from([2.5, 1.25, 4]);
    const judgeRecords = Uint32Array.from([0, 0, 1]);
    const removal = temporaryRemovalTimes({ judgeTimes, judgeRecords, recordCount: 3 });
    expect([...removal]).toEqual([2.5, 4, NaN]);
    // A record judged at 2.5 s is present through the step covering 2.5 s and gone after it.
    const table: VisibleIntervals = {
      row: 0,
      steps: 1000,
      intervals: Int32Array.from([0, 1000, 0, 1000, 0, 1000]),
      intervalCounts: Uint32Array.from([1, 1, 1]),
    };
    const set = createActiveSet(table, removal);
    set.rebuild(Math.floor(2.4 / (1 / 120)));
    expect(activeIds(set)).toEqual([0, 1, 2]);
    set.rebuild(removalStep(2.5));
    expect(activeIds(set)).toEqual([1, 2]);
    set.rebuild(removalStep(4));
    expect(activeIds(set)).toEqual([2]);
    // The record with no judge events is never removed, so it is still present at the end.
    set.rebuild(999);
    expect(activeIds(set)).toEqual([2]);
  });
});
