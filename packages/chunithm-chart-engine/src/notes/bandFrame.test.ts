import { describe, expect, it } from "vitest";
import { writeBandFrameWords } from "./bandFrame";
describe("band frame rebuilt from the record", () => {
  it("rejects an output array too short for the six words", () => {
    const state = new DataView(new ArrayBuffer(0x3b0));
    const plan = { headKey: 0, tailKey: 0, headFrames: 0, tailFrames: 0, lane: 0, width: 1 };
    const score = { records: [], timeline: new Map(), scroll: new DataView(new ArrayBuffer(0)) };
    expect(() =>
      writeBandFrameWords(
        new Uint32Array(5),
        plan,
        state,
        score,
        0,
        0,
        new DataView(new ArrayBuffer(4)),
      ),
    ).toThrow(/needs 6 words/);
  });
});
