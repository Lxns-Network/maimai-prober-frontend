import { describe, expect, it } from "vitest";
import { firstCommitStep, type LaneChecker } from "./autoplayJudge";

/** Reference commit test from the automatic TAP checker, one step at a time. */
function commits(delta: number, checker: LaneChecker, threshold: number): boolean {
  if (checker.early > delta) return false;
  return delta >= threshold || !(delta < checker.late);
}

describe("autoplay judge", () => {
  it("finds the first step at which the checker commits, from a given step", () => {
    const checker = { early: Math.fround(-6.5), late: Math.fround(9.25) };
    for (const threshold of [Math.fround(0), Math.fround(-0.1), Math.fround(12)])
      for (const noteFrames of [
        Math.fround(0),
        Math.fround(3.3),
        Math.fround(1234.567),
        Math.fround(80000.25),
      ])
        for (const from of [0, 5, Math.floor(noteFrames * 2) + 30]) {
          let k = from;
          while (!commits(Math.fround(Math.fround(k * 0.5) - noteFrames), checker, threshold)) k++;
          expect(firstCommitStep(noteFrames, checker, threshold, from)).toBe(k);
        }
  });
});
