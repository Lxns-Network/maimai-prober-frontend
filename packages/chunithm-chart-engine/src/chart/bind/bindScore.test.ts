import { describe, expect, it } from "vitest";
import { realWidth } from "../parse/c2s/score/common";
import { parseC2s } from "../parse/parseChart";
import { bindScore } from "./bindScore";
import { REAL_WIDTH } from "./realWidth";

describe("bindScore", () => {
  it("reports unsupported note types and keeps the rest", () => {
    const parsed = parseC2s(new TextEncoder().encode("VERSION\t1.13.00\t1.13.00\n"), {
      difficulty: 0,
      mirror: false,
    });
    const fake = new DataView(new ArrayBuffer(0x164));
    fake.setInt32(0x10, 77, true);
    const bound = bindScore(
      { ...parsed, canonicalRecords: [fake] } as never,
      new DataView(new ArrayBuffer(0xb0c)),
      { difficulty: 0, mirror: false },
    );
    expect(bound.unsupported).toEqual([{ type: 77, count: 1 }]);
    expect(bound.records).toEqual([fake]);
  });

  it("uses the same width table as the parser", () => {
    for (let i = -1; i <= REAL_WIDTH.length; i++)
      expect(i < 0 || i >= REAL_WIDTH.length ? 0 : REAL_WIDTH[i]).toBe(realWidth(i));
  });
});
