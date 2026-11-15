import { readFloatBits, type CommandRecord } from "../commands";
import {
  bitsToFloat,
  floorFiniteFloat32,
  floorFloat32,
  fround,
  truncateToInt32,
  type FloorConstants,
} from "../float32";
import { lookupPositionTime, writePosition } from "../position";
import type { NoteRecord, Vec } from "./storage";
import { ENUMS, F, K, LAYOUT, NOTE_NAMES, T, type EnumName } from "./tables";

export type ScoreDiagnostic =
  | {
      kind: "air-parent-missing" | "air-hold-parent-missing" | "air-slide-parent-missing";
      sequence: number;
    }
  | {
      kind: "note-position-fixed";
      laneBefore: number;
      laneAfter: number;
      widthBefore: number;
      widthAfter: number;
    };

export interface ScoreTimeline {
  bpm: Uint8Array;
  met: Vec<DataView>;
  dcm: Vec<DataView>;
  clk: Vec<DataView>;
  map: Map<number, Vec<DataView>>;
}

export interface ScoreRun {
  mirror: boolean;
  serial: number;
  counter: number;
  diagnostics: ScoreDiagnostic[];
  resolution: number;
  bpm: DataView;
  timeline: ScoreTimeline;
  notes: Vec<NoteRecord>;
  lines: [Vec<DataView>, Vec<DataView>, Vec<DataView>, Vec<DataView>];
  clockLines: Vec<DataView>;
  owner: DataView;
  strings: Map<number, Uint8Array>;
}

export const J40 = LAYOUT.joints.primary;
export const J50 = LAYOUT.joints.secondary;
export const SAMPLES = LAYOUT.joints.samples;
export const T148 = LAYOUT.ticks.primary;
export const T158 = LAYOUT.ticks.secondary;

export const i32 = (v: DataView, o: number): number => v.getInt32(o, true);
export const u32 = (v: DataView, o: number): number => v.getUint32(o, true);
export const f32 = (v: DataView, o: number): number => v.getFloat32(o, true);
export const setI32 = (v: DataView, o: number, x: number): void => v.setUint32(o, x >>> 0, true);
export const setF32 = (v: DataView, o: number, x: number): void => v.setFloat32(o, x, true);

const floorConstants: FloorConstants = {
  floorMagic: F.floorMagic,
  one: F.one,
  signMask: K.signMask,
};

export const floorF = (x: number): number => floorFiniteFloat32(x, floorConstants);

export const floorAnyF = (x: number): number => floorFloat32(x, floorConstants);

export const scaled10 = (token: CommandRecord, index: number): number =>
  truncateToInt32(
    fround(fround(bitsToFloat(readFloatBits(token, index)) * F.heightScale) + F.half),
  );

export const u32ToF32 = (x: number): number => fround(x >>> 0);

export const token = (t: CommandRecord, i: number): Uint8Array =>
  i >>> 0 < t.tokens.length ? t.tokens[i] : new Uint8Array();

export const cstr = (b: Uint8Array): Uint8Array => {
  const n = b.indexOf(0);
  return n < 0 ? b : b.subarray(0, n);
};

const same = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

export function noteIndex(bytes: Uint8Array): number {
  return NOTE_NAMES.findIndex((n) => same(n, bytes));
}

export function noteType(bytes: Uint8Array): number {
  const i = noteIndex(cstr(bytes));
  return i >>> 0 > K.maxNoteIndex ? -1 : T.noteTypes[i];
}

export function enumIndex(table: EnumName, bytes: Uint8Array): number {
  if (!bytes.length) return 0;
  const i = ENUMS[table].findIndex((n) => same(n, bytes));
  return i < 0 ? 0 : i;
}

export const widthIndex = (w: number): number =>
  T.widthIndex[w > K.widthMax ? K.widthMax : w < 0 ? 0 : w];
export const realWidth = (idx: number): number =>
  idx < 0 || idx >= K.realWidthRows ? 0 : T.realWidth[idx];
export const clampWidth = (w: number): number =>
  w > K.widthMax ? K.widthMax : w < K.widthMin ? K.widthMin : w;

export function position(
  run: ScoreRun,
  view: DataView,
  offset: number,
  measure: number,
  tick: number,
): void {
  const out = new DataView(view.buffer, view.byteOffset + offset, 12);
  writePosition(out, measure >>> 0, tick >>> 0, run.resolution);
  setF32(out, 8, lookupPositionTime(out, run.bpm));
}

export function copyPos(to: DataView, toOff: number, from: DataView, fromOff: number): void {
  for (const d of [0, 4, 8]) to.setUint32(toOff + d, from.getUint32(fromOff + d, true), true);
}

export function differs(a: DataView, ao: number, b: DataView, bo: number): boolean {
  const x = fround(fround(f32(a, ao) * F.beatScale) + f32(a, ao + 4));
  const y = fround(fround(f32(b, bo) * F.beatScale) + f32(b, bo + 4));
  if (!(fround(x + F.nearEpsilon) >= y)) return true;
  if (!(fround(y + F.nearEpsilon) >= x)) return true;
  return false;
}

export function lastOf<T>(vec: Vec<T>): T {
  if (!vec.items.length) throw new RangeError("读取空数组的末元素");
  return vec.items[vec.items.length - 1];
}

const jointTail = (type: number) => type === 2 || (type > 8 && type <= 10);

export const tailLane = (n: NoteRecord): number =>
  jointTail(i32(n.view, 0x10)) ? i32(lastOf(n.vectors[J40]), 0x10) : i32(n.view, 0x28);

export const tailWidth = (n: NoteRecord): number =>
  jointTail(i32(n.view, 0x10)) ? i32(lastOf(n.vectors[J40]), 0x20) : i32(n.view, 0x2c);

export const validSecondary = (x: number): boolean => x >= 0 && x < K.secondaryLimit;
