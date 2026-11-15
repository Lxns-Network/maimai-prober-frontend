import { describe, expect, it } from "vitest";
import { parseC2s, ChartParseError } from "./parseChart";
describe("parseC2s", () => {
  it("accepts an empty chart without throwing a non-parse error", () => {
    const parsed = parseC2s(new TextEncoder().encode("VERSION\t1.13.00\t1.13.00\n"), {
      difficulty: 0,
      mirror: false,
    });
    expect(parsed.notes.length).toBe(0);
  });
  it("wraps arbitrary binary input in ChartParseError", () => {
    const junk = new Uint8Array(256).map((_, i) => (i * 37) & 255);
    let parsed: ReturnType<typeof parseC2s> | null = null;
    try {
      parsed = parseC2s(junk, { difficulty: 0, mirror: false });
    } catch (e) {
      expect(e).toBeInstanceOf(ChartParseError);
      return;
    }
    expect(parsed.notes.length).toBe(0);
  });
});
