import { describe, expect, it } from "vitest";
import { computeEnd, UNJUDGED_GRACE_SECONDS } from "./end";
describe("computeEnd", () => {
  it("requests record removal at its last result", () => {
    const end = computeEnd({
      judgeTimes: Float64Array.from([1, 1.5, 2]),
      judgeRecords: Uint32Array.from([0, 0, 1]),
      isLong: () => false,
      endSeconds: () => 0,
      recordCount: 2,
    });
    // The last judge event of record 0 is at 1.5, not the later-written 1.0.
    expect(end[0]).toBeCloseTo(1.5, 12);
    expect(end[1]).toBeCloseTo(2, 12);
  });
  it("does not add a second retention step before active-set removal", () => {
    const end = computeEnd({
      judgeTimes: Float64Array.of(6.216666666666667),
      judgeRecords: Uint32Array.of(0),
      isLong: () => false,
      endSeconds: () => 0,
      recordCount: 1,
    });
    expect(end[0]).toBe(6.216666666666667);
  });
  it("prefers the latest judge time regardless of column order", () => {
    const forward = computeEnd({
      judgeTimes: Float64Array.from([1, 2, 3]),
      judgeRecords: Uint32Array.from([0, 0, 0]),
      isLong: () => false,
      endSeconds: () => 0,
      recordCount: 1,
    });
    const shuffled = computeEnd({
      judgeTimes: Float64Array.from([3, 1, 2]),
      judgeRecords: Uint32Array.from([0, 0, 0]),
      isLong: () => false,
      endSeconds: () => 0,
      recordCount: 1,
    });
    expect([...forward]).toEqual([...shuffled]);
  });
  it("falls back to the record's own end for an unjudged record", () => {
    const end = computeEnd({
      judgeTimes: Float64Array.from([1]),
      judgeRecords: Uint32Array.from([0]),
      isLong: (record) => record === 1,
      endSeconds: (record) => (record === 1 ? 4 : 2),
      recordCount: 3,
    });
    expect(end[1]).toBeCloseTo(4 + UNJUDGED_GRACE_SECONDS, 12);
    expect(end[2]).toBeCloseTo(2 + UNJUDGED_GRACE_SECONDS, 12);
  });
  it("rejects judge columns that are not parallel or name an out-of-range record", () => {
    const base = { isLong: () => false, endSeconds: () => 0, recordCount: 2 };
    expect(() =>
      computeEnd({
        ...base,
        judgeTimes: Float64Array.from([1, 2]),
        judgeRecords: Uint32Array.from([0]),
      }),
    ).toThrow(/parallel/);
    expect(() =>
      computeEnd({
        ...base,
        judgeTimes: Float64Array.from([1]),
        judgeRecords: Uint32Array.from([5]),
      }),
    ).toThrow(/names record 5/);
    expect(() =>
      computeEnd({
        ...base,
        judgeTimes: Float64Array.from([Number.NaN]),
        judgeRecords: Uint32Array.from([0]),
      }),
    ).toThrow(/non-finite/);
  });
  it("leaves a record's end at or after its own judge time", () => {
    // The removal must never precede the event that triggered it.
    const end = computeEnd({
      judgeTimes: Float64Array.from([0, 0.5, 175.225]),
      judgeRecords: Uint32Array.from([0, 1, 2]),
      isLong: () => false,
      endSeconds: () => 0,
      recordCount: 3,
    });
    for (const [record, time] of [
      [0, 0],
      [1, 0.5],
      [2, 175.225],
    ] as const)
      expect(end[record]).toBeGreaterThanOrEqual(time);
  });
});
