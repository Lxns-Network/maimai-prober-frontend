import { selectHitDepth } from "./space";
/**
 * Per-frame assembly of the HOLD bands.
 *
 * A band is written per record per frame: its state comes from the bake's `band` events, its six
 * operation words from {@link writeBandFrameWords}, and its vertices from the band writer. This module
 * is the loop that joins them for the records that are on screen, and hands the renderer the vertex
 * ranges it wrote together with the sort key and pulse scalar each band draws with.
 */

import { BAND_ENDED } from "../chart/bake/events";
import { secondsForStep } from "../loop/audioClock";
import type { BandBuffer } from "./render/bandBuffer";
import { sortKey } from "./render/drawGroups";
import type { Timeline } from "../chart/timeline/reader";
import { planBand, regionRecords, writeBandFrameWords, type BandPlan } from "./bandFrame";
import { BAND_FRAME_WORDS, createBandWriter, type BandWriter } from "./bandWriter";
import { HOLD_VERTEX_BYTES, type StripPrecision, type ZeroDepthState } from "./holdBand";
import type { NoteTimelineScore } from "./timing";

/** Widest a record can be, in lanes; a band's width priority counts down from it. */
const WIDEST = 16;

/** The `band` timeline segment's columns, in time order. */
export interface BandStateColumns {
  /** Step time in seconds. */
  time: Float64Array;
  /** Record index. */
  note: Uint32Array;
  /** Band state from the bake, or `BAND_ENDED`. */
  state: Uint8Array;
}

/** The `band` segment of a loaded timeline, as the columns {@link createBandStates} takes. */
export function bandColumnsOf(timeline: Timeline): BandStateColumns {
  return {
    time: timeline.column("band", "time") as Float64Array,
    note: timeline.column("band", "note") as Uint32Array,
    state: timeline.column("band", "state") as Uint8Array,
  };
}

/** Band state by record and step. */
export interface BandStates {
  /** Whether the bake recorded any band event for the record, which is what makes it a banded HOLD. */
  has(record: number): boolean;
  /** The record's state at grid step `step`: the latest event at or before it, or 0 before the first. */
  stateAt(record: number, step: number): number;
}

/**
 * Indexes the `band` events by record.
 *
 * @throws RangeError when the columns are not parallel, an event names a record outside the score,
 *   or the events are out of time order.
 */
export function createBandStates(columns: BandStateColumns, recordCount: number): BandStates {
  const { time, note, state } = columns;
  if (time.length !== note.length || time.length !== state.length)
    throw new RangeError(
      `Band columns must be parallel: ${time.length} times, ${note.length} notes, ${state.length} states`,
    );
  const start = new Uint32Array(recordCount + 1);
  for (let i = 0; i < note.length; i++) {
    if (note[i] >= recordCount)
      throw new RangeError(`Band event ${i} names record ${note[i]} of ${recordCount}`);
    if (i > 0 && time[i] < time[i - 1])
      throw new RangeError(`Band event ${i} is out of time order`);
    start[note[i] + 1]++;
  }
  for (let r = 0; r < recordCount; r++) start[r + 1] += start[r];
  const fill = start.slice(0, recordCount);
  const slotTime = new Float64Array(note.length);
  const slotState = new Uint8Array(note.length);
  for (let i = 0; i < note.length; i++) {
    const at = fill[note[i]]++;
    slotTime[at] = time[i];
    slotState[at] = state[i];
  }

  return {
    has: (record) => record >= 0 && record < recordCount && start[record + 1] > start[record],
    stateAt(record, step) {
      if (record < 0 || record >= recordCount) return 0;
      const now = secondsForStep(step);
      let low = start[record];
      let high = start[record + 1];
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (slotTime[middle] <= now) low = middle + 1;
        else high = middle;
      }
      return low === start[record] ? 0 : slotState[low - 1];
    },
  };
}

/** One band as the renderer takes it. */
export interface BandInstance {
  record: number;
  /** Pack entry the band draws with. */
  profile: string;
  /** First vertex in the band buffer. */
  first: number;
  vertices: number;
  /** The u16 sort key. */
  key: number;
  /** Pulse scalar the band's colour is multiplied by. */
  scalar: number;
}

export interface BandAssemblerInput {
  score: NoteTimelineScore;
  /** Note-state view; the same one the instance evaluation reads, so both see one clock and one camera. */
  manager: DataView;
  states: BandStates;
  /** Pack entry of the HOLD band. */
  profile: string;
  /** Draw layer of the HOLD band, from the pack entry. */
  layer: number;
  /** Initial sort key of the HOLD band's draw order, from the pack entry. */
  initialKey: number;
  x87: StripPrecision;
  /** Writer to draw through; the reference-exact one when omitted. */
  writer?: BandWriter;
}

export interface BandAssembler {
  /**
   * Writes the bands of `records[0..count)` at grid step `step` into `buffer` and appends what the
   * renderer needs to `out`. The buffer and `out` are cleared first.
   *
   * A record without a band event, or whose band has ended, draws nothing, and so does a band that
   * lies outside the visible window.
   *
   * @throws RangeError when the buffer cannot hold the frame's bands.
   */
  assemble(
    step: number,
    nowFrames: number,
    records: ArrayLike<number>,
    count: number,
    buffer: BandBuffer,
    out: BandInstance[],
  ): void;
}

export function createBandAssembler(input: BandAssemblerInput): BandAssembler {
  const { score, manager, states, profile, layer, initialKey, x87 } = input;
  const writer = input.writer ?? createBandWriter();
  const regions = regionRecords(score);
  const plans = new Map<number, BandPlan>();
  /** Carried per record: the reference depth is fixed by the record's first written frame. */
  const zeroDepths = new Map<number, ZeroDepthState>();
  const words = new Uint32Array(BAND_FRAME_WORDS);
  const args: number[] = new Array(BAND_FRAME_WORDS).fill(0);
  const scratch = new DataView(new ArrayBuffer(4));
  const uninitialised: ZeroDepthState = { initialized: false };

  return {
    assemble(step, nowFrames, records, count, buffer, out) {
      buffer.reset();
      out.length = 0;
      for (let i = 0; i < count; i++) {
        const record = records[i];
        selectHitDepth(manager, record);
        if (!states.has(record)) continue;
        const bandState = states.stateAt(record, step);
        if (bandState === BAND_ENDED) continue;

        let plan = plans.get(record);
        if (!plan) plans.set(record, (plan = planBand(score.records[record], regions)));
        writeBandFrameWords(words, plan, manager, score, nowFrames, bandState, scratch);
        for (let w = 0; w < BAND_FRAME_WORDS; w++) args[w] = words[w];

        const result = writer.write(buffer.bytes(), buffer.offset() * HOLD_VERTEX_BYTES, {
          args,
          lane: plan.lane,
          width: plan.width,
          manager,
          score,
          zeroDepth: zeroDepths.get(record) ?? uninitialised,
          x87,
        });
        zeroDepths.set(record, result.zeroDepth);
        if (result.cleared) continue;
        out.push({
          record,
          profile,
          first: buffer.commit(result.vertices),
          vertices: result.vertices,
          key: sortKey(initialKey, layer, (WIDEST - plan.width) & 255),
          scalar: result.scalar,
        });
      }
    },
  };
}
