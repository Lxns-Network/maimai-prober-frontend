import { describe, expect, it } from "vitest";
import { extapFrame } from "./extapClock";

describe("ExTAP synchronization clock", () => {
  it("samples exact loop boundaries and fractional steps without retaining seek history", () => {
    for (const [absolute, delta, paused, want] of [
      [216000, 0.5, false, 0.5],
      [216049.5, 0.5, false, 0],
      [216049, 1, false, 0],
      [216049, 1, true, 49],
      [216001.25, 0.5, false, 1.75],
      [216049.5, 0.5, false, 0],
      [216000, 0.5, false, 0.5],
    ] as const)
      expect(extapFrame(absolute, { frameDelta: delta, paused })).toBe(want);
  });

  it.each([-1, NaN, Infinity])("rejects unsupported absolute frame %s", (absolute) => {
    expect(() => extapFrame(absolute, { frameDelta: 0.5, paused: false })).toThrow(/frame/);
  });
});
