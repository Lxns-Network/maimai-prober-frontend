import { describe, expect, it } from "vitest";
import { assembleEvents, PHASE } from "../emissions";
import { GROUND_MAIN_PART } from "../../bake/events";
describe("assembleEvents", () => {
  it("records a part's visibility only when it changes, in step, phase and list order", () => {
    const object = (record: number, order: number) => ({
      record,
      className: "TapNote" as const,
      slot: 8 as const,
      spawn: 0,
      order,
    });
    const events = assembleEvents([
      {
        object: object(5, 1),
        removal: 9,
        judges: [{ step: 4, phase: PHASE.tick, result: 4, judgePhase: 0, part: 1 }],
        models: [
          { step: 0, phase: PHASE.spawn, part: GROUND_MAIN_PART, shown: 0 },
          { step: 2, phase: PHASE.tick, part: GROUND_MAIN_PART, shown: 1 },
          { step: 3, phase: PHASE.tick, part: GROUND_MAIN_PART, shown: 1 },
          { step: 4, phase: PHASE.tick, part: GROUND_MAIN_PART, shown: 0 },
        ],
      },
      {
        object: object(2, 0),
        removal: 9,
        judges: [{ step: 4, phase: PHASE.tick, result: 4, judgePhase: 0, part: 1 }],
        models: [{ step: 4, phase: PHASE.remove, part: GROUND_MAIN_PART, shown: 0 }],
      },
    ]);
    expect(
      events.filter((e) => e.kind === "judge").map((e) => e.kind === "judge" && e.note),
    ).toEqual([2, 5]);
    expect(
      events
        .filter((e) => e.kind === "airmodel")
        .map((e) => e.kind === "airmodel" && [Math.round(e.time * 120), e.note, e.shown]),
    ).toEqual([
      [0, 5, 0],
      [2, 5, 1],
      [4, 5, 0],
      [4, 2, 0],
    ]);
  });
});
