import type { ObjectRun } from "../chart/lifecycle/emissions";
import type { NoteScore } from "./score";
import { SPACE_CONSTANTS, SPACE_FIELDS } from "./tables";

const f32 = Math.fround;

interface HitDepth {
  anchors: { time: number; advance: number }[][];
  record: number;
  multiplier: number;
}
const hitDepths = new WeakMap<DataView, HitDepth>();

/** Keeps each note's actual early-judge distance stable when its movement is speed-compensated. */
export function bindHitDepth(state: DataView, score: NoteScore, runs: readonly ObjectRun[]) {
  const anchors: HitDepth["anchors"] = score.records.map(() => []);
  for (const run of runs) {
    const index = run.object.record;
    const record = score.records[index];
    const times = [record.getFloat32(8, true)];
    const tail = record.getFloat32(48, true);
    if (tail > times[0]) times.push(tail);
    for (const rows of [
      score.slideJoints?.get(index),
      score.airSlides?.get(index),
      score.airHolds?.get(index),
      score.ladders?.get(index)?.joints,
    ])
      for (const row of rows ?? []) times.push(row.getFloat32(8, true));
    for (const milliseconds of times) {
      const time = f32(milliseconds * 0.05999999865889549);
      const judge = run.judges.find(
        (event) => time >= event.step * 0.5 && time - event.step * 0.5 <= 0.5001,
      );
      if (judge) anchors[index].push({ time, advance: time - judge.step * 0.5 });
    }
  }
  for (const list of anchors) list.sort((a, b) => a.time - b.time);
  const binding: HitDepth = { anchors, record: 0, multiplier: 1 };
  hitDepths.set(state, binding);
  return (multiplier: number) => {
    binding.multiplier = multiplier;
  };
}

/** Selects the record whose models or bands are about to evaluate their depth. */
export function selectHitDepth(state: DataView, record: number) {
  const binding = hitDepths.get(state);
  if (binding) binding.record = record;
}

interface ScrollRow {
  start: number;
  end: number;
  value: number;
  maximumEnd: number;
}

/** Registered DCM record sets whose bytes are session-private and never rewritten. */
const immutableScroll = new WeakMap<DataView, readonly ScrollRow[] | null | undefined>();

/** Registers a DCM record set as immutable so its ordered rows can be indexed once. */
export function registerImmutableScroll(records: DataView): void {
  if (!immutableScroll.has(records)) immutableScroll.set(records, undefined);
}

/**
 * Indexes the DCM rows of a registered record set; rows must be finite and ordered by start.
 * Zero-valued and empty rows are dropped. Returns `null` when the set is not indexable.
 */
function indexedScroll(records: DataView): readonly ScrollRow[] | null {
  const cached = immutableScroll.get(records);
  if (cached !== undefined) return cached;
  const rows: ScrollRow[] = [];
  let previousStart = -Infinity;
  let maximumEnd = -Infinity;
  for (let at = 0; at < records.byteLength; at += SPACE_FIELDS.scrollStride) {
    const start = records.getFloat32(at + SPACE_FIELDS.scrollStart, true);
    const end = records.getFloat32(at + SPACE_FIELDS.scrollEnd, true);
    const value = records.getFloat32(at + SPACE_FIELDS.scrollValue, true);
    if (![start, end, value].every(Number.isFinite) || start < previousStart) {
      immutableScroll.set(records, null);
      return null;
    }
    previousStart = start;
    if (value === 0 || end <= start) continue;
    maximumEnd = Math.max(maximumEnd, end);
    rows.push({ start, end, value, maximumEnd });
  }
  immutableScroll.set(records, rows);
  return rows;
}

/** Horizontal position of a lane span; the lane index is truncated to int32 first. */
export function lanePosition(lane: number, width: number): number {
  const converted = f32(lane | 0);
  let xmm1 = f32(converted + f32(width));
  let xmm2 = f32(converted - SPACE_CONSTANTS.laneCentre);
  xmm1 = f32(xmm1 - SPACE_CONSTANTS.laneCentre);
  xmm2 = f32(xmm2 + xmm2);
  xmm1 = f32(xmm1 + xmm1);
  return f32(xmm2 + xmm1);
}

/** Scroll multiplier at a millisecond query; one when no row covers it. */
export function speedAt(records: DataView, milliseconds: number): number {
  if (!(records instanceof DataView) || records.byteLength % SPACE_FIELDS.scrollStride !== 0)
    throw new TypeError("A complete contiguous DCM record set is required");
  const query = f32(f32(milliseconds) + SPACE_CONSTANTS.one);
  const rows =
    immutableScroll.has(records) && Number.isFinite(query) ? indexedScroll(records) : null;
  if (rows) {
    let lo = 0,
      hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (rows[mid].maximumEnd <= query) lo = mid + 1;
      else hi = mid;
    }
    for (let at = lo; at < rows.length; at++) {
      const row = rows[at];
      if (row.start > query) break;
      if (query < row.end && row.value !== SPACE_CONSTANTS.zero) return row.value;
    }
    return SPACE_CONSTANTS.one;
  }
  for (let offset = 0; offset < records.byteLength; offset += SPACE_FIELDS.scrollStride) {
    if (records.getFloat32(offset + SPACE_FIELDS.scrollStart, true) > query) break;
    if (query >= records.getFloat32(offset + SPACE_FIELDS.scrollEnd, true)) continue;
    const value = records.getFloat32(offset + SPACE_FIELDS.scrollValue, true);
    if (value !== SPACE_CONSTANTS.zero) return value;
  }
  return SPACE_CONSTANTS.one;
}

/**
 * Depth along the view axis for a signed frame distance. `flag2` selects the display-offset
 * branch, `flag3` gates the scroll multiplier inside it, and each flag reads its low byte only.
 */
export function depthAt(
  state: DataView,
  frames: number,
  flag2: number,
  flag3: number,
  scroll: DataView,
): number {
  if (!(state instanceof DataView)) throw new TypeError("State must be a DataView");
  if (!Number.isInteger(flag2) || !Number.isInteger(flag3))
    throw new TypeError("Two integer byte flags are required");
  const arg = f32(frames);
  let xmm2 = SPACE_CONSTANTS.one;
  let xmm0 = arg;
  if ((flag2 & 0xff) !== 0) {
    if ((flag3 & 0xff) !== 0 && arg > SPACE_CONSTANTS.zero) {
      const sum = f32(state.getFloat32(SPACE_FIELDS.nmNow, true) + arg);
      xmm2 = speedAt(scroll, f32(sum * SPACE_CONSTANTS.queryScale));
    }
    xmm0 = f32(state.getFloat32(SPACE_FIELDS.nmViewOffset, true) + arg);
  }
  const hit = hitDepths.get(state);
  if (hit && hit.multiplier > 1 && xmm0 > 0) {
    const anchors = hit.anchors[hit.record];
    const time = state.getFloat32(SPACE_FIELDS.nmNow, true) + arg;
    let nearest: { time: number; advance: number } | undefined;
    for (const anchor of anchors)
      if (!nearest || Math.abs(anchor.time - time) < Math.abs(nearest.time - time))
        nearest = anchor;
    if (nearest) xmm0 = f32(xmm0 - Math.min(xmm0, nearest.advance) * (1 - 1 / hit.multiplier));
  }
  let xmm1 = f32(state.getFloat32(SPACE_FIELDS.nmDepthScale, true) * xmm0);
  xmm1 = f32(xmm1 * state.getFloat32(SPACE_FIELDS.nmSpeed, true));
  xmm1 = f32(xmm1 * xmm2);
  return f32(SPACE_CONSTANTS.depthOrigin - xmm1);
}
