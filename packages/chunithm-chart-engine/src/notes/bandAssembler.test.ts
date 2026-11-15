import { describe, expect, it } from "vitest";
import { BAND_ENDED } from "../chart/bake/events";
import { createBandBuffer } from "./render/bandBuffer";
import { TimelineWriter } from "../chart/timeline/writer";
import { Timeline } from "../chart/timeline/reader";
import {
  bandColumnsOf,
  createBandAssembler,
  createBandStates,
  type BandInstance,
  type BandStateColumns,
} from "./bandAssembler";
import { type BandWriter, type BandWriteInput } from "./bandWriter";
import { type ZeroDepthState } from "./holdBand";
import { registerImmutableScroll } from "./space";
import { registerImmutableTimeline, type NoteTimelineScore } from "./timing";
const columns = (events: [time: number, note: number, state: number][]): BandStateColumns => ({
  time: Float64Array.from(events.map((e) => e[0])),
  note: Uint32Array.from(events.map((e) => e[1])),
  state: Uint8Array.from(events.map((e) => e[2])),
});
describe("band states", () => {
  const states = createBandStates(
    columns([
      [1, 0, 1],
      [2, 1, 1],
      [3, 0, 2],
      [4, 0, BAND_ENDED],
    ]),
    3,
  );
  it("knows which records carry band events", () => {
    expect([0, 1, 2].map((r) => states.has(r))).toEqual([true, true, false]);
    expect(states.has(-1)).toBe(false);
    expect(states.has(3)).toBe(false);
  });
  it("is 0 before a record's first event", () => {
    expect(states.stateAt(0, 0)).toBe(0);
    expect(states.stateAt(0, 119)).toBe(0);
  });
  it("takes the latest event at or before the step, the step's own time included", () => {
    expect(states.stateAt(0, 120)).toBe(1);
    expect(states.stateAt(0, 359)).toBe(1);
    expect(states.stateAt(0, 360)).toBe(2);
    expect(states.stateAt(0, 480)).toBe(BAND_ENDED);
    expect(states.stateAt(0, 100000)).toBe(BAND_ENDED);
  });
  it("keeps records apart", () => {
    expect(states.stateAt(1, 120)).toBe(0);
    expect(states.stateAt(1, 240)).toBe(1);
  });
  it("is 0 for a record the events never mention", () => {
    expect(states.stateAt(2, 100000)).toBe(0);
  });
  it("rejects columns that are not parallel", () => {
    const bad = columns([[1, 0, 1]]);
    expect(() => createBandStates({ ...bad, state: new Uint8Array(0) }, 1)).toThrow(/parallel/);
  });
  it("rejects an event for a record outside the score", () => {
    expect(() => createBandStates(columns([[1, 5, 1]]), 3)).toThrow(/record 5 of 3/);
  });
  it("rejects events out of time order", () => {
    expect(() =>
      createBandStates(
        columns([
          [2, 0, 1],
          [1, 0, 2],
        ]),
        1,
      ),
    ).toThrow(/out of time order/);
  });
});
describe("band states from a timeline", () => {
  const timelineOf = (events: [number, number, number][]): Timeline => {
    const writer = new TimelineWriter();
    for (const [time, note, state] of events) writer.push("band", { time, note, state });
    return Timeline.from(
      writer.finish({
        durationSeconds: 10,
        noteCount: 0,
        unsupported: [],
        defaultSpeedRow: 0,
        appearIsPlaceholder: false,
      }),
    );
  };
  it("reads the band segment the writer stored", () => {
    const columns = bandColumnsOf(
      timelineOf([
        [1, 0, 1],
        [2, 1, 1],
        [4, 0, BAND_ENDED],
      ]),
    );
    expect([...columns.time]).toEqual([1, 2, 4]);
    expect([...columns.note]).toEqual([0, 1, 0]);
    expect([...columns.state]).toEqual([1, 1, BAND_ENDED]);
    const states = createBandStates(columns, 2);
    expect(states.stateAt(0, 120)).toBe(1);
    expect(states.stateAt(0, 480)).toBe(BAND_ENDED);
    expect(states.stateAt(1, 240)).toBe(1);
  });
  it("is empty for a timeline with no band events", () => {
    const states = createBandStates(bandColumnsOf(timelineOf([])), 4);
    expect([0, 1, 2, 3].some((r) => states.has(r))).toBe(false);
  });
});
describe("band assembler without a chart", () => {
  const RECORD_BYTES = 356;
  const record = (): DataView => {
    const view = new DataView(new ArrayBuffer(RECORD_BYTES));
    view.setInt32(40, 4, true);
    view.setInt32(44, 3, true);
    view.setFloat32(8, 1000, true);
    view.setFloat32(56, 3000, true);
    return view;
  };
  const score = (): NoteTimelineScore => {
    const built = {
      records: [record(), record(), record()],
      timeline: new Map<number, DataView>(),
      scroll: new DataView(new ArrayBuffer(0)),
    } as unknown as NoteTimelineScore;
    registerImmutableTimeline(built);
    registerImmutableScroll(built.scroll);
    return built;
  };
  const manager = (): DataView => {
    const view = new DataView(new ArrayBuffer(0x3b0));
    view.setFloat32(0x354, 1, true);
    view.setFloat32(0x358, 1, true);
    return view;
  };
  it("draws nothing for a record the bake never framed", () => {
    const assembler = createBandAssembler({
      score: score(),
      manager: manager(),
      states: createBandStates(columns([[0, 0, 0]]), 3),
      profile: "note/band/hold",
      layer: 15,
      initialKey: 0x8580,
      x87: "extended",
    });
    const buffer = createBandBuffer(64);
    const out: BandInstance[] = [{} as BandInstance];
    assembler.assemble(0, 0, [1, 2], 2, buffer, out);
    expect(out).toEqual([]);
    expect(buffer.count()).toBe(0);
  });
  it("draws nothing once the band has ended", () => {
    const assembler = createBandAssembler({
      score: score(),
      manager: manager(),
      states: createBandStates(columns([[0, 0, BAND_ENDED]]), 3),
      profile: "note/band/hold",
      layer: 15,
      initialKey: 0x8580,
      x87: "extended",
    });
    const buffer = createBandBuffer(64);
    const out: BandInstance[] = [];
    assembler.assemble(10, 5, [0], 1, buffer, out);
    expect(out).toEqual([]);
  });
  it("hands each record's reference depth from one frame to the next", () => {
    const seen: ZeroDepthState[] = [];
    const writer: BandWriter = {
      write(_output, _offset, input: BandWriteInput) {
        seen.push(input.zeroDepth);
        return { cleared: true, zeroDepth: { initialized: true, bits: 7 + seen.length } };
      },
    };
    const assembler = createBandAssembler({
      score: score(),
      manager: manager(),
      states: createBandStates(
        columns([
          [0, 0, 0],
          [0, 1, 0],
        ]),
        3,
      ),
      profile: "note/band/hold",
      layer: 15,
      initialKey: 0x8580,
      x87: "extended",
      writer,
    });
    const buffer = createBandBuffer(64);
    const out: BandInstance[] = [];
    assembler.assemble(0, 0, [0, 1], 2, buffer, out);
    assembler.assemble(1, 0.5, [0, 1], 2, buffer, out);
    expect(seen).toEqual([
      { initialized: false },
      { initialized: false },
      { initialized: true, bits: 8 },
      { initialized: true, bits: 9 },
    ]);
  });
  it("clears the buffer and the list at the start of every frame", () => {
    const assembler = createBandAssembler({
      score: score(),
      manager: manager(),
      states: createBandStates(columns([[0, 0, 0]]), 3),
      profile: "note/band/hold",
      layer: 15,
      initialKey: 0x8580,
      x87: "extended",
    });
    const buffer = createBandBuffer(64);
    buffer.commit(12);
    const out: BandInstance[] = [{} as BandInstance, {} as BandInstance];
    assembler.assemble(0, 0, [], 0, buffer, out);
    expect(buffer.count()).toBe(0);
    expect(out).toEqual([]);
  });
});
