import { describe, expect, it } from "vitest";
import { spawnSteps } from "./spawnStep";
import {
  spawnPredicate,
  registerImmutableTimeline,
  type NoteTimelineScore,
} from "../../notes/timing";
import { registerImmutableScroll } from "../../notes/space";
import { speedForRowIndex } from "../../notes/tables";
const ROW_BYTES = 32;
/** First grid step at which the spawn predicate holds, found by evaluating every step. */
function denseSpawnSteps(score: NoteTimelineScore, row: number, stepCount: number): Int32Array {
  registerImmutableTimeline(score);
  registerImmutableScroll(score.scroll);
  const state = new DataView(new ArrayBuffer(0x3b0));
  state.setFloat32(0x354, speedForRowIndex(row), true);
  state.setFloat32(0x358, 1.5, true);
  state.setFloat32(0x3a4, 0, true);
  const out = new Int32Array(score.records.length).fill(-1);
  let open = score.records.length;
  for (let k = 0; k < stepCount && open > 0; k++) {
    state.setFloat32(0x300, Math.fround(k * 0.5), true);
    score.records.forEach((record, i) => {
      if (out[i] < 0 && spawnPredicate(state, score, record)) {
        out[i] = k;
        open--;
      }
    });
  }
  return out;
}
function rows(entries: readonly [number, number, number][]): DataView {
  const view = new DataView(new ArrayBuffer(entries.length * ROW_BYTES));
  entries.forEach(([start, end, value], i) => {
    view.setFloat32(i * ROW_BYTES + 8, start, true);
    view.setFloat32(i * ROW_BYTES + 16, value, true);
    view.setFloat32(i * ROW_BYTES + 28, end, true);
  });
  return view;
}
function record(timeMs: number, endMs: number | null, headKey: number, tailKey: number): DataView {
  const view = new DataView(new ArrayBuffer(0x164));
  view.setFloat32(8, timeMs, true);
  view.setInt32(0x10, endMs === null ? 0 : 1, true);
  view.setInt32(0x14, -1, true);
  if (endMs !== null) view.setFloat32(48 + 8, endMs, true);
  view.setInt32(112, headKey, true);
  view.setInt32(116, tailKey, true);
  return view;
}
function lcg(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}
/** Consecutive rows over `[0, spanMs)` with gaps, drawn from `values`. */
function randomRows(
  next: () => number,
  spanMs: number,
  values: readonly number[],
  overlap: boolean,
) {
  const out: [number, number, number][] = [];
  let at = next() * 2000;
  while (at < spanMs) {
    const length = 50 + next() * 4000;
    const value = values[Math.floor(next() * values.length)];
    const start = Math.fround(at);
    const end = Math.fround(at + length);
    out.push([start, end, value]);
    at += overlap && next() < 0.3 ? length * next() : length + next() * 1500;
  }
  return out;
}
function randomScore(seed: number): {
  score: NoteTimelineScore;
  stepCount: number;
} {
  const next = lcg(seed);
  const spanMs = 20000 + next() * 40000;
  const timeline = new Map<number, DataView>();
  for (let key = 0; key < 3; key++)
    timeline.set(
      key,
      rows(randomRows(next, spanMs, [0, 0.25, 0.5, 1, 1.5, 2, 4, 8, 50, -1, -2, -0.5], false)),
    );
  const scroll = rows(randomRows(next, spanMs, [0.5, 1.5, 2, 3, -1, 0, 0.1, 10], true));
  const records: DataView[] = [];
  for (let i = 0; i < 60; i++) {
    const time = Math.fround(next() * spanMs);
    const long = next() < 0.3;
    const key = Math.floor(next() * 5) - 1;
    const tailKey = Math.floor(next() * 5) - 1;
    records.push(record(time, long ? Math.fround(time + next() * 6000) : null, key, tailKey));
  }
  return { score: { records, timeline, scroll }, stepCount: Math.ceil((spanMs / 1000 + 8) * 120) };
}
describe("spawnSteps", () => {
  it("finds the step every-step evaluation finds, across speed changes, stops, reversals and scroll rows", () => {
    let compared = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const { score, stepCount } = randomScore(seed);
      for (const row of [0, 4, 8, 28]) {
        expect(spawnSteps(score, row, stepCount), `seed ${seed} row ${row}`).toEqual(
          denseSpawnSteps(score, row, stepCount),
        );
        compared += score.records.length;
      }
    }
    expect(compared).toBe(24 * 4 * 60);
  }, 600000);
  it("reports -1 for a record that never spawns inside the grid", () => {
    const score = {
      records: [record(600000, null, -1, -1)],
      timeline: new Map(),
      scroll: rows([]),
    };
    expect(spawnSteps(score, 0, 1200)).toEqual(Int32Array.of(-1));
  });
});
