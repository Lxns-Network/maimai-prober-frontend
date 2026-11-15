import { add, fromNumber, precisionBits, toFloat32 } from "../bind/x87";
import { NOTE_WIDTHS } from "../../notes/tables";

/** Judge timing offset per settings row, in frames. */
const JUDGE_TIMING_OFFSETS: readonly number[] = Object.freeze([
  -2.0, -1.9, -1.8, -1.7, -1.6, -1.5, -1.4, -1.3, -1.2, -1.1, -1.0, -0.9, -0.8, -0.7, -0.6, -0.5,
  -0.4, -0.3, -0.2, -0.1, 0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4,
  1.5, 1.6, 1.7, 1.8, 1.9, 2.0,
]);

/** Settings row automatic play judges at. */
export const AUTOPLAY_JUDGE_TIMING_ROW = 20;

/** Grade every automatic judgment commits. */
export const AUTOPLAY_GRADE = 4;

const STEP_FRAMES = 0.5;
const LANES = 16;
const CONFIG_ROW_BYTES = 56;
const CONFIG_WINDOWS = 0x588;
const CONFIG_THRESHOLD = 0xb04;
const EXTENDED_BITS = precisionBits(0x37f);

/** Single-precision judge timing offset of a settings row; zero outside the table. */
export function judgeTimingOffset(row: number): number {
  return row >= 0 && row < JUDGE_TIMING_OFFSETS.length ? Math.fround(JUDGE_TIMING_OFFSETS[row]) : 0;
}

/** Frame delta at and past which an automatic checker commits its grade. */
export function autoplayThreshold(config: DataView, row: number): number {
  const option = row >= 0 && row < JUDGE_TIMING_OFFSETS.length ? JUDGE_TIMING_OFFSETS[row] : 0;
  return toFloat32(
    add(fromNumber(option), fromNumber(config.getFloat32(CONFIG_THRESHOLD, true)), EXTENDED_BITS),
  );
}

/** Earliest and latest frame deltas a note's lane windows accept. */
export interface LaneChecker {
  early: number;
  late: number;
}

/**
 * Checker window of a single-lane-span note from a judge configuration row, narrowed per lane by
 * the neighbour limits bound into the record.
 */
export function laneChecker(
  record: DataView,
  config: DataView,
  configRow: number,
  offset: number,
): LaneChecker {
  const lane = record.getInt32(0x28, true);
  const widthIndex = record.getInt32(0x2c, true);
  const width = widthIndex >= 0 && widthIndex < LANES ? NOTE_WIDTHS[widthIndex] : 0;
  if (!Number.isInteger(lane) || width < 1 || width > LANES)
    throw new RangeError("A note lane and width are required");
  const first = Math.max(lane, 0);
  const end = Math.min(first + width, LANES);
  if (first >= end) return { early: 0, late: 0 };
  const base = CONFIG_WINDOWS + CONFIG_ROW_BYTES * configRow;
  const window = (at: number) => Math.fround(config.getFloat32(base + at, true) + offset);
  let early = Infinity;
  let late = -Infinity;
  for (let i = first; i < end; i++) {
    let laneEarly = window(0);
    let laneLate = window(24);
    if (record.getUint8(0xa4 + i)) {
      const limit = Math.min(
        Math.fround(offset - record.getFloat32(0xc4 + i * 4, true)),
        window(20),
        offset,
      );
      laneEarly = Math.max(limit, laneEarly);
    }
    if (record.getUint8(0xb4 + i)) {
      const limit = Math.max(
        Math.fround(record.getFloat32(0x104 + i * 4, true) + offset),
        window(44),
        offset,
      );
      laneLate = Math.min(limit, laneLate);
    }
    early = Math.min(early, laneEarly);
    late = Math.max(late, laneLate);
  }
  return { early, late };
}

/**
 * First grid step at or after `from` at which an automatic checker commits for a note at
 * `noteFrames`: the frame delta is inside the early bound and has reached the threshold or the late
 * bound.
 */
export function firstCommitStep(
  noteFrames: number,
  checker: LaneChecker,
  threshold: number,
  from: number,
): number {
  const commits = (k: number) => {
    const delta = Math.fround(Math.fround(k * STEP_FRAMES) - noteFrames);
    if (checker.early > delta) return false;
    return delta >= threshold || !(delta < checker.late);
  };
  const reach = Math.max(checker.early, Math.min(threshold, checker.late));
  return firstStepFrom(from, Math.floor((noteFrames + reach) / STEP_FRAMES) - 2, commits);
}

/**
 * First grid step at or after `from` at which `holds` is true, for a test that stays true once it
 * holds; `guess` is where the search starts and need not be exact.
 */
export function firstStepFrom(from: number, guess: number, holds: (k: number) => boolean): number {
  if (holds(from)) return from;
  let k = Math.max(from + 1, guess);
  while (k > from + 1 && holds(k - 1)) k--;
  while (!holds(k)) k++;
  return k;
}

/** Single-precision frame time of a step on the grid. */
export const stepFrames = (k: number): number => Math.fround(k * STEP_FRAMES);

const CONFIG_AIR_SHIFT = 0x870;
const CONFIG_AIR_ROWS = 0x898;
const CONFIG_AIR_ROW_BYTES = 60;

/** Frame deltas an AIR checker opens after and settles at. */
export interface AirChecker {
  early: number;
  centre: number;
}

/** AIR checker of a configuration row; every window is shifted by the row's offset. */
export function airChecker(config: DataView, row: number, offset: number): AirChecker {
  const at = (k: number) => config.getFloat32(k, true);
  const shift = Math.fround(
    at(CONFIG_AIR_SHIFT) + at(CONFIG_AIR_ROWS + row * CONFIG_AIR_ROW_BYTES),
  );
  const window = (value: number) => Math.fround(Math.fround(value + offset) + shift);
  return {
    early: window(at(CONFIG_AIR_ROWS + 0x14 + row * CONFIG_AIR_ROW_BYTES)),
    centre: window(0),
  };
}

/** First grid step at or after `from` at which an automatic AIR checker settles. */
export function firstAirStep(noteFrames: number, checker: AirChecker, from: number): number {
  return firstStepFrom(from, Math.floor(2 * (noteFrames + checker.centre)) - 2, (k) => {
    const delta = Math.fround(stepFrames(k) - noteFrames);
    return !(checker.early >= delta) && !(checker.centre > delta);
  });
}
