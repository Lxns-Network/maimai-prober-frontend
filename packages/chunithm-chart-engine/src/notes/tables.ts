/** Named constants transcribed from the reference tables; runtime code imports no JSON. */

/** Spawn-window constants in 1/60 s frames and depth units. */
export const SPAWN_CONSTANTS: Readonly<Record<string, number>> = Object.freeze({
  earlyFrames: 30,
  framesPerMs: 0.05999999865889549,
  msPerFrame: 16.66666603088379,
  one: 1,
  zero: 0,
  depthOrigin: -65,
  windowMinimum: -550,
  windowMaximum: 550,
  passedFrameLimit: -10,
  passedDepth: 40,
});

/** Note-state and record byte offsets. */
export const NOTE_FIELDS: Readonly<Record<string, number>> = Object.freeze({
  now: 768,
  speed: 852,
  depthScale: 856,
  viewOffset: 932,
  eventStart: 8,
  eventValue: 16,
  eventEnd: 28,
  noteTime: 8,
  primaryType: 16,
  secondaryType: 20,
  secondaryEnd: 24,
  primaryEnd: 48,
  headKey: 112,
  tailKey: 116,
});

/** Depth model constants. */
export const SPACE_CONSTANTS: Readonly<Record<string, number>> = Object.freeze({
  laneCentre: 8,
  one: 1,
  zero: 0,
  queryScale: 16.66666603088379,
  depthOrigin: -65,
});

/** Note-state and DCM record offsets for the depth model. */
export const SPACE_FIELDS: Readonly<Record<string, number>> = Object.freeze({
  nmNow: 768,
  nmSpeed: 852,
  nmDepthScale: 856,
  nmViewOffset: 932,
  scrollStart: 8,
  scrollValue: 16,
  scrollEnd: 28,
  scrollStride: 32,
});

/** Byte stride of one SFL event and of one note record. */
export const EVENT_STRIDE = 32;
export const NOTE_STRIDE = 356;

/** Primary types whose tail participates in the spawn window. */
export const LONG_TYPES: readonly number[] = Object.freeze([1, 2, 9, 10, 12]);

/** Secondary types treated as long notes when the caller passes a secondary flag. */
export const LONG_SECONDARY_TYPES: readonly number[] = Object.freeze([5, 8]);

/** Internal scroll speeds by settings row. */
export const SPEED_ROWS: readonly number[] = Object.freeze([
  0.8, 1, 1.2, 1.4, 1.6, 1.8, 2, 2.2, 2.4, 2.6, 2.8, 3, 3.2, 3.4, 3.6, 3.8, 4, 4.2, 4.4, 4.6, 4.8,
  5, 5.2, 5.4, 5.6, 5.8, 6, 6.2, 6.4, 6.6, 6.8, 7, 7.2, 7.4, 7.6, 7.8, 8, 8.2, 8.4, 8.6, 8.8, 9,
  9.2, 9.4, 9.6, 9.8, 10, 10.2, 10.4, 10.6, 10.8, 11, 11.2, 11.4, 11.6, 11.8, 12, 14, 16, 18, 20,
  60,
]);

/** Lowest internal scroll speed. */
export const SPEED_LOWER_BOUND = 0.10000000149011612;

/** Play-timing offsets in frames by settings row. */
export const TIMING_ROWS: readonly number[] = Object.freeze([
  -2, -1.9, -1.8, -1.7, -1.6, -1.5, -1.4, -1.3, -1.2, -1.1, -1, -0.9, -0.8, -0.7, -0.6, -0.5, -0.4,
  -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6,
  1.7, 1.8, 1.9, 2,
]);

/** Internal scroll speed for a settings row, clamped to the lower bound; out of range yields it too. */
export function speedForRowIndex(rowIndex: number): number {
  if (!Number.isInteger(rowIndex)) throw new TypeError("A settings row index is required");
  const index = rowIndex >>> 0;
  const value = index < SPEED_ROWS.length ? Math.fround(SPEED_ROWS[index]) : 0;
  return value > SPEED_LOWER_BOUND ? value : SPEED_LOWER_BOUND;
}

/** Play-timing offset in frames for a settings row; out of range yields zero. */
export function playTimingForRowIndex(rowIndex: number): number {
  if (!Number.isInteger(rowIndex)) throw new TypeError("A settings row index is required");
  const index = rowIndex >>> 0;
  return index < TIMING_ROWS.length ? TIMING_ROWS[index] : 0;
}

/** Bit patterns the reference stores for constants that must survive JSON (negative zero, one). */
export const DEPTH_INIT_BITS = 3323740160;
export const ONE_BITS = 1065353216;
export const SIGN_MASK = 2147483648;

/** Note widths in lane units, indexed by the model table index. */
export const NOTE_WIDTHS: readonly number[] = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
]);

/** Mesh families a note can select from. */
export type ModelFamily =
  | "tap"
  | "tapAlt0"
  | "tapAlt1"
  | "mine"
  | "flick"
  | "holdHead"
  | "holdTail"
  | "holdTailAir";

/** Model indices by family, one per width index. */
export const MODEL_INDICES: Readonly<Record<ModelFamily, readonly number[]>> = Object.freeze({
  tap: Object.freeze([81, 80, 79, 78, 77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67, 66]),
  tapAlt0: Object.freeze([97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82]),
  tapAlt1: Object.freeze([
    113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100, 99, 98,
  ]),
  mine: Object.freeze([
    145, 144, 143, 142, 141, 140, 139, 138, 137, 136, 135, 134, 133, 132, 131, 130,
  ]),
  flick: Object.freeze([
    129, 128, 127, 126, 125, 124, 123, 122, 121, 120, 119, 118, 117, 116, 115, 114,
  ]),
  holdHead: Object.freeze([49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34]),
  holdTail: Object.freeze([65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50]),
  holdTailAir: Object.freeze([
    289, 288, 287, 286, 285, 284, 283, 282, 281, 280, 279, 278, 277, 276, 275, 274,
  ]),
});

/**
 * A slide's models by the record's kind (0–2) and the part it draws: the head, the marker on a joint
 * that closes a chain, and that marker when the slide carries an attached AIR. Each row is one model
 * per width index.
 */
export type SlidePart = "head" | "joint" | "jointAir";
const SLIDE_PARTS: readonly SlidePart[] = Object.freeze(["head", "joint", "jointAir"]);
const SLIDE_AIR_ROW = Object.freeze([
  289, 288, 287, 286, 285, 284, 283, 282, 281, 280, 279, 278, 277, 276, 275, 274,
]);
export const SLIDE_MODEL_INDICES: readonly (readonly (readonly number[])[])[] = Object.freeze([
  Object.freeze([
    Object.freeze([17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2]),
    Object.freeze([33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18]),
    SLIDE_AIR_ROW,
  ]),
  Object.freeze([
    Object.freeze([49, 48, 47, 46, 45, 44, 43, 42, 41, 40, 39, 38, 37, 36, 35, 34]),
    Object.freeze([65, 64, 63, 62, 61, 60, 59, 58, 57, 56, 55, 54, 53, 52, 51, 50]),
    SLIDE_AIR_ROW,
  ]),
  Object.freeze([
    Object.freeze([305, 304, 303, 302, 301, 300, 299, 298, 297, 296, 295, 294, 293, 292, 291, 290]),
    SLIDE_AIR_ROW,
    SLIDE_AIR_ROW,
  ]),
]);

/** Slide model for a kind, a part and a width index; indices outside a row yield its widest mesh. */
export function slideModelFor(kind: number, part: SlidePart, index: number): number {
  const rows = SLIDE_MODEL_INDICES[Math.min(Math.max(kind | 0, 0), 2)];
  const row = rows[SLIDE_PARTS.indexOf(part)];
  const clamped = Number.isInteger(index) && index >= 0 ? Math.min(index, row.length - 1) : 0;
  return row[clamped];
}

/** Model index for a family at a table index; indices outside the table yield the widest mesh. */
export function modelForWidth(family: ModelFamily, index: number): number {
  const row = MODEL_INDICES[family];
  if (!row) throw new TypeError("A mesh family is required");
  const clamped = Number.isInteger(index) && index >= 0 ? Math.min(index, row.length - 1) : 0;
  return row[clamped];
}
