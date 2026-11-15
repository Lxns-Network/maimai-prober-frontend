/**
 * The `band-frame` operation rebuilt at runtime: the six words a HOLD's band is drawn from.
 *
 * Five of the six words are functions of the record and the frame time alone; only the band state
 * depends on the judgement outcome, which the bake records as `band` events. Rebuilding the words
 * here, instead of storing them per step, keeps the timeline to the state changes.
 */

import { BAND_FRAME_WORDS } from "./bandWriter";
import { NOTE_FIELDS, SPAWN_CONSTANTS } from "./tables";
import { effectiveTime, timelineIntegral, toMs, type NoteTimelineScore } from "./timing";

/** Primary type of the HOLD-region record whose range supplies a tail's timeline key. */
const REGION_TYPE = 12;
const RECORD_LANE = 40;
const RECORD_WIDTH_INDEX = 44;
const RECORD_TAIL_TIME = 56;
const RECORD_TAIL_POSITION = 0x30;
/** Added to a beat position when matching it against a region, so a boundary position falls inside. */
const POSITION_EPSILON = 0.0052083334885537624;
const BEATS_PER_GROUP = 4;
/** Constant the timeline-frame clock is offset by. */
const TIMELINE_ORIGIN = 216000;

const f32 = Math.fround;
const WIDTHS: readonly number[] = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
]);
const widthOf = (index: number): number => (index >= 0 && index < 16 ? WIDTHS[index] : 0);

/** The record-derived inputs of one HOLD's band, frozen at load. */
export interface BandPlan {
  headKey: number;
  tailKey: number;
  /** The head's own time, in frames. */
  headFrames: number;
  /** The tail's own time, in frames. */
  tailFrames: number;
  /** Lane-centre operand of the band holder. */
  lane: number;
  /** Lane-width operand of the band holder. */
  width: number;
}

/** Region records of a score, for {@link planBand}. */
export function regionRecords(score: NoteTimelineScore): readonly DataView[] {
  return score.records.filter((r) => r.getInt32(NOTE_FIELDS.primaryType, true) === REGION_TYPE);
}

const beat = (view: DataView, at: number): number =>
  f32(f32(view.getFloat32(at, true) * BEATS_PER_GROUP) + view.getFloat32(at + 4, true));

/**
 * The timeline key a position is retimed by: the largest key among regions that contain the
 * position and cover the lane span `[lane, lane + width)`, or 0 when none does.
 *
 * `position` is a twelve-byte beat position: the group float, then the beat float.
 */
export function regionKeyAt(
  regions: readonly DataView[],
  position: DataView,
  lane: number,
  width: number,
): number {
  const at = f32(beat(position, 0) + POSITION_EPSILON);
  let key = 0;
  for (const r of regions) {
    const k = r.getInt32(0x70, true);
    const l = r.getInt32(RECORD_LANE, true);
    const w = widthOf(r.getInt32(RECORD_WIDTH_INDEX, true));
    if (!(key < k)) continue;
    if (!(at >= beat(r, 0))) continue;
    if (at >= beat(r, RECORD_TAIL_POSITION)) continue;
    if (lane < l) continue;
    if (((lane + width) | 0) <= ((l + w) | 0)) key = k;
  }
  return key;
}

/** The key a HOLD's tail is retimed by: the region key at its tail position over its own lane span. */
function tailKeyFor(record: DataView, regions: readonly DataView[]): number {
  const position = new DataView(record.buffer, record.byteOffset + RECORD_TAIL_POSITION, 12);
  return regionKeyAt(
    regions,
    position,
    record.getInt32(RECORD_LANE, true),
    widthOf(record.getInt32(RECORD_WIDTH_INDEX, true)),
  );
}

/** Freezes the record-derived inputs of one HOLD's band. */
export function planBand(record: DataView, regions: readonly DataView[]): BandPlan {
  const width = f32(widthOf(record.getInt32(RECORD_WIDTH_INDEX, true)));
  const lane = record.getInt32(RECORD_LANE, true);
  return {
    headKey: record.getInt32(0x70, true),
    tailKey: tailKeyFor(record, regions),
    headFrames: f32(
      f32(record.getFloat32(NOTE_FIELDS.noteTime, true)) * SPAWN_CONSTANTS.framesPerMs,
    ),
    tailFrames: f32(f32(record.getFloat32(RECORD_TAIL_TIME, true)) * SPAWN_CONSTANTS.framesPerMs),
    lane: f32(f32(width * 0.5) + lane),
    width,
  };
}

/**
 * Writes one `band-frame` operation's six words into `out`, as u32 bit patterns.
 *
 * `state` is the note-state view; its time field is set to `nowFrames` here, because the retiming
 * reads it. `bandState` comes from the bake's `band` events.
 */
export function writeBandFrameWords(
  out: Uint32Array,
  plan: BandPlan,
  state: DataView,
  score: NoteTimelineScore,
  nowFrames: number,
  bandState: number,
  scratch: DataView,
): void {
  if (out.length < BAND_FRAME_WORDS)
    throw new RangeError(
      `A band frame needs ${BAND_FRAME_WORDS} words, got room for ${out.length}`,
    );
  state.setFloat32(NOTE_FIELDS.now, nowFrames, true);
  const now = state.getFloat32(NOTE_FIELDS.now, true);
  const teHead = effectiveTime(state, score, plan.headKey, plan.headFrames);
  const teTail = effectiveTime(state, score, plan.tailKey, plan.tailFrames);
  const position = timelineIntegral(score, 0, 0, toMs(now));
  const clock = f32(f32(position * SPAWN_CONSTANTS.framesPerMs) + TIMELINE_ORIGIN);
  const bits = (value: number): number => {
    scratch.setFloat32(0, value, true);
    return scratch.getUint32(0, true);
  };
  out[0] = bandState;
  out[1] = bits(f32(teHead - now));
  out[2] = bits(f32(plan.headFrames - now));
  out[3] = bits(f32(teTail - now));
  out[4] = bits(f32(plan.tailFrames - now));
  out[5] = bits(clock);
}
