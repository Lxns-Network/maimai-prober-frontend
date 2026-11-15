import { describe, expect, it } from "vitest";
import { TimelineWriter } from "../chart/timeline/writer";
import { Timeline } from "../chart/timeline/reader";
import {
  HUD_INITIAL_VALUES,
  createHudValueReader,
  createHudValues,
  type HudValues,
} from "./timelineValues";
const STEP = 1 / 120;
function timelineOf(rows: [step: number, score: number, gauge: number][]): Timeline {
  const writer = new TimelineWriter();
  rows.forEach(([step, score, gauge], i) =>
    writer.push("score", {
      time: step * STEP,
      score,
      combo: i + 1,
      gauge,
      judgeCounts0: i + 1,
      judgeCounts1: 0,
      judgeCounts2: 0,
      judgeCounts3: i,
    }),
  );
  return Timeline.from(
    writer.finish({
      durationSeconds: 10,
      noteCount: rows.length,
      unsupported: [],
      defaultSpeedRow: 0,
      appearIsPlaceholder: true,
    }),
  );
}
const plain = (values: HudValues) => ({ ...values, counts: [...values.counts] });
describe("createHudValueReader", () => {
  const timeline = timelineOf([
    [149, 100, 1.5],
    [149, 200, 3],
    [150, 300, 4.5],
    [300, 400, 6],
  ]);
  const read = createHudValueReader(timeline);
  it("shows the empty HUD before the first judgment", () => {
    const out = createHudValues();
    expect(plain(read(0, out))).toEqual(plain(HUD_INITIAL_VALUES));
    expect(plain(read(148, out))).toEqual({
      score: 0,
      combo: 0,
      gauge: 0,
      counts: [0, 0, 0, 0],
    });
    expect(plain(read(-1, out))).toEqual(plain(HUD_INITIAL_VALUES));
  });
  it("shows every judgment of a step on that step", () => {
    expect(plain(read(149, createHudValues()))).toEqual({
      score: 200,
      combo: 2,
      gauge: 3,
      counts: [2, 0, 0, 1],
    });
  });
  it("holds the last judged values between judgments and after the last one", () => {
    const out = createHudValues();
    expect(read(150, out).score).toBe(300);
    expect(read(299, out).score).toBe(300);
    expect(read(300, out).score).toBe(400);
    expect(read(100000, out).score).toBe(400);
  });
  it("returns to earlier values on a backward seek", () => {
    const out = createHudValues();
    read(300, out);
    expect(plain(read(10, out))).toEqual(plain(HUD_INITIAL_VALUES));
    expect(read(149, out).combo).toBe(2);
  });
  it("writes into the caller's values without allocating", () => {
    const out = createHudValues();
    const counts = out.counts;
    for (let step = 0; step < 100000; step++) {
      expect(read(step % 400, out)).toBe(out);
    }
    expect(out.counts).toBe(counts);
  });
  it("leaves the shared empty values untouched", () => {
    read(300, createHudValues());
    read(0, createHudValues());
    expect(plain(HUD_INITIAL_VALUES)).toEqual({
      score: 0,
      combo: 0,
      gauge: 0,
      counts: [0, 0, 0, 0],
    });
    expect(Object.isFrozen(HUD_INITIAL_VALUES)).toBe(true);
  });
});
