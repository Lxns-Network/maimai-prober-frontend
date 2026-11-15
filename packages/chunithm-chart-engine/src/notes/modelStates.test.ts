import { describe, expect, it } from "vitest";
import { TimelineWriter } from "../chart/timeline/writer";
import { Timeline } from "../chart/timeline/reader";
import { createModelStates } from "./modelStates";
import { GROUND_MAIN_PART, GROUND_TAIL_PART, slideJointPart } from "../chart/bake/events";

type Model = { time: number; note: number; part: number; shown: number };
type Band = { time: number; note: number; mode: number };

const timelineOf = (models: Model[], bands: Band[]) => {
  const writer = new TimelineWriter();
  for (const e of models) writer.push("airmodel", e);
  for (const e of bands) writer.push("airband", e);
  return Timeline.from(
    writer.finish({
      durationSeconds: 10,
      noteCount: 8,
      defaultSpeedRow: 0,
      unsupported: [],
      appearIsPlaceholder: true,
    }),
  );
};

describe("model states", () => {
  const step = (seconds: number) => Math.round(seconds * 120);

  it("reports a part shown from its first event to its next", () => {
    const states = createModelStates(
      timelineOf(
        [
          { time: 1, note: 2, part: 3, shown: 1 },
          { time: 2, note: 2, part: 3, shown: 0 },
        ],
        [],
      ),
      8,
    );
    expect(states.has(2)).toBe(true);
    expect(states.has(3)).toBe(false);
    expect(states.shownAt(2, 3, step(0.5))).toBe(false);
    expect(states.shownAt(2, 3, step(1))).toBe(true);
    expect(states.shownAt(2, 3, step(1.5))).toBe(true);
    expect(states.shownAt(2, 3, step(2))).toBe(false);
    expect(states.shownAt(2, 4, step(1.5))).toBe(false);
  });

  it("counts a ground part only when it is named", () => {
    const states = createModelStates(
      timelineOf(
        [
          { time: 1, note: 2, part: GROUND_MAIN_PART, shown: 0 },
          { time: 1, note: 3, part: GROUND_TAIL_PART, shown: 1 },
          { time: 1, note: 4, part: slideJointPart(5), shown: 1 },
          { time: 1, note: 4, part: 7, shown: 1 },
        ],
        [],
      ),
      8,
    );
    expect([2, 3, 4].map((record) => states.has(record))).toEqual([false, false, true]);
    expect(states.has(2, GROUND_MAIN_PART)).toBe(true);
    expect(states.has(2, GROUND_TAIL_PART)).toBe(false);
    expect(states.has(3, GROUND_TAIL_PART)).toBe(true);
    expect(states.has(4, slideJointPart(5))).toBe(true);
    expect(states.has(4, 7)).toBe(true);
    expect(states.shownAt(3, GROUND_TAIL_PART, step(1))).toBe(true);
  });

  it("reports the band mode as the latest event at or before the step, ended before the first", () => {
    const states = createModelStates(
      timelineOf(
        [],
        [
          { time: 1, note: 5, mode: 0 },
          { time: 1, note: 6, mode: 1 },
          { time: 2, note: 5, mode: 2 },
          { time: 2, note: 5, mode: 1 },
          { time: 3, note: 5, mode: 3 },
        ],
      ),
      8,
    );
    expect(states.modeAt(5, step(0.5))).toBe(3);
    expect(states.modeAt(5, step(1))).toBe(0);
    expect(states.modeAt(5, step(2))).toBe(1);
    expect(states.modeAt(5, step(2.5))).toBe(1);
    expect(states.modeAt(5, step(3))).toBe(3);
    expect(states.modeAt(6, step(9))).toBe(1);
    expect(states.modeAt(7, step(9))).toBe(3);
  });

  it("rejects events outside the score or with an unknown mode", () => {
    expect(() =>
      createModelStates(timelineOf([{ time: 1, note: 8, part: 0, shown: 1 }], []), 8),
    ).toThrow(/record 8/);
    expect(() => createModelStates(timelineOf([], [{ time: 1, note: 9, mode: 0 }]), 8)).toThrow(
      /record 9/,
    );
    expect(() => createModelStates(timelineOf([], [{ time: 1, note: 1, mode: 4 }]), 8)).toThrow(
      /mode 4/,
    );
  });
});
