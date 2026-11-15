import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAY_TIMING_ROW,
  PLAY_TIMING_OPTIONS,
  playTimingSeconds,
} from "../src/pages/public/Chart/chunithm/options/playTiming";

describe("play timing options", () => {
  it("uses the native row order and zero default", () => {
    expect(PLAY_TIMING_OPTIONS).toHaveLength(41);
    expect(PLAY_TIMING_OPTIONS[0]).toEqual({ value: "0", label: "-2.0" });
    expect(PLAY_TIMING_OPTIONS[DEFAULT_PLAY_TIMING_ROW]).toEqual({ value: "20", label: "0.0" });
    expect(PLAY_TIMING_OPTIONS[40]).toEqual({ value: "40", label: "+2.0" });
    expect(playTimingSeconds(20)).toBe(0);
    expect(playTimingSeconds(0)).toBe(-2 / 60);
    expect(playTimingSeconds(21)).toBe(Math.fround(0.1) / 60);
    expect(playTimingSeconds(40)).toBe(2 / 60);
    expect(() => playTimingSeconds(41)).toThrow(/Invalid/);
  });
});
