export type ColumnType = "f64" | "f32" | "u32" | "i32" | "u16" | "u8";

export const SEGMENTS = {
  judge: {
    order: "time",
    columns: { time: "f64", note: "u32", result: "u8", kind: "u8", part: "u8" },
  },
  score: {
    order: "time",
    columns: {
      time: "f64",
      score: "u32",
      combo: "u32",
      gauge: "f64",
      judgeCounts0: "u32",
      judgeCounts1: "u32",
      judgeCounts2: "u32",
      judgeCounts3: "u32",
    },
  },
  effect: {
    order: "time",
    columns: {
      time: "f64",
      resource: "u16",
      note: "u32",
      lane: "i32",
      width: "u8",
      rngLow: "u32",
      rngHigh: "u32",
      crt: "u32",
    },
  },
  band: { order: "time", columns: { time: "f64", note: "u32", state: "u8" } },
  slide: { order: "time", columns: { time: "f64", note: "u32", mode: "u8" } },
  airband: { order: "time", columns: { time: "f64", note: "u32", mode: "u8" } },
  motion: {
    order: "time",
    columns: { time: "f64", note: "u32", part: "u16", model: "u16", frame: "f32" },
  },
  airmodel: { order: "time", columns: { time: "f64", note: "u32", part: "u16", shown: "u8" } },
  cue: { order: "time", columns: { time: "f64", cue: "u16", channel: "u8", gain: "f32" } },
  note: {
    order: "appear",
    columns: { appear: "f64", judgeTime: "f64", end: "f64", record: "u32", type: "u8" },
  },
  /** Stops of cues started by `cue`; `row` is the stopped cue's row index, `reason` 0 player, 42 script, 47 category limit, 54 group limit. */
  cuestop: { order: "time", columns: { time: "f64", row: "u32", reason: "u8" } },
} as const satisfies Record<string, { order: string; columns: Record<string, ColumnType> }>;

export type SegmentName = keyof typeof SEGMENTS;
type CompleteRow<S extends SegmentName> = { [K in keyof (typeof SEGMENTS)[S]["columns"]]: number };
export type Row<S extends SegmentName> = S extends "judge"
  ? Omit<CompleteRow<S>, "part"> & { part?: number }
  : CompleteRow<S>;

// "CHTL"
export const TIMELINE_MAGIC = 0x4c544843;
export const TIMELINE_VERSION = 5;
/** Oldest version still read; segments added later than a buffer's version are empty in it. */
export const TIMELINE_MIN_VERSION = 4;
export const SEGMENT_SINCE: Partial<Record<SegmentName, number>> = { cuestop: 5 };
export const BYTES: Record<ColumnType, number> = { f64: 8, f32: 4, u32: 4, i32: 4, u16: 2, u8: 1 };

export type TypedColumn =
  | Float64Array
  | Float32Array
  | Uint32Array
  | Int32Array
  | Uint16Array
  | Uint8Array;
export type TypedColumnConstructor = new (
  buffer: ArrayBuffer,
  byteOffset: number,
  length: number,
) => TypedColumn;
export const ARRAY: Record<ColumnType, TypedColumnConstructor> = {
  f64: Float64Array,
  f32: Float32Array,
  u32: Uint32Array,
  i32: Int32Array,
  u16: Uint16Array,
  u8: Uint8Array,
};
