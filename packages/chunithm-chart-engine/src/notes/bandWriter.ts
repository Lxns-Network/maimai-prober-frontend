/**
 * The band writer: the `band-frame` operation turned into band vertices.
 *
 * A HOLD's band is not geometry the note layer can lay out from the record alone. Its two ends are
 * depths at the head and tail times, and its appearance depends on whether the head and the tail have
 * each been judged — a state that only the judge loop knows. The reference resolves that by having
 * `holdFrame` read the head/tail state off the live note and pack everything the band needs into a
 * six-word `band-frame` operation, which the band geometry then consumes.
 *
 * This module is the consumer of that operation. Keeping the split means the band is written from
 * the same six words the reference packs, rather than from a re-derivation that could drift.
 */

import { createHoldBand, type StripPrecision, type ZeroDepthState } from "./holdBand";
import type { NoteTimelineScore } from "./timing";

/** Words in a `band-frame` operation, matching the reference's six-value argument list. */
export const BAND_FRAME_WORDS = 6;

/** Head/tail band states, from the reference's own immediates. */
export const BAND_STATE = Object.freeze({
  /** Neither end judged: the band is a full strip. */
  normal: 0,
  /** Head judged, tail still to come: the band is a partial strip. */
  partial: 1,
  /** Head judged and the tail has arrived but is not yet done. */
  tailPending: 2,
});

/** One band-frame operation's six words, as the reference packs them. */
export interface BandFrame {
  /** Band state, one of {@link BAND_STATE}. */
  state: number;
  /** `f32(teHead - now)`, the head end's depth argument. */
  headDelta: number;
  /** `f32(headOwnTime - now)`, the head's own time as a delta. */
  headOwnDelta: number;
  /** `f32(teTail - now)`, the tail end's depth argument. */
  tailDelta: number;
  /** `f32(tailOwnTime - now)`, the tail's own time as a delta. */
  tailOwnDelta: number;
  /** `nm[0x308]` carried through the x87 round trip. */
  speedBits: number;
}

/**
 * Reads the six words out of a `band-frame` operation's argument list.
 *
 * The values arrive as float32 bit patterns, so they are reassembled through a shared scratch view
 * rather than converted: a bit-pattern conversion is what the reference does, and a numeric
 * conversion would round a second time.
 */
export function readBandFrame(args: readonly number[], scratch: DataView): BandFrame {
  if (args.length !== BAND_FRAME_WORDS)
    throw new RangeError(
      `A band-frame operation carries ${BAND_FRAME_WORDS} words, got ${args.length}`,
    );
  const word = (index: number): number => {
    const value = args[index];
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
      throw new RangeError(`band-frame word ${index} is not a u32, got ${value}`);
    return value;
  };
  for (let i = 0; i < BAND_FRAME_WORDS; i++) scratch.setUint32(i * 4, word(i), true);
  const state = word(0);
  return {
    state,
    headDelta: scratch.getFloat32(4, true),
    headOwnDelta: scratch.getFloat32(8, true),
    tailDelta: scratch.getFloat32(12, true),
    tailOwnDelta: scratch.getFloat32(16, true),
    speedBits: word(5),
  };
}

export interface BandWriteInput {
  /** The six words the judge loop packed, in the reference's order. */
  args: readonly number[];
  /** Lane-centre operand of the band holder, from `band-init`. */
  lane: number;
  /** Lane-width operand of the band holder, from `band-init`. */
  width: number;
  /** Note-state view the depth model reads. */
  manager: DataView;
  /** Bound score whose scroll rows the depth model reads. */
  score: NoteTimelineScore;
  /** Depth carried across frames so a band whose ends do not move keeps a stable reference. */
  zeroDepth: ZeroDepthState;
  /** Precision the pulse scalar is evaluated at. */
  x87: StripPrecision;
}

export type BandWriteResult =
  | { cleared: true; zeroDepth: { initialized: true; bits: number } }
  | {
      cleared: false;
      zeroDepth: { initialized: true; bits: number };
      vertices: number;
      /** Pulse scalar the band's material multiplies its colour by, already rounded to float32. */
      scalar: number;
    };

export interface BandWriter {
  /**
   * Writes one record's band into `output` at `vertexOffset`.
   *
   * A cleared band writes no vertices; the caller drops the record's band rather than drawing a
   * stale one, which is why the cleared result is reported separately from a zero-vertex write.
   */
  write(output: DataView, vertexOffset: number, input: BandWriteInput): BandWriteResult;
}

/**
 * Builds the writer.
 *
 * The band geometry is built once and driven through the writer, because it carries the reference's
 * own rounding tables and the pulse evaluator's scratch state; rebuilding it per record would discard
 * that state and re-create the tables on the frame path.
 */
export function createBandWriter(): BandWriter {
  const band = createHoldBand();
  /** Shared scratch for reassembling the operation's float32 words from their bit patterns. */
  const scratch = new DataView(new ArrayBuffer(BAND_FRAME_WORDS * 4));

  return {
    write(output, vertexOffset, input) {
      // Decoded and checked before the geometry sees it. The state drives both a geometry branch and
      // the band's colour, and an unrecognised value would fall through every `mode ===` test and
      // draw the normal-coloured band for a state the reference never produces — a wrong picture with
      // nothing to attribute it to.
      const frame = readBandFrame(input.args, scratch);
      if (
        frame.state !== BAND_STATE.normal &&
        frame.state !== BAND_STATE.partial &&
        frame.state !== BAND_STATE.tailPending
      )
        throw new RangeError(`Unrecognised band state ${frame.state}`);
      const result = band.writeHoldBand(output, vertexOffset, {
        args: scratch,
        lane: input.lane,
        width: input.width,
        manager: input.manager,
        score: input.score,
        zeroDepth: input.zeroDepth,
        x87: input.x87,
      });
      if (result.cleared) return { cleared: true, zeroDepth: result.zeroDepth };
      return {
        cleared: false,
        zeroDepth: result.zeroDepth,
        vertices: result.vertices,
        scalar: result.scalar,
      };
    },
  };
}
