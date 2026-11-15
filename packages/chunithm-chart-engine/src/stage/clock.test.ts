import { describe, expect, it } from "vitest";
import { STAGE_LEAD_IN_TICKS, stageFrameForSeconds } from "./clock";

describe("stageFrameForSeconds", () => {
  it("puts the chart's start after the lead-in the stage has already played", () => {
    expect(STAGE_LEAD_IN_TICKS).toBe(223);
    expect(stageFrameForSeconds(0)).toBe(224);
  });

  it("advances one tick per sixtieth of a second of chart time", () => {
    expect(stageFrameForSeconds(1)).toBe(284);
    expect(Math.floor(stageFrameForSeconds(1 / 60 - 1e-9))).toBe(224);
    expect(stageFrameForSeconds(150.25)).toBe(150.25 * 60 + 224);
    for (const boundary of [1 / 60, 10, 100, 200]) {
      const before = stageFrameForSeconds(boundary - 1e-8);
      const at = stageFrameForSeconds(boundary);
      const after = stageFrameForSeconds(boundary + 1e-8);
      expect(before).toBeLessThan(at);
      expect(after).toBeGreaterThan(at);
      expect(Math.floor(before)).toBe(Math.floor(at) - 1);
      expect(at - before).toBeCloseTo(6e-7, 9);
    }
  });

  it("holds the lead-in tick before the chart starts", () => {
    expect(stageFrameForSeconds(-3)).toBe(224);
    expect(stageFrameForSeconds(-0.001)).toBe(224);
  });
});
