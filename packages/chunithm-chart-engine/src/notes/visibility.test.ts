import { describe, expect, it } from "vitest";
import { computeJudgeVisibility } from "./visibility";

function record(air = false, primary = 0) {
  const view = new DataView(new ArrayBuffer(356));
  view.setInt32(0x10, primary, true);
  view.setInt32(0x14, air ? 3 : -1, true);
  return view;
}

const input = (
  rows: readonly (readonly [number, number, number, number])[],
  records = [record(true)],
) => ({
  records,
  times: Float64Array.from(rows, (r) => r[0]),
  notes: Uint32Array.from(rows, (r) => r[1]),
  phases: Uint8Array.from(rows, (r) => r[2]),
  parts: Uint8Array.from(rows, (r) => r[3]),
});

describe("computeJudgeVisibility", () => {
  it("attributes cutoffs by part rather than event order or phase alone", () => {
    const visibility = computeJudgeVisibility(
      input([
        [2, 0, 0, 1],
        [1, 0, 0, 2],
        [0.5, 0, 1, 1],
        [3, 0, 2, 1],
      ]),
    );
    expect([...visibility.head]).toEqual([2]);
    expect([...visibility.air]).toEqual([1]);
  });

  it("leaves unjudged parts visible and accepts same-tick independent results", () => {
    const visibility = computeJudgeVisibility(
      input(
        [
          [1, 0, 0, 1],
          [1, 0, 0, 2],
          [2, 1, 0, 1],
        ],
        [record(true), record(true, 1), record()],
      ),
    );
    expect([...visibility.head]).toEqual([1, 2, Infinity]);
    expect([...visibility.air]).toEqual([1, Infinity, Infinity]);
  });

  it("accepts unattributed results only when the record has no attachment", () => {
    expect([...computeJudgeVisibility(input([[1, 0, 0, 0]], [record()])).head]).toEqual([1]);
    expect(() => computeJudgeVisibility(input([[1, 0, 0, 0]]))).toThrow(/attribution.*rebake/i);
  });

  it("rejects malformed parallel columns and out-of-range values", () => {
    const base = input([[1, 0, 0, 1]]);
    expect(() => computeJudgeVisibility({ ...base, phases: new Uint8Array() })).toThrow(/parallel/);
    expect(() => computeJudgeVisibility(input([[1, 1, 0, 1]]))).toThrow(/record/);
    expect(() => computeJudgeVisibility(input([[NaN, 0, 0, 1]]))).toThrow(/finite/);
    expect(() => computeJudgeVisibility(input([[1, 0, 3, 1]]))).toThrow(/phase/);
    expect(() => computeJudgeVisibility(input([[1, 0, 0, 3]]))).toThrow(/part/);
  });
});
