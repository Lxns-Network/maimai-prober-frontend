import { describe, expect, it } from "vitest";
import { BAND_FRAME_WORDS, BAND_STATE, createBandWriter, readBandFrame } from "./bandWriter";
import { createHoldBand, type HoldBandInput } from "./holdBand";
import type { NoteTimelineScore } from "./timing";

/** A score with one scroll row, enough for the depth model to be queried. */
function score(): NoteTimelineScore {
  const scroll = new DataView(new ArrayBuffer(64));
  const timeline = new Map<number, DataView>();
  return {
    records: [],
    timeline,
    scroll,
  } as unknown as NoteTimelineScore;
}

/** The six words a `band-frame` operation carries, as float32 bit patterns. */
function argsOf(
  state: number,
  p4: number,
  p8: number,
  pC: number,
  p10: number,
  speed: number,
): number[] {
  const scratch = new DataView(new ArrayBuffer(24));
  scratch.setInt32(0, state, true);
  scratch.setFloat32(4, p4, true);
  scratch.setFloat32(8, p8, true);
  scratch.setFloat32(12, pC, true);
  scratch.setFloat32(16, p10, true);
  scratch.setUint32(20, speed, true);
  return Array.from({ length: 6 }, (_, i) => scratch.getUint32(i * 4, true));
}

/** A manager with the time and speed fields the depth model reads. */
function manager(now: number): DataView {
  const view = new DataView(new ArrayBuffer(0x3b0));
  view.setFloat32(0x300, now, true);
  view.setFloat32(0x354, 1, true);
  view.setFloat32(0x358, 1, true);
  return view;
}

describe("readBandFrame", () => {
  it("round-trips the operation's float32 words through their bit patterns", () => {
    // The values arrive as u32 bit patterns, and the geometry reads them back as float32. Converting
    // numerically instead would round a second time and change the band's vertices.
    const scratch = new DataView(new ArrayBuffer(24));
    const args = argsOf(BAND_STATE.partial, 1.5, 0.25, -2.5, 0.75, 0x3f800000);
    const frame = readBandFrame(args, scratch);
    expect(frame.state).toBe(BAND_STATE.partial);
    expect(frame.headDelta).toBe(1.5);
    expect(frame.headOwnDelta).toBe(0.25);
    expect(frame.tailDelta).toBe(-2.5);
    expect(frame.tailOwnDelta).toBe(0.75);
    expect(frame.speedBits).toBe(0x3f800000);
  });

  it("rejects a word list of the wrong length", () => {
    const scratch = new DataView(new ArrayBuffer(24));
    expect(() => readBandFrame([0, 0, 0, 0, 0], scratch)).toThrow(/6 words/);
  });

  it("rejects a word that is not a u32", () => {
    // A negative or fractional word would be written as a wrapped value, producing a band from a
    // number the reference never packed.
    const scratch = new DataView(new ArrayBuffer(24));
    expect(() => readBandFrame([-1, 0, 0, 0, 0, 0], scratch)).toThrow(/not a u32/);
    expect(() => readBandFrame([0, 0, 0, 0, 0, 1.5], scratch)).toThrow(/not a u32/);
  });
});

describe("createBandWriter", () => {
  it("writes the same bytes as driving the band geometry directly", () => {
    // The writer is a consumer of the operation, so its output must be identical to the geometry's
    // own — a difference would mean the six words were reassembled wrongly.
    const writer = createBandWriter();
    const band = createHoldBand();
    const s = score();
    const nm = manager(0);
    const args = argsOf(BAND_STATE.normal, -100, 0.5, 100, 0.5, 0x3f800000);

    const direct = new DataView(new ArrayBuffer(24 * 8));
    const directResult = band.writeHoldBand(direct, 0, {
      args: (() => {
        const v = new DataView(new ArrayBuffer(24));
        for (const [i, w] of args.entries()) v.setUint32(i * 4, w, true);
        return v;
      })(),
      lane: 0,
      width: 1,
      manager: nm,
      score: s,
      zeroDepth: { initialized: false },
      x87: "extended",
    } satisfies HoldBandInput);

    const viaWriter = new DataView(new ArrayBuffer(24 * 8));
    const writerResult = writer.write(viaWriter, 0, {
      args,
      lane: 0,
      width: 1,
      manager: nm,
      score: s,
      zeroDepth: { initialized: false },
      x87: "extended",
    });

    expect(writerResult.cleared).toBe(directResult.cleared);
    expect(writerResult.zeroDepth).toEqual(directResult.zeroDepth);
    if (writerResult.cleared || directResult.cleared) return;
    expect(writerResult.vertices).toBe(directResult.vertices);
    for (let i = 0; i < writerResult.vertices * 24; i++)
      expect(viaWriter.getUint8(i)).toBe(direct.getUint8(i));
  });

  it("carries the depth across calls, so a band whose ends do not move keeps its reference", () => {
    // The reference depth is state the geometry holds between frames. A writer that reset it would
    // make the second frame's degenerate spans substitute a different depth than the first's.
    const writer = createBandWriter();
    const s = score();
    const nm = manager(0);
    const args = argsOf(BAND_STATE.normal, -100, 0.5, 100, 0.5, 0x3f800000);
    const output = new DataView(new ArrayBuffer(24 * 8));
    const first = writer.write(output, 0, {
      args,
      lane: 0,
      width: 1,
      manager: nm,
      score: s,
      zeroDepth: { initialized: false },
      x87: "extended",
    });
    const second = writer.write(output, 0, {
      args,
      lane: 0,
      width: 1,
      manager: nm,
      score: s,
      zeroDepth: first.zeroDepth,
      x87: "extended",
    });
    expect(first.zeroDepth.initialized).toBe(true);
    expect(second.zeroDepth).toEqual(first.zeroDepth);
  });

  it("rejects a band state the reference never produces", () => {
    // An unrecognised state falls through every `mode ===` branch in the geometry, so it would draw a
    // normally coloured full band for a state that does not exist.
    const writer = createBandWriter();
    const output = new DataView(new ArrayBuffer(24 * 8));
    expect(() =>
      writer.write(output, 0, {
        args: argsOf(7, -100, 0.5, 100, 0.5, 0x3f800000),
        lane: 0,
        width: 1,
        manager: manager(0),
        score: score(),
        zeroDepth: { initialized: false },
        x87: "extended",
      }),
    ).toThrow(/Unrecognised band state 7/);
  });

  it("declares the word count the operation actually carries", () => {
    expect(BAND_FRAME_WORDS).toBe(6);
    expect(Object.values(BAND_STATE)).toEqual([0, 1, 2]);
  });
});
