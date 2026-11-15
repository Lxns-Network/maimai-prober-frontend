import { describe, expect, it } from "vitest";
import { TimelineWriter } from "./writer";
import { Timeline } from "./reader";
import { SEGMENTS, type SegmentName } from "./layout";

function sample() {
  const w = new TimelineWriter();
  for (const [t, n] of [
    [1.0, 0],
    [1.5, 1],
    [1.5, 2],
    [3.0, 3],
  ] as const)
    w.push("judge", { time: t, note: n, result: 1, kind: 0 });
  w.push("score", {
    time: 1.0,
    score: 100,
    combo: 1,
    gauge: 0.5,
    judgeCounts0: 1,
    judgeCounts1: 0,
    judgeCounts2: 0,
    judgeCounts3: 0,
  });
  return w.finish({
    durationSeconds: 4,
    noteCount: 4,
    unsupported: [{ type: 77, count: 2 }],
    defaultSpeedRow: 0,
    appearIsPlaceholder: true,
  });
}

const FULL: { [S in SegmentName]: Record<string, number>[] } = {
  judge: [
    { time: 1 / 3, note: 0x80000001, result: 3, kind: 2, part: 2 },
    { time: 2 / 3, note: 7, result: 255, kind: 1, part: 1 },
  ],
  score: [
    {
      time: 1 / 3,
      score: 0xfffffffe,
      combo: 2,
      gauge: 12345.678901234,
      judgeCounts0: 11,
      judgeCounts1: 12,
      judgeCounts2: 13,
      judgeCounts3: 0x80000004,
    },
    {
      time: 1,
      score: 1,
      combo: 3,
      gauge: 0.1,
      judgeCounts0: 21,
      judgeCounts1: 22,
      judgeCounts2: 23,
      judgeCounts3: 24,
    },
  ],
  effect: [
    {
      time: 1 / 3,
      resource: 0xffff,
      note: 0x80000002,
      lane: 15,
      width: 16,
      rngLow: 0xdeadbeef,
      rngHigh: 0x89abcdef,
      crt: 0x7fffffff,
    },
    { time: 5 / 3, resource: 23, note: 9, lane: -16, width: 1, rngLow: 1, rngHigh: 2, crt: 3 },
  ],
  band: [
    { time: 1 / 3, note: 0x80000001, state: 1 },
    { time: 2 / 3, note: 7, state: 3 },
  ],
  slide: [
    { time: 1 / 3, note: 7, mode: 2 },
    { time: 2 / 3, note: 7, mode: 3 },
  ],
  airband: [
    { time: 1 / 3, note: 9, mode: 0 },
    { time: 2 / 3, note: 9, mode: 3 },
  ],
  airmodel: [
    { time: 1 / 3, note: 9, part: 0xffff, shown: 1 },
    { time: 2 / 3, note: 9, part: 4, shown: 0 },
  ],
  motion: [
    { time: 1 / 3, note: 9, part: 0xfffa, model: 146, frame: 0.5 },
    { time: 2 / 3, note: 0x80000001, part: 2, model: 373, frame: 120.25 },
  ],
  cue: [
    { time: 1 / 3, cue: 0xabcd, channel: 255, gain: 0.1 },
    { time: 4 / 3, cue: 2, channel: 3, gain: 1 / 3 },
  ],
  cuestop: [
    { time: 1 / 3 + 0.05, row: 0, reason: 42 },
    { time: 5 / 3, row: 1, reason: 54 },
  ],
  note: [
    { appear: 1 / 3, judgeTime: 2 / 3, end: 4 / 3, record: 0x80000003, type: 12 },
    { appear: 0.7, judgeTime: 1.7, end: 2.7, record: 5, type: 1 },
  ],
};

function full() {
  const w = new TimelineWriter();
  for (const s of Object.keys(FULL) as SegmentName[])
    for (const row of FULL[s]) w.push(s, row as never);
  return w.finish({
    durationSeconds: 3,
    noteCount: 2,
    unsupported: [],
    defaultSpeedRow: 0,
    appearIsPlaceholder: true,
  });
}

describe("Timeline", () => {
  it("round-trips rows through a single transferable buffer", () => {
    const tl = Timeline.from(sample());
    expect(tl.count("judge")).toBe(4);
    expect([...tl.column("judge", "note")]).toEqual([0, 1, 2, 3]);
    expect(tl.meta.unsupported).toEqual([{ type: 77, count: 2 }]);
    expect(tl.duration).toBe(4);
  });

  it("finds half-open ranges by binary search", () => {
    const tl = Timeline.from(sample());
    expect(tl.range("judge", "time", 1.5, 3.0)).toEqual([1, 3]);
    expect(tl.range("judge", "time", 0, 1.0)).toEqual([0, 0]);
    expect(tl.lowerBound("judge", "time", 1.5)).toBe(1);
  });

  it("handles queries outside the chart without throwing", () => {
    const tl = Timeline.from(sample());
    expect(tl.range("judge", "time", -5, -1)).toEqual([0, 0]);
    expect(tl.range("judge", "time", 10, 20)).toEqual([4, 4]);
    expect(tl.lowerBound("judge", "time", Number.POSITIVE_INFINITY)).toBe(4);
    expect(tl.range("cue", "time", 0, 100)).toEqual([0, 0]);
  });

  it("rejects rows pushed out of time order", () => {
    const w = new TimelineWriter();
    w.push("judge", { time: 2, note: 0, result: 0, kind: 0 });
    expect(() => w.push("judge", { time: 1, note: 1, result: 0, kind: 0 })).toThrow(/order/);
  });

  it("rejects missing or unknown columns", () => {
    const w = new TimelineWriter();
    expect(() => w.push("judge", { time: 1, note: 0, result: 0 } as never)).toThrow(/kind/);
    expect(() =>
      w.push("judge", { time: 1, note: 0, result: 0, kind: 0, extra: 1 } as never),
    ).toThrow(/extra/);
  });

  it.each([1, 99])("rejects a buffer from incompatible format version %i", (version) => {
    const buf = sample();
    new DataView(buf).setUint32(4, version, true);
    expect(() => Timeline.from(buf)).toThrow(/version/);
  });

  it("rejects a truncated buffer before creating column views", () => {
    const buf = sample().slice(0, -16);
    expect(() => Timeline.from(buf)).toThrow(RangeError);
    expect(() => Timeline.from(buf)).toThrow(/out of range/);
  });

  it("round-trips every column of every segment exactly", () => {
    const tl = Timeline.from(full());
    const singlePrecision = new Set(["cue.gain"]);
    for (const s of Object.keys(FULL) as SegmentName[]) {
      expect(tl.count(s)).toBe(FULL[s].length);
      for (const name of Object.keys(SEGMENTS[s].columns)) {
        const key = `${s}.${name}`;
        const expected = FULL[s].map((row) =>
          singlePrecision.has(key) ? Math.fround(row[name]) : row[name],
        );
        expect([...tl.column(s, name)], key).toEqual(expected);
      }
    }
  });

  it("round-trips effect lanes outside the playfield range", () => {
    const w = new TimelineWriter();
    for (const [i, lane] of [-16, -1, 0, 15, 31].entries())
      w.push("effect", {
        time: i,
        resource: 23,
        note: 0,
        lane,
        width: 4,
        rngLow: 0,
        rngHigh: 0,
        crt: 0,
      });
    const tl = Timeline.from(
      w.finish({
        durationSeconds: 4,
        noteCount: 0,
        unsupported: [],
        defaultSpeedRow: 0,
        appearIsPlaceholder: true,
      }),
    );
    expect([...tl.column("effect", "lane")]).toEqual([-16, -1, 0, 15, 31]);
  });

  it("rejects a buffer with another magic", () => {
    const buf = full();
    new DataView(buf).setUint32(0, 0x12345678, true);
    expect(() => Timeline.from(buf)).toThrow(/Not a timeline/);
  });

  it("rejects a buffer with another segment count", () => {
    const buf = full();
    new DataView(buf).setUint32(12, 4, true);
    expect(() => Timeline.from(buf)).toThrow(/segment table/);
  });

  it("rejects metadata that runs past the buffer", () => {
    const buf = full();
    new DataView(buf).setUint32(8, buf.byteLength, true);
    expect(() => Timeline.from(buf)).toThrow(/metadata out of range/);
  });

  it("rejects values outside each column type", () => {
    const w = new TimelineWriter();
    const judge = { time: 1, note: 0, result: 0, kind: 0 };
    const effect = {
      time: 1,
      resource: 0,
      note: 0,
      lane: 0,
      width: 0,
      rngLow: 0,
      rngHigh: 0,
      crt: 0,
    };
    expect(() => w.push("judge", { ...judge, time: Number.NaN })).toThrow(/judge\.time/);
    expect(() => w.push("judge", { ...judge, note: -1 })).toThrow(/judge\.note/);
    expect(() => w.push("judge", { ...judge, note: 2 ** 32 })).toThrow(/judge\.note/);
    expect(() => w.push("judge", { ...judge, result: 1.5 })).toThrow(/judge\.result/);
    expect(() => w.push("effect", { ...effect, lane: 2 ** 31 })).toThrow(/effect\.lane/);
    expect(() => w.push("effect", { ...effect, lane: -(2 ** 31) - 1 })).toThrow(/effect\.lane/);
    expect(() => w.push("effect", { ...effect, lane: 2.5 })).toThrow(/effect\.lane/);
    expect(() => w.push("effect", { ...effect, resource: 0x10000 })).toThrow(/effect\.resource/);
    expect(() => w.push("judge", { ...judge, time: Number.POSITIVE_INFINITY })).toThrow(
      /judge\.time/,
    );
    expect(() =>
      w.push("cue", { time: 1, cue: 0, channel: 0, gain: Number.NEGATIVE_INFINITY }),
    ).toThrow(/cue\.gain/);
    expect(
      w.finish({
        durationSeconds: 1,
        noteCount: 0,
        unsupported: [],
        defaultSpeedRow: 0,
        appearIsPlaceholder: true,
      }).byteLength,
    ).toBeGreaterThan(0);
  });

  it("returns an empty range for a NaN bound and never an inverted range", () => {
    const tl = Timeline.from(sample());
    expect(tl.range("judge", "time", Number.NaN, 2)).toEqual([0, 0]);
    expect(tl.range("judge", "time", 1, Number.NaN)).toEqual([0, 0]);
    const [start, end] = tl.range("judge", "time", 3, 1);
    expect(start).toBe(3);
    expect(end).toBe(start);
  });

  it("keeps a 3000-note timeline under 1MB", () => {
    const w = new TimelineWriter();
    for (let i = 0; i < 3000; i++) {
      w.push("note", {
        appear: i * 0.05,
        judgeTime: i * 0.05 + 1,
        end: i * 0.05 + 1,
        record: i,
        type: 0,
      });
      w.push("judge", { time: i * 0.05 + 1, note: i, result: 1, kind: 0 });
      w.push("score", {
        time: i * 0.05 + 1,
        score: i * 300,
        combo: i,
        gauge: 1,
        judgeCounts0: i,
        judgeCounts1: 0,
        judgeCounts2: 0,
        judgeCounts3: 0,
      });
      w.push("effect", {
        time: i * 0.05 + 1,
        resource: 23,
        note: i,
        lane: 0,
        width: 4,
        rngLow: i,
        rngHigh: 0,
        crt: i,
      });
      w.push("cue", { time: i * 0.05 + 1, cue: 1, channel: 0, gain: 1 });
    }
    expect(
      w.finish({
        durationSeconds: 200,
        noteCount: 3000,
        unsupported: [],
        defaultSpeedRow: 0,
        appearIsPlaceholder: true,
      }).byteLength,
    ).toBeLessThan(1 << 20);
  });
});

describe("cue stops and older buffers", () => {
  const meta = {
    durationSeconds: 1,
    noteCount: 0,
    unsupported: [],
    defaultSpeedRow: 0,
    appearIsPlaceholder: true,
  };

  it("round-trips stop rows next to the cue rows they refer to", () => {
    const w = new TimelineWriter();
    w.push("cue", { time: 1, cue: 60, channel: 6, gain: 1 });
    w.push("cue", { time: 1, cue: 54, channel: 255, gain: 1 });
    w.push("cuestop", { time: 1.05, row: 1, reason: 42 });
    w.push("cuestop", { time: 2, row: 0, reason: 54 });
    const tl = Timeline.from(w.finish(meta));
    expect(tl.count("cuestop")).toBe(2);
    expect(Array.from(tl.column("cuestop", "row"))).toEqual([1, 0]);
    expect(Array.from(tl.column("cuestop", "reason"))).toEqual([42, 54]);
    expect(tl.range("cuestop", "time", 1, 1.5)).toEqual([0, 1]);
  });

  it("reads a version 4 buffer, which has no stop segment, with no stops", () => {
    const segments = (Object.keys(SEGMENTS) as SegmentName[]).filter((s) => s !== "cuestop");
    const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
    const table =
      16 + segments.reduce((n, s) => n + 4 + 4 * Object.keys(SEGMENTS[s].columns).length, 0);
    const header = (table + 7) & ~7;
    const buffer = new ArrayBuffer((header + metaBytes.length + 7) & ~7);
    const view = new DataView(buffer);
    view.setUint32(0, 0x4c544843, true);
    view.setUint32(4, 4, true);
    view.setUint32(8, metaBytes.length, true);
    view.setUint32(12, segments.length, true);
    let at = 16;
    for (const s of segments) {
      view.setUint32(at, 0, true);
      at += 4;
      for (let n = Object.keys(SEGMENTS[s].columns).length; n > 0; n--) {
        view.setUint32(at, header, true);
        at += 4;
      }
    }
    new Uint8Array(buffer, header, metaBytes.length).set(metaBytes);
    const tl = Timeline.from(buffer);
    expect(tl.count("cue")).toBe(0);
    expect(tl.count("cuestop")).toBe(0);
    expect(tl.column("cuestop", "row").length).toBe(0);
  });
});
