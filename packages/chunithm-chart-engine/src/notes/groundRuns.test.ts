import { describe, expect, it } from "vitest";
import { TimelineWriter } from "../chart/timeline/writer";
import { Timeline } from "../chart/timeline/reader";
import { coverRuns, groundRunsOf } from "./groundRuns";
import type { VisibleIntervals } from "./appear";
import { GROUND_MAIN_PART, GROUND_TAIL_PART, PLAIN_AIR_PART } from "../chart/bake/events";

type Model = { time: number; note: number; part: number; shown: number };

const timelineOf = (models: Model[]) => {
  const writer = new TimelineWriter();
  for (const e of models) writer.push("airmodel", e);
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

const table = (perRecord: [number, number][][], fromStep = 0, toStep = 1000): VisibleIntervals => ({
  row: 0,
  steps: toStep - 1,
  fromStep,
  toStep,
  intervals: Int32Array.from(perRecord.flat(2)),
  intervalCounts: Uint32Array.from(perRecord, (list) => list.length),
});

const intervalsOf = (visible: VisibleIntervals) => {
  const out: [number, number][][] = [];
  let at = 0;
  for (const count of visible.intervalCounts) {
    const list: [number, number][] = [];
    for (let n = 0; n < count; n++) list.push([visible.intervals[at++], visible.intervals[at++]]);
    out.push(list);
  }
  return out;
};

describe("ground runs", () => {
  it("joins the steps any ground part of a record was observed shown, ignoring AIR parts", () => {
    const runs = groundRunsOf(
      timelineOf([
        { time: 1, note: 2, part: GROUND_MAIN_PART, shown: 1 },
        { time: 1.5, note: 2, part: GROUND_TAIL_PART, shown: 1 },
        { time: 2, note: 2, part: GROUND_MAIN_PART, shown: 0 },
        { time: 2.5, note: 2, part: GROUND_TAIL_PART, shown: 0 },
        { time: 3, note: 3, part: GROUND_MAIN_PART, shown: 0 },
        { time: 4, note: 3, part: GROUND_MAIN_PART, shown: 1 },
        { time: 4, note: 5, part: PLAIN_AIR_PART, shown: 1 },
      ]),
      8,
    );
    expect([...runs]).toEqual([
      [2, [[120, 300]]],
      [3, [[480, Infinity]]],
    ]);
  });

  it("widens a record's visible intervals to cover its observed runs within the scanned band", () => {
    const covered = coverRuns(
      table(
        [
          [
            [10, 20],
            [30, 40],
          ],
          [],
          [[5, 8]],
          [[60, 70]],
        ],
        0,
        100,
      ),
      new Map([
        [0, [[15, 35]] as [number, number][]],
        [1, [[50, Infinity]] as [number, number][]],
        [2, [[100, 110]] as [number, number][]],
        [3, [[70, 80]] as [number, number][]],
      ]),
    );
    expect(intervalsOf(covered)).toEqual([[[10, 40]], [[50, 100]], [[5, 8]], [[60, 80]]]);
    expect([...covered.openAtEnd!]).toEqual([0, 1, 0, 0]);
    expect([covered.fromStep, covered.toStep, covered.row]).toEqual([0, 100, 0]);
  });

  it("clips a run to a band that starts after it began", () => {
    const covered = coverRuns(
      table([[]], 50, 100),
      new Map([[0, [[40, 60]] as [number, number][]]]),
    );
    expect(intervalsOf(covered)).toEqual([[[50, 60]]]);
  });
});
