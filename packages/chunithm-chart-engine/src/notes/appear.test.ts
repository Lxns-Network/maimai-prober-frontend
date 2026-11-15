import { describe, expect, it } from "vitest";
import { computeAppear, firstAppearTimes, recordEndMs, stepsForScore } from "./appear";
import { type NoteTimelineScore } from "./timing";
describe("computeAppear", () => {
  it("reports no intervals for an empty score", () => {
    const empty: NoteTimelineScore = {
      records: [],
      timeline: new Map(),
      scroll: new DataView(new ArrayBuffer(0)),
    };
    const table = computeAppear({ records: [], score: empty, row: 0, steps: 10 });
    expect(table.intervalCounts.length).toBe(0);
    expect(table.intervals.length).toBe(0);
    expect(firstAppearTimes(table).length).toBe(0);
  });
});
describe("stepsForScore", () => {
  it("runs the grid past an AIR long note that outlasts its parent", () => {
    const record = new DataView(new ArrayBuffer(0x164));
    record.setInt32(0x10, 2, true);
    record.setInt32(0x14, 5, true);
    record.setFloat32(0x08, 166004, true);
    record.setFloat32(0x38, 172504, true);
    record.setFloat32(0x20, 175254, true);
    expect(stepsForScore([record])).toBe(21271);
    expect(recordEndMs(record)).toBe(175254);
  });
});
