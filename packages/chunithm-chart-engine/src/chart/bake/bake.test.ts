import { describe, expect, it } from "vitest";
import { bake } from "./bake";
import { Timeline } from "../timeline/reader";
import type { BoundScore } from "../bind/bindScore";

const bound = {
  records: [],
  parsed: { notes: [] },
  unsupported: [{ type: 77, count: 1 }],
} as unknown as BoundScore;

const CONTEXT = { musicId: 2999 };

function record(type: number) {
  const view = new DataView(new ArrayBuffer(0x164));
  view.setInt32(0x10, type, true);
  return view;
}

describe("bake", () => {
  it("preserves independently attributed results even when AIR commits first", () => {
    const tl = Timeline.from(
      bake(
        bound,
        () => [
          { kind: "judge", time: 1, note: 0, result: 4, phase: 0, part: 2 },
          { kind: "judge", time: 2, note: 0, result: 4, phase: 0, part: 1 },
        ],
        CONTEXT,
      ),
    );
    expect([...tl.column("judge", "part")]).toEqual([2, 1]);
  });

  it("uses the primary result for the note head when its attachment commits earlier", () => {
    const score = { ...bound, records: [record(0)] } as BoundScore;
    const tl = Timeline.from(
      bake(
        score,
        () => [
          { kind: "judge", time: 1, note: 0, result: 4, phase: 0, part: 2 },
          { kind: "judge", time: 2, note: 0, result: 4, phase: 0, part: 1 },
        ],
        CONTEXT,
      ),
    );
    expect([...tl.column("note", "judgeTime")]).toEqual([2]);
  });

  it("writes source events into their timeline segments sorted by time", () => {
    const tl = Timeline.from(
      bake(
        bound,
        () => [
          { kind: "judge", time: 2, note: 1, result: 1, phase: 0 },
          { kind: "judge", time: 1, note: 0, result: 1, phase: 0 },
          { kind: "cue", time: 1, cue: 3, channel: 0, gain: 1 },
        ],
        CONTEXT,
      ),
    );
    expect([...tl.column("judge", "note")]).toEqual([0, 1]);
    expect(tl.count("cue")).toBe(1);
    expect(tl.meta.unsupported).toEqual([{ type: 77, count: 1 }]);
  });

  it("keeps events at equal times in source order", () => {
    const tl = Timeline.from(
      bake(
        bound,
        () => [
          { kind: "judge", time: 1, note: 5, result: 1, phase: 0 },
          { kind: "judge", time: 1, note: 3, result: 1, phase: 0 },
        ],
        CONTEXT,
      ),
    );
    expect([...tl.column("judge", "note")]).toEqual([5, 3]);
  });

  it("ignores random-state events and keeps every other segment intact", () => {
    const tl = Timeline.from(
      bake(
        bound,
        () => [
          { kind: "rng", time: 0.5, rngLow: 9, rngHigh: 8, crt: 7 },
          { kind: "judge", time: 1, note: 0, result: 4, phase: 0 },
          {
            kind: "score",
            time: 1,
            score: 1010000,
            combo: 1,
            gauge: 0.25,
            counts: [1, 0, 0, 0],
          },
          {
            kind: "effect",
            time: 1,
            resource: 23,
            note: 0,
            lane: 4,
            width: 4,
            rngLow: 1,
            rngHigh: 2,
            crt: 3,
          },
          { kind: "cue", time: 1, cue: 3, channel: 2, gain: 0.5 },
          { kind: "rng", time: 1.5, rngLow: 6, rngHigh: 5, crt: 4 },
        ],
        CONTEXT,
      ),
    );
    expect(tl.count("judge")).toBe(1);
    expect(tl.count("score")).toBe(1);
    expect(tl.count("effect")).toBe(1);
    expect(tl.count("cue")).toBe(1);
    expect([...tl.column("cue", "channel")]).toEqual([2]);
    expect([...tl.column("score", "gauge")]).toEqual([0.25]);
    // The trailing rng event at 1.5 is discarded, so it must not extend the stored duration.
    expect(tl.duration).toBe(1);
  });

  it("stores band state changes in time order alongside the other segments", () => {
    const tl = Timeline.from(
      bake(
        bound,
        () => [
          { kind: "band", time: 2, note: 4, state: 3 },
          { kind: "band", time: 1, note: 4, state: 1 },
          { kind: "band", time: 1, note: 9, state: 2 },
        ],
        CONTEXT,
      ),
    );
    expect(tl.count("band")).toBe(3);
    expect([...tl.column("band", "time")]).toEqual([1, 1, 2]);
    expect([...tl.column("band", "note")]).toEqual([4, 9, 4]);
    expect([...tl.column("band", "state")]).toEqual([1, 2, 3]);
    expect(tl.duration).toBe(2);
  });

  it("reads note types from the bound records", () => {
    const withRecords = { ...bound, records: [record(1), record(6)] } as unknown as BoundScore;
    const tl = Timeline.from(
      bake(
        withRecords,
        () => [
          { kind: "judge", time: 2, note: 0, result: 4, phase: 0 },
          { kind: "judge", time: 1, note: 1, result: 4, phase: 0 },
          { kind: "judge", time: 3, note: 0, result: 4, phase: 2 },
        ],
        CONTEXT,
      ),
    );
    expect([...tl.column("note", "record")]).toEqual([1, 0]);
    expect([...tl.column("note", "type")]).toEqual([6, 1]);
    expect([...tl.column("note", "judgeTime")]).toEqual([1, 2]);
    expect(tl.meta.noteCount).toBe(2);
  });

  it("reports zero duration when the source has no events", () => {
    expect(Timeline.from(bake(bound, () => [], CONTEXT)).duration).toBe(0);
  });

  it("records the speed row the appear column is valid for", () => {
    const tl = Timeline.from(bake(bound, () => [], { musicId: 1, defaultSpeedRow: 4 }));
    expect(tl.meta.defaultSpeedRow).toBe(4);
  });

  it("reports zero duration when the source only has discarded events", () => {
    const tl = Timeline.from(
      bake(bound, () => [{ kind: "rng", time: 9, rngLow: 1, rngHigh: 2, crt: 3 }], CONTEXT),
    );
    expect(tl.duration).toBe(0);
  });
});

it("keeps SLIDE mode/presence transitions in their own versioned timeline segment", () => {
  const bound = { records: [], unsupported: [] } as unknown as BoundScore;
  const timeline = Timeline.from(
    bake(
      bound,
      () => [
        { kind: "slide", time: 2, note: 7, mode: 3 },
        { kind: "slide", time: 1, note: 7, mode: 0 },
      ],
      { musicId: 2999 },
    ),
  );
  expect([...timeline.column("slide", "time")]).toEqual([1, 2]);
  expect([...timeline.column("slide", "mode")]).toEqual([0, 3]);
  expect(timeline.count("band")).toBe(0);
});

it("keeps AIR band mode/presence transitions apart from SLIDE bands", () => {
  const bound = { records: [], unsupported: [] } as unknown as BoundScore;
  const timeline = Timeline.from(
    bake(
      bound,
      () => [
        { kind: "airband", time: 2, note: 7, mode: 3 },
        { kind: "airband", time: 1, note: 7, mode: 0 },
      ],
      { musicId: 2999 },
    ),
  );
  expect([...timeline.column("airband", "time")]).toEqual([1, 2]);
  expect([...timeline.column("airband", "mode")]).toEqual([0, 3]);
  expect(timeline.count("slide")).toBe(0);
});

it("keeps AIR model visibility transitions in their own timeline segment", () => {
  const bound = { records: [], unsupported: [] } as unknown as BoundScore;
  const timeline = Timeline.from(
    bake(
      bound,
      () => [
        { kind: "airmodel", time: 2, note: 7, part: 3, shown: 0 },
        { kind: "airmodel", time: 1, note: 7, part: 3, shown: 1 },
      ],
      { musicId: 2999 },
    ),
  );
  expect([...timeline.column("airmodel", "time")]).toEqual([1, 2]);
  expect([...timeline.column("airmodel", "part")]).toEqual([3, 3]);
  expect([...timeline.column("airmodel", "shown")]).toEqual([1, 0]);
});
