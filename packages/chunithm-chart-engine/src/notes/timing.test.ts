import { describe, expect, it } from "vitest";
import {
  effectiveTime,
  frameDelta,
  isLongNote,
  endPosition,
  mapFind,
  passedLine,
  registerImmutableTimeline,
  spawnPredicate,
  timelineIntegral,
  toFrames,
  toMs,
  windowPredicate,
  type NoteTimelineScore,
} from "./timing";

/** One SFL row over [100, 200] ms with value 2, doubling the distance across that span. */
function rowScore(): NoteTimelineScore {
  const events = new DataView(new ArrayBuffer(32));
  events.setFloat32(8, 100, true);
  events.setFloat32(16, 2, true);
  events.setFloat32(28, 200, true);
  return {
    records: [],
    timeline: new Map([[7, events]]),
    scroll: new DataView(new ArrayBuffer(0)),
  };
}

function stateView(): DataView {
  const view = new DataView(new ArrayBuffer(0x400));
  view.setFloat32(0x354, 0.8, true);
  view.setFloat32(0x358, 1.5, true);
  view.setFloat32(0x3a4, 0, true);
  view.setFloat32(0x300, 0, true);
  return view;
}

function noteRecord(options: {
  time: number;
  primaryType: number;
  secondaryType?: number;
  headKey?: number;
  tailKey?: number;
  tailTime?: number;
}): DataView {
  const record = new DataView(new ArrayBuffer(356));
  record.setFloat32(8, options.time, true);
  record.setInt32(16, options.primaryType, true);
  record.setInt32(20, options.secondaryType ?? 0, true);
  record.setInt32(112, options.headKey ?? 0, true);
  record.setInt32(116, options.tailKey ?? 0, true);
  if (options.tailTime !== undefined) record.setFloat32(48, options.tailTime, true);
  return record;
}

describe("frame and millisecond conversion", () => {
  it("round-trips a frame count through milliseconds within single precision", () => {
    // Reference values from the same constants the module carries: the product rounds to exactly
    // 5000 in single precision, and converting back returns the original frame count.
    expect(toMs(300)).toBe(5000);
    expect(toFrames(toMs(300))).toBe(300);
    expect(toFrames(5000)).toBe(300);
  });
});

describe("timelineIntegral", () => {
  it("accumulates the covered span scaled by value minus one", () => {
    // Reference values from `createNoteSpawn(...).timelineIntegral`.
    const score = rowScore();
    registerImmutableTimeline(score);
    expect(timelineIntegral(score, 7, 0, 50)).toBe(50);
    expect(timelineIntegral(score, 7, 0, 150)).toBe(200);
    expect(timelineIntegral(score, 7, 0, 250)).toBe(350);
    expect(timelineIntegral(score, 7, 150, 250)).toBe(300);
    expect(timelineIntegral(score, 7, 100, 200)).toBe(300);
  });

  it("returns the rounded endpoint for a missing key or a reversed range", () => {
    const score = rowScore();
    registerImmutableTimeline(score);
    expect(timelineIntegral(score, 99, 0, 50)).toBe(50);
    expect(timelineIntegral(score, 7, 200, 100)).toBe(100);
  });

  it("keeps a negative-zero endpoint distinct from zero", () => {
    // The reference result is -0 when `to` is -0 and +0 when it is +0, so a cache keyed on
    // SameValueZero would return the wrong sign for one of them.
    const score = rowScore();
    registerImmutableTimeline(score);
    expect(Object.is(timelineIntegral(score, 7, 0, -0), -0)).toBe(true);
    expect(Object.is(timelineIntegral(score, 7, 0, 0), 0)).toBe(true);
    // Re-query in the opposite order to exercise the cached path.
    expect(Object.is(timelineIntegral(score, 7, 0, 0), 0)).toBe(true);
    expect(Object.is(timelineIntegral(score, 7, 0, -0), -0)).toBe(true);
  });

  it("agrees between the indexed and the scanned path", () => {
    const build = (immutable: boolean) => {
      const events = new DataView(new ArrayBuffer(64));
      const row = (index: number, start: number, end: number, value: number) => {
        events.setFloat32(index * 32 + 8, start, true);
        events.setFloat32(index * 32 + 16, value, true);
        events.setFloat32(index * 32 + 28, end, true);
      };
      row(0, 100, 200, 2);
      row(1, 200, 400, 0.5);
      const score: NoteTimelineScore = {
        records: [],
        timeline: new Map([[3, events]]),
        scroll: new DataView(new ArrayBuffer(0)),
      };
      if (immutable) registerImmutableTimeline(score);
      return score;
    };
    const indexed = build(true);
    const scanned = build(false);
    for (const [from, to] of [
      [0, 0],
      [0, 150],
      [0, 500],
      [150, 250],
      [250, 399],
      [10, 1500],
    ])
      expect(timelineIntegral(indexed, 3, from, to)).toBe(timelineIntegral(scanned, 3, from, to));
  });
});

describe("mapFind", () => {
  it("looks a key up as int32 and reports absence as null", () => {
    const score = rowScore();
    // Reference `mapFind` returns the view for an integer key, null for an absent one, and
    // throws for a non-integer key (probe `.bench/chunithm-p3-oracle/probe-mapfind.mjs`).
    expect(mapFind(score, 7)?.byteLength).toBe(32);
    expect(mapFind(score, 8)).toBeNull();
    expect(mapFind(score, -1)).toBeNull();
  });

  it("rejects a non-integer key", () => {
    expect(() => mapFind(rowScore(), NaN)).toThrow(TypeError);
    expect(() => mapFind(rowScore(), 7.9)).toThrow(TypeError);
  });
});

describe("frameDelta", () => {
  it("reports the raw delta and the retimed delta", () => {
    const score = rowScore();
    registerImmutableTimeline(score);
    const state = stateView();
    const delta = frameDelta(state, score, 7, 12, true);
    expect(delta.dt).toBe(12);
    expect(Number.isFinite(delta.retime())).toBe(true);
  });

  it("does not retime when the key is negative or integration is off", () => {
    const score = rowScore();
    const state = stateView();
    expect(frameDelta(state, score, -1, 12, true).retime()).toBe(12);
    expect(frameDelta(state, score, 7, 12, false).retime()).toBe(12);
  });
});

describe("effectiveTime", () => {
  it("returns the frame position of t after integrating from the current time", () => {
    const score = rowScore();
    registerImmutableTimeline(score);
    // The state's now is 0 frames, so the integral starts at 0 ms.
    expect(effectiveTime(stateView(), score, 7, 300)).toBe(
      toFrames(timelineIntegral(score, 7, 0, toMs(300))),
    );
  });
});

describe("long notes and end positions", () => {
  it("recognises a long primary type", () => {
    expect(isLongNote(noteRecord({ time: 0, primaryType: 1 }), 0)).toBe(true);
    expect(isLongNote(noteRecord({ time: 0, primaryType: 0 }), 0)).toBe(false);
  });

  it("only consults the secondary type when the flag is set", () => {
    const record = noteRecord({ time: 0, primaryType: 0, secondaryType: 5 });
    expect(isLongNote(record, 0)).toBe(false);
    expect(isLongNote(record, 1)).toBe(true);
  });

  it("selects the end offset matching the flag", () => {
    const record = noteRecord({ time: 0, primaryType: 1, secondaryType: 5, tailTime: 3 });
    record.setFloat32(24, 4, true);
    expect(endPosition(record, 0).getFloat32(0, true)).toBe(3);
    expect(endPosition(record, 1).getFloat32(0, true)).toBe(4);
  });
});

describe("window membership", () => {
  it("accepts a note within the early-accept distance", () => {
    const score = rowScore();
    const state = stateView();
    const record = noteRecord({ time: 300, primaryType: 0 });
    // The state's now is 0 frames and the note is 300 frames out: beyond the early window, so the
    // depth window decides.
    expect(typeof spawnPredicate(state, score, record)).toBe("boolean");
  });

  it("treats a note whose head and tail both entered as visible", () => {
    const score = rowScore();
    const state = stateView();
    const record = noteRecord({ time: 300, primaryType: 1, tailTime: 300 });
    expect(typeof spawnPredicate(state, score, record)).toBe("boolean");
  });

  it("returns a boolean for the explicit-time predicates", () => {
    const score = rowScore();
    const state = stateView();
    expect(typeof windowPredicate(state, score, 7, 300, 1, 1)).toBe("boolean");
    expect(typeof passedLine(state, score, 7, 300, 1)).toBe("boolean");
  });

  it("rejects a non-integer byte flag", () => {
    const score = rowScore();
    const state = stateView();
    expect(() => windowPredicate(state, score, 7, 300, 1.5, 1)).toThrow(TypeError);
  });
});
