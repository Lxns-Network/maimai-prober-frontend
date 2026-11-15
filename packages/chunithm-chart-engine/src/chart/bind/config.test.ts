import { describe, expect, it } from "vitest";
import { bindRowsFromConfig, compileJudgeTimingIni } from "./config";
import {
  JUDGE_TIMING_DERIVED,
  JUDGE_TIMING_FLOAT_KEYS,
  JUDGE_TIMING_INT_KEYS,
} from "./judgeTimingTables";
describe("bindRowsFromConfig", () => {
  it("selects rows by difficulty and negates limits", () => {
    const cfg = new DataView(new ArrayBuffer(0xb0c));
    for (let row = 0; row < 8; row++) {
      const base = 0x580 + 56 * row;
      cfg.setInt32(base, 1, true);
      cfg.setInt32(base + 4, row % 2, true);
      cfg.setFloat32(base + 8, row + 0.5, true);
      cfg.setFloat32(base + 28, row + 0.25, true);
      cfg.setFloat32(base + 32, 10 + row, true);
      cfg.setFloat32(base + 52, 20 + row, true);
    }
    const easy = bindRowsFromConfig(cfg, 0);
    const hard = bindRowsFromConfig(cfg, 3);
    expect(easy.map((r) => r.earlyLimit)).toEqual([-0.5, -2.5, -4.5, -6.5]);
    expect(hard.map((r) => r.earlyLimit)).toEqual([-1.5, -3.5, -4.5, -6.5]);
    expect(hard[0]).toEqual({
      enable: true,
      unify: true,
      earlyLimit: -1.5,
      earlyFloor: -1.25,
      lateFloor: 21,
      lateLimit: 11,
    });
    expect(easy[0].unify).toBe(false);
  });
});
describe("compileJudgeTimingIni", () => {
  it("falls back to each key's built-in value when the file sets no keys", () => {
    const cfg = compileJudgeTimingIni(new Uint8Array());
    expect(cfg.byteLength).toBe(0xb0c);
    for (const e of JUDGE_TIMING_INT_KEYS)
      expect(cfg.getInt32((1 + e.index) * 4, true)).toBe(e.fallback);
    for (const e of JUDGE_TIMING_FLOAT_KEYS)
      expect(cfg.getUint32((63 + e.index) * 4, true)).toBe(e.fallbackBits);
    for (const [destination, source] of JUDGE_TIMING_DERIVED)
      expect(cfg.getUint32(destination * 4, true)).toBe(cfg.getUint32(source * 4, true));
  });
  it("reads keys case-insensitively, lets later duplicates win and rounds decimals once", () => {
    const tap = JUDGE_TIMING_FLOAT_KEYS.find(
      (e) => e.section === "TAP.EASY" && e.key === "FAST_MIS",
    )!;
    const cut = JUDGE_TIMING_INT_KEYS.find((e) => e.section === "TAP.EASY" && e.key === "CUT")!;
    const ini = [
      "[TAP.EASY]",
      "fast_mis = 1.0",
      "CUT = 7 ; note",
      "[TAP.EASY]",
      // Exactly below the midpoint of two floats; rounding through a double would round up.
      "FAST_MIS = 0.10000000521540641784667968749999",
    ].join("\r\n");
    const cfg = compileJudgeTimingIni(new TextEncoder().encode(ini));
    expect(cfg.getInt32((1 + cut.index) * 4, true)).toBe(7);
    expect(cfg.getUint32((63 + tap.index) * 4, true)).toBe(0x3dcccccd);
  });
  it("rejects values that are not numbers", () => {
    const compile = (text: string) => () => compileJudgeTimingIni(new TextEncoder().encode(text));
    expect(compile("[TAP.EASY]\nCUT = x\n")).toThrow(RangeError);
    expect(compile("[TAP.EASY]\nFAST_MIS = .\n")).toThrow(RangeError);
  });
});
