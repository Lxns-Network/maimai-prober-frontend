import table from "../tables/score.json";
import { bitsToFloat } from "../float32";

export interface StoreSpec {
  offset: number;
  size: number;
  value?: number;
  from?: string;
}

export interface StructLayout {
  size: number;
  undefined: number[][];
}

export type StructKind =
  | "owner"
  | "bpm"
  | "met"
  | "dcm"
  | "clk"
  | "timelineEvent"
  | "note"
  | "joint"
  | "sample"
  | "owner108"
  | "line"
  | "tick";

interface OwnerLayout extends StructLayout {
  vectors: Record<string, string | null>;
  strings: number[];
  maps: Record<string, string>;
  lineOrder: number[];
}

interface NoteLayout extends StructLayout {
  vectors: Record<string, string>;
}

interface ScoreLayout {
  owner: OwnerLayout;
  note: NoteLayout;
  bpm: StructLayout;
  met: StructLayout;
  dcm: StructLayout;
  clk: StructLayout;
  timelineEvent: StructLayout;
  joint: StructLayout;
  sample: StructLayout;
  owner108: StructLayout;
  line: StructLayout;
  tick: StructLayout;
  joints: { primary: string; secondary: string; samples: string };
  ticks: { primary: string; secondary: string };
}

export interface PrimaryStat {
  kind: string;
  inc?: number[];
  count?: number[];
  duration?: number;
  ticks?: number;
  jointCount?: number;
  flaggedJointCount?: number;
}

interface StatsTable {
  clear: { begin: number; end: number };
  primary: Record<string, PrimaryStat>;
  groundLong: number;
  judgeTotal: number;
  directionTotal: number;
  directionBase: number;
  span: number;
  density: number;
  densityBins: number;
  air: number[];
  airLong: { count: number[]; once: number[]; duration: number; judge: number };
  totals: number[][];
}

const floats = <T extends Record<string, number>>(bits: T): { [K in keyof T]: number } =>
  Object.fromEntries(Object.entries(bits).map(([k, v]) => [k, bitsToFloat(v)])) as {
    [K in keyof T]: number;
  };

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

export const K = table.constants;
export const F = floats(table.floats);
export const T = table.tables;
export const LAYOUT: ScoreLayout = table.layout;
export const STORES: Record<keyof typeof table.stores, StoreSpec[]> = table.stores;
export const PK = table.post.constants;
export const PF = floats(table.post.floats);
export const STATS: StatsTable = table.post.stats;
export const SORT_STRIDES: readonly number[] = table.post.sortStrides;
export const TICK_CONSTRUCTOR: StoreSpec[] = table.post.tickConstructor;

export const NOTE_NAMES: readonly Uint8Array[] = T.noteNames.map(ascii);

export const ENUMS = {
  chrDirection: T.chrDirection.map(ascii),
  airColor: T.airColor.map(ascii),
  slideGroup: T.slideGroup.map(ascii),
  color: T.color.map(ascii),
} satisfies Record<string, Uint8Array[]>;

export type EnumName = keyof typeof ENUMS;
