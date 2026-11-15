import { describe, expect, it } from "vitest";
import { TimelineWriter } from "../chart/timeline/writer";
import { Timeline } from "../chart/timeline/reader";
import { assertBakedSpeed, BakedSpeedMismatchError } from "./bakedSpeed";

const finish = (writer: TimelineWriter) =>
  Timeline.from(
    writer.finish({
      durationSeconds: 1,
      noteCount: 2,
      defaultSpeedRow: 4,
      unsupported: [],
      appearIsPlaceholder: true,
    }),
  );

describe("speed row a timeline was baked at", () => {
  it("lets a timeline with no lifecycle-bound rows play at any speed", () => {
    const writer = new TimelineWriter();
    writer.push("judge", { time: 0.5, note: 0, kind: 0, result: 4, part: 1 });
    expect(() => assertBakedSpeed(finish(writer), 9)).not.toThrow();
  });

  it("accepts the baked speed itself", () => {
    const writer = new TimelineWriter();
    writer.push("airmodel", { time: 0, note: 1, part: 0, shown: 1 });
    expect(() => assertBakedSpeed(finish(writer), 4)).not.toThrow();
  });

  it.each([
    ["slide", { time: 0, note: 1, mode: 1 }],
    ["airband", { time: 0, note: 1, mode: 1 }],
    ["airmodel", { time: 0, note: 1, part: 0, shown: 1 }],
    ["motion", { time: 0, note: 1, part: 0xfffa, model: 146, frame: 0.5 }],
  ] as const)("refuses %s rows at another speed and names both rows", (kind, row) => {
    const writer = new TimelineWriter();
    writer.push(kind, row as never);
    try {
      assertBakedSpeed(finish(writer), 9);
      throw new Error("expected a speed mismatch");
    } catch (error) {
      expect(error).toBeInstanceOf(BakedSpeedMismatchError);
      expect(error).toMatchObject({ baked: 4, requested: 9 });
    }
  });
});
