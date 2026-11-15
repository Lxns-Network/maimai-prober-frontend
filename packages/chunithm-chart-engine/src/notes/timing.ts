import { fromNumber, precisionBits, subtract, toFloat32 } from "../chart/bind/x87";
import { speedAt } from "./space";
import {
  EVENT_STRIDE,
  LONG_SECONDARY_TYPES,
  LONG_TYPES,
  NOTE_FIELDS,
  SPAWN_CONSTANTS,
} from "./tables";

/** Timeline and DCM views a note query reads; the same shape the note-state initializer produces. */
export interface NoteTimelineScore {
  records: readonly DataView[];
  timeline: ReadonlyMap<number, DataView>;
  scroll: DataView;
}

export interface TimelineEvent {
  start: number;
  end: number;
  value: number;
}

/** Distinct cache key for a negative-zero endpoint, which SameValueZero would merge with zero. */
const negativeZeroTime = Symbol("negative zero timeline endpoint");

/** Registered scores whose SFL rows are session-private and never rewritten. */
const immutableTimelines = new WeakMap<
  NoteTimelineScore,
  Map<number, readonly TimelineEvent[] | null>
>();
const integralFrames = new WeakMap<
  NoteTimelineScore,
  Map<number, { from: number; results: Map<number | symbol, number> }>
>();

/** Registers a score as privately owned and immutable so its ordered SFL rows can be indexed once. */
export function registerImmutableTimeline(score: NoteTimelineScore): void {
  if (!immutableTimelines.has(score)) immutableTimelines.set(score, new Map());
}

const checked = (value: number): number => {
  if (!Number.isFinite(value) || (value !== 0 && Math.abs(value) < 2 ** -126))
    throw new RangeError("Only finite normal numbers and zero are supported");
  return value;
};
/** Rounding to single precision under the same finiteness guard the reference applies. */
const f32 = (value: number): number => checked(Math.fround(value));
const rf = (view: DataView, at: number): number => checked(view.getFloat32(at, true));

/** Converts 1/60 s frames to milliseconds. */
export const toMs = (frames: number): number => f32(frames * SPAWN_CONSTANTS.msPerFrame);
/** Converts milliseconds to 1/60 s frames. */
export const toFrames = (milliseconds: number): number =>
  f32(milliseconds * SPAWN_CONSTANTS.framesPerMs);
/** Current note time in frames. */
export const nowOf = (state: DataView): number => rf(state, NOTE_FIELDS.now);

/**
 * Indexes the SFL rows of a registered score; rows must be finite and ordered.
 * Returns `null` when the row set is not indexable.
 */
function indexedTimeline(
  score: NoteTimelineScore,
  key: number,
  events: DataView,
): readonly TimelineEvent[] | null {
  const cache = immutableTimelines.get(score);
  if (!cache) return null;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let rows: TimelineEvent[] | null = null;
  try {
    if (events.byteLength % EVENT_STRIDE === 0) {
      rows = [];
      let previousEnd = -Infinity;
      for (let at = 0; at < events.byteLength; at += EVENT_STRIDE) {
        const start = rf(events, at + NOTE_FIELDS.eventStart);
        const end = rf(events, at + NOTE_FIELDS.eventEnd);
        const value = rf(events, at + NOTE_FIELDS.eventValue);
        if (start < previousEnd || end < start) {
          rows = null;
          break;
        }
        rows.push({ start, end, value });
        previousEnd = end;
      }
    }
  } catch {
    rows = null;
  }
  cache.set(key, rows);
  return rows;
}

/** The ordered rows of a registered score's key, or `null` when unregistered, absent or not indexable. */
export function registeredTimelineRows(
  score: NoteTimelineScore,
  key: number,
): readonly TimelineEvent[] | null {
  const events = score.timeline.get(key);
  return events ? indexedTimeline(score, key, events) : null;
}

/** Looks a timeline view up by int32 key; returns `null` when absent. */
export function mapFind(score: NoteTimelineScore, key: number): DataView | null {
  if (!Number.isInteger(key)) throw new TypeError("A timeline key must be an integer");
  return score.timeline.get(key | 0) ?? null;
}

/**
 * Integrates the SFL rows covering `[from, to]` and adds the result to `to`.
 * Both bounds are in milliseconds. Returns the rounded `to` when the range is reversed
 * or the key is absent; `from` is clamped so the accumulator starts at `to`.
 */
export function timelineIntegral(
  score: NoteTimelineScore,
  key: number,
  fromArgument: number,
  toArgument: number,
): number {
  const from = f32(fromArgument);
  const to = f32(toArgument);
  if (from > to) return to;
  const events = mapFind(score, key);
  if (!events) return to;
  let results: Map<number | symbol, number> | undefined;
  const endpoint = Object.is(to, -0) ? negativeZeroTime : to;
  if (immutableTimelines.has(score)) {
    let keys = integralFrames.get(score);
    if (!keys) integralFrames.set(score, (keys = new Map()));
    let entry = keys.get(key);
    if (!entry) {
      if (keys.size >= 256) keys.delete(keys.keys().next().value!);
      entry = { from, results: new Map() };
      keys.set(key, entry);
    } else if (!Object.is(entry.from, from)) {
      entry.from = from;
      entry.results.clear();
    }
    results = entry.results;
    const cached = results.get(endpoint);
    if (cached !== undefined) return cached;
  }
  const remember = (result: number): number => {
    if (results) {
      if (results.size >= 512) results.clear();
      results.set(endpoint, result);
    }
    return result;
  };
  const rows = indexedTimeline(score, key, events);
  if (rows) {
    let lo = 0,
      hi = rows.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (rows[mid].end <= from) lo = mid + 1;
      else hi = mid;
    }
    let acc = to;
    for (let at = lo; at < rows.length; at++) {
      const row = rows[at];
      if (row.start >= to) break;
      const start = Math.max(row.start, from);
      const end = Math.min(row.end, to);
      if (start > end) continue;
      acc = f32(f32(f32(end - start) * f32(row.value - SPAWN_CONSTANTS.one)) + acc);
    }
    return remember(acc);
  }
  if (events.byteLength % EVENT_STRIDE !== 0) throw new RangeError("Incomplete timeline rows");
  let acc = to;
  for (let at = 0; at < events.byteLength; at += EVENT_STRIDE) {
    let start = rf(events, at + NOTE_FIELDS.eventStart);
    if (start >= to) break;
    let end = rf(events, at + NOTE_FIELDS.eventEnd);
    if (from >= end) continue;
    if (from > start) start = from;
    if (end > to) end = to;
    if (start > end) continue;
    const value = rf(events, at + NOTE_FIELDS.eventValue);
    acc = f32(f32(f32(end - start) * f32(value - SPAWN_CONSTANTS.one)) + acc);
  }
  return remember(acc);
}

/** Frame distance from the current note time to `t`, with an optional SFL retime. */
export function frameDelta(
  state: DataView,
  score: NoteTimelineScore,
  key: number,
  t: number,
  integrate: boolean,
): { dt: number; retime: () => number } {
  const dt = f32(t - nowOf(state));
  return {
    dt,
    retime: () =>
      (key | 0) >= 0 && integrate
        ? f32(toFrames(timelineIntegral(score, key, toMs(nowOf(state)), toMs(t))) - nowOf(state))
        : dt,
  };
}

/** Frame position of `t` after integrating the SFL rows from the current note time. */
export function effectiveTime(
  state: DataView,
  score: NoteTimelineScore,
  key: number,
  t: number,
): number {
  return toFrames(timelineIntegral(score, key, toMs(nowOf(state)), toMs(f32(t))));
}

/** Significant bits of the extended-precision difference an extended depth argument is rounded at. */
const EXTENDED_BITS = precisionBits(0x37f);

/**
 * The depth argument of a record whose effective time stays in extended precision: the negated
 * `now - integral * framesPerMs`, rounded at extended precision and then to float32, with the
 * effective time itself never rounded. The product of the two float32 factors is exact in double
 * precision, so a difference double precision holds exactly is already the extended result.
 */
export function extendedDepthArgument(
  state: DataView,
  score: NoteTimelineScore,
  key: number,
  t: number,
): number {
  const now = nowOf(state);
  const product =
    timelineIntegral(score, key, toMs(now), toMs(f32(t))) * SPAWN_CONSTANTS.framesPerMs;
  const delta = now - product;
  const virtual = delta - now;
  if (now - (delta - virtual) + (-product - virtual) === 0) return -f32(delta);
  return -checked(toFloat32(subtract(fromNumber(now), fromNumber(product), EXTENDED_BITS)));
}

/** Converts a millisecond query against the DCM rows; exposed for callers that pre-scale time. */
export function scrollQuery(state: DataView, dt: number): number {
  return toMs(f32(dt + nowOf(state)));
}

/** Reads a low byte as a boolean flag. */
export const flagOf = (value: number): boolean => {
  if (!Number.isInteger(value)) throw new TypeError("An integer byte flag is required");
  return (value & 0xff) !== 0;
};

/** Whether the record's type marks it as a long note; the secondary flag selects the secondary type. */
export function isLongNote(record: DataView, secondaryFlag: number): boolean {
  if (
    flagOf(secondaryFlag) &&
    LONG_SECONDARY_TYPES.includes(record.getInt32(NOTE_FIELDS.secondaryType, true))
  )
    return true;
  return LONG_TYPES.includes(record.getInt32(NOTE_FIELDS.primaryType, true));
}

/** End-position view of a record, sharing its bytes; the secondary flag selects which end offset. */
export function endPosition(record: DataView, secondaryFlag: number): DataView {
  const secondary =
    flagOf(secondaryFlag) &&
    LONG_SECONDARY_TYPES.includes(record.getInt32(NOTE_FIELDS.secondaryType, true));
  const at = secondary ? NOTE_FIELDS.secondaryEnd : NOTE_FIELDS.primaryEnd;
  if (record.byteLength < at + 12) throw new RangeError("Note end position is outside the record");
  return new DataView(record.buffer, record.byteOffset + at, 12);
}

/** Depth along the view axis, scaled by the scroll multiplier. */
function depth(state: DataView, time: number, scale: number): number {
  return f32(
    SPAWN_CONSTANTS.depthOrigin -
      f32(
        f32(f32(rf(state, NOTE_FIELDS.depthScale) * time) * rf(state, NOTE_FIELDS.speed)) * scale,
      ),
  );
}

/** Scroll multiplier at a signed frame offset from the current note time. */
function scrollAt(score: NoteTimelineScore, state: DataView, dt: number): number {
  return checked(speedAt(score.scroll, scrollQuery(state, dt)));
}

/** Whether one end of a note falls inside the spawn window. */
export function spawnSide(
  state: DataView,
  score: NoteTimelineScore,
  time: number,
  key: number,
): boolean {
  const delta = frameDelta(state, score, key, time, true);
  if (SPAWN_CONSTANTS.earlyFrames > delta.dt) return true;
  const dt = delta.retime();
  const scale = dt > SPAWN_CONSTANTS.zero ? scrollAt(score, state, dt) : SPAWN_CONSTANTS.one;
  const z = depth(state, f32(rf(state, NOTE_FIELDS.viewOffset) + dt), scale);
  if (SPAWN_CONSTANTS.windowMinimum > z) return false;
  return !(z > SPAWN_CONSTANTS.windowMaximum);
}

/** Whether a note should be constructed; long notes also test their tail when the head misses. */
export function spawnPredicate(
  state: DataView,
  score: NoteTimelineScore,
  record: DataView,
): boolean {
  const head = toFrames(rf(record, NOTE_FIELDS.noteTime));
  if (spawnSide(state, score, head, record.getInt32(NOTE_FIELDS.headKey, true))) return true;
  if (!isLongNote(record, 0)) return false;
  const tail = toFrames(rf(endPosition(record, 0), NOTE_FIELDS.noteTime));
  return spawnSide(state, score, tail, record.getInt32(NOTE_FIELDS.tailKey, true));
}

/**
 * Window membership for an explicit frame time; `flagIntegral` enables the SFL retime and
 * `flagScroll` the scroll multiplier with the display offset. Both read their low byte only.
 */
export function windowPredicate(
  state: DataView,
  score: NoteTimelineScore,
  key: number,
  tArgument: number,
  flagIntegral: number,
  flagScroll: number,
): boolean {
  const t = f32(tArgument);
  const integral = flagOf(flagIntegral);
  const scroll = flagOf(flagScroll);
  const delta = frameDelta(state, score, key, t, integral);
  if (SPAWN_CONSTANTS.earlyFrames > delta.dt) return true;
  let dt = delta.retime();
  let scale = SPAWN_CONSTANTS.one;
  if (scroll) {
    if (dt > SPAWN_CONSTANTS.zero) scale = scrollAt(score, state, dt);
    dt = f32(dt + rf(state, NOTE_FIELDS.viewOffset));
  }
  const z = depth(state, dt, scale);
  if (SPAWN_CONSTANTS.windowMinimum > z) return false;
  return !(z > SPAWN_CONSTANTS.windowMaximum);
}

/** Whether the note has passed the judge line; `flagIntegral` enables the SFL retime. */
export function passedLine(
  state: DataView,
  score: NoteTimelineScore,
  key: number,
  tArgument: number,
  flagIntegral: number,
): boolean {
  const delta = frameDelta(state, score, key, f32(tArgument), flagOf(flagIntegral));
  if (delta.dt > SPAWN_CONSTANTS.passedFrameLimit) return false;
  const dt = delta.retime();
  const scale = dt > SPAWN_CONSTANTS.zero ? scrollAt(score, state, dt) : SPAWN_CONSTANTS.one;
  const z = depth(state, f32(rf(state, NOTE_FIELDS.viewOffset) + dt), scale);
  return !(SPAWN_CONSTANTS.passedDepth > z);
}
