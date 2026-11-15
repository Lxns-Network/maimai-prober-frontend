import type { BoundScore } from "../chart/bind/bindScore";
import { hexByte } from "../chart/bind/hexByte";
import { registerImmutableScroll } from "./space";
import { registerImmutableTimeline, type NoteTimelineScore } from "./timing";

/** Bytes of one timeline event record. */
const EVENT_BYTES = 32;

function concatEvents(items: readonly DataView[]): DataView {
  const bytes = new Uint8Array(items.length * EVENT_BYTES);
  items.forEach((item, i) =>
    bytes.set(new Uint8Array(item.buffer, item.byteOffset, EVENT_BYTES), i * EVENT_BYTES),
  );
  return new DataView(bytes.buffer);
}

/** Primary type of a slide and the vector its chain of joints is stored under. */
const SLIDE_TYPE = 2;
const JOINTS_VECTOR = "0x40";
const JOINT_BYTES = 36;
/** Primary type of an AIR ladder, its joint vector and its sample vector. */
const LADDER_TYPE = 9;
const SAMPLES_VECTOR = "0x60";
/** Secondary type of an AIR slide and the vector its joints are stored under. */
const AIR_SLIDE_SECONDARY = 8;
const AIR_SLIDE_VECTOR = "0x50";
/** Secondary type of an AIR HOLD and the vector its element joints are stored under; it may be empty. */
const AIR_HOLD_SECONDARY = 5;
const AIR_HOLD_VECTOR = "0x50";
const SAMPLE_BYTES = 32;
/** Vector a long note's primary judgment ticks are stored under. */
const TICKS_VECTOR = "0x148";
/** Vector an attached AIR long note's judgment ticks are stored under. */
const SECONDARY_TICKS_VECTOR = "0x158";
const TICK_BYTES = 32;

/** The score the note layer reads: the timeline score, and each slide record's joints by record index. */
export interface NoteScore extends NoteTimelineScore {
  /** One 36-byte view per joint of each slide record; absent when the score has no slide. */
  slideJoints?: ReadonlyMap<number, readonly DataView[]>;
  /** Each AIR slide record's 36-byte joints by record index; absent when the score has no AIR slide. */
  airSlides?: ReadonlyMap<number, readonly DataView[]>;
  /** Each AIR HOLD record's 36-byte element joints by record index, possibly none; absent when the score has no AIR HOLD. */
  airHolds?: ReadonlyMap<number, readonly DataView[]>;
  /** Each AIR ladder record's 36-byte joints and 32-byte samples by record index; absent when the score has no ladder. */
  ladders?: ReadonlyMap<number, { joints: readonly DataView[]; samples: readonly DataView[] }>;
  /** Each record's 32-byte primary judgment ticks by record index, for records that have them. */
  ticks?: ReadonlyMap<number, readonly DataView[]>;
  /** Each record's 32-byte attached AIR judgment ticks by record index, for records that have them. */
  secondaryTicks?: ReadonlyMap<number, readonly DataView[]>;
}

/** Bytes of a canonical hex string, with undefined (`--`) bytes as zero. */
function hexView(hex: string, size: number): DataView {
  if (hex.length !== size * 2) throw new RangeError(`A canonical row must be ${size} bytes`);
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) bytes[i] = hexByte(hex, i * 2);
  return new DataView(bytes.buffer);
}

/**
 * The score the note layer reads: the bound records with the chart's scroll rows and per-key timeline
 * rows laid out as contiguous event tables. Both tables are registered as immutable, so the caller
 * must not write to them afterwards.
 */
export function noteScoreOf(bound: BoundScore): NoteScore {
  const { timeline } = bound.parsed.run;
  const keyed = new Map<number, DataView>();
  for (const [key, vector] of timeline.map)
    if (vector.items.length) keyed.set(key, concatEvents(vector.items));
  const notes = bound.parsed.canonical.vectors["0x15c"]?.items ?? [];
  const slideJoints = new Map<number, readonly DataView[]>();
  const ladders = new Map<number, { joints: readonly DataView[]; samples: readonly DataView[] }>();
  const airSlides = new Map<number, readonly DataView[]>();
  const airHolds = new Map<number, readonly DataView[]>();
  const ticks = new Map<number, readonly DataView[]>();
  const secondaryTicks = new Map<number, readonly DataView[]>();
  const rows = (items: readonly unknown[] | undefined, size: number): DataView[] | undefined =>
    items?.map((row) => {
      if (typeof row !== "string") throw new TypeError("A row must be canonical hex");
      return hexView(row, size);
    });
  bound.records.forEach((record, index) => {
    const type = record.getInt32(0x10, true);
    const note = notes[index];
    const vectors = note && typeof note !== "string" ? note.vectors : undefined;
    const recordTicks = rows(vectors?.[TICKS_VECTOR]?.items, TICK_BYTES);
    if (recordTicks?.length) ticks.set(index, recordTicks);
    const attachedTicks = rows(vectors?.[SECONDARY_TICKS_VECTOR]?.items, TICK_BYTES);
    if (attachedTicks?.length) secondaryTicks.set(index, attachedTicks);
    if (record.getInt32(0x14, true) === AIR_SLIDE_SECONDARY) {
      const chain = rows(vectors?.[AIR_SLIDE_VECTOR]?.items, JOINT_BYTES);
      if (!chain?.length) throw new RangeError(`AIR slide record ${index} has no joints`);
      airSlides.set(index, chain);
    }
    if (record.getInt32(0x14, true) === AIR_HOLD_SECONDARY) {
      const elements = rows(vectors?.[AIR_HOLD_VECTOR]?.items, JOINT_BYTES);
      if (!elements) throw new RangeError("AIR HOLD record " + index + " has no element vector");
      airHolds.set(index, elements);
    }
    if (type !== SLIDE_TYPE && type !== LADDER_TYPE) return;
    const joints = rows(vectors?.[JOINTS_VECTOR]?.items, JOINT_BYTES);
    if (!joints) return;
    if (type === SLIDE_TYPE) slideJoints.set(index, joints);
    else
      ladders.set(index, {
        joints,
        samples: rows(vectors?.[SAMPLES_VECTOR]?.items, SAMPLE_BYTES) ?? [],
      });
  });
  const score: NoteScore = {
    records: bound.records,
    timeline: keyed,
    scroll: concatEvents(timeline.dcm.items),
    slideJoints,
    ladders,
    airSlides,
    airHolds,
    ticks,
    secondaryTicks,
  };
  registerImmutableTimeline(score);
  registerImmutableScroll(score.scroll);
  return score;
}
