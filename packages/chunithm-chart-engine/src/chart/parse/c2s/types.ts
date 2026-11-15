import type { ScoreDiagnostic } from "./score/common";
import type { ScoreLoadResult } from "./score/loader";
import type { NoteRecord } from "./score/storage";

export interface ChartPosition {
  measure: number;
  beat: number;
  timeMs: number;
}

export interface ChartHeader {
  version: Uint8Array[];
  versionNumbers: number[][];
  music: number;
  sequenceId: number;
  difficult: Uint8Array;
  level: number;
  creator: Uint8Array;
  bpmDef: number[];
  metDef: number[];
  resolution: number;
  clkDef: number;
  progJudgeBpm: number;
  progJudgeAer: number;
  tutorial: boolean;
}

export interface ChartBpm {
  position: ChartPosition;
  sequence: number;
  bpm: number;
}

export interface ChartMeter {
  position: ChartPosition;
  sequence: number;
  lower: number;
  upper: number;
}

export interface ChartIntervalEvent {
  start: ChartPosition;
  end: ChartPosition;
  sequence: number;
  value: number;
}

export interface ChartIntervalGroup {
  key: number;
  events: ChartIntervalEvent[];
}

export interface ChartClock {
  position: ChartPosition;
  sequence: number;
}

export interface ChartLine {
  position: ChartPosition;
  index: number;
  subIndex: number;
}

export interface ChartJoint {
  position: ChartPosition;
  serial: number;
  lane: number;
  flag: number;
  height: number;
  height2: number;
  widthIndex: number;
  width: number;
}

export interface ChartSample {
  position: ChartPosition;
  lane: number;
  height: number;
  width: number;
  flag: number;
}

export interface ChartTick {
  position: ChartPosition;
  kind: number;
  judged: boolean;
  center: number;
  height: number;
}

export interface ChartNote {
  type: number;
  secondaryType: number;
  start: ChartPosition;
  end: ChartPosition;
  airEnd: ChartPosition;
  lane: number;
  widthIndex: number;
  width: number;
  sequence: number;
  counter7c: number;
  counter80: number;
  counter84: number;
  chrDirection: number;
  airDirection: number;
  color: number;
  slideGroup: number;
  height: number;
  height2: number;
  sampleStep: number;
  slaAtStart: number;
  slaAtEnd: number;
  flag24: number;
  flag8c: number;
  primaryJoints: ChartJoint[];
  secondaryJoints: ChartJoint[];
  samples: ChartSample[];
  primaryTicks: ChartTick[];
  secondaryTicks: ChartTick[];
  record: NoteRecord;
}

export interface ChartBpmSummary {
  first: number;
  min: number;
  max: number;
  mode: number;
}

export interface ParseChartOptions {
  mirror?: boolean;
  serialBase?: number;
  mode?: number;
  path?: Uint8Array;
  postProcessSteps?: number;
}

export interface ParsedChart {
  header: ChartHeader;
  bpm: ChartBpm[];
  meters: ChartMeter[];
  intervalEvents: ChartIntervalGroup[];
  dcm: ChartIntervalEvent[];
  clocks: ChartClock[];
  clockLines: ChartClock[];
  lines: [ChartLine[], ChartLine[], ChartLine[], ChartLine[]];
  notes: ChartNote[];
  lastNote: ChartPosition | null;
  lastEvent: ChartPosition | null;
  bpmSummary: ChartBpmSummary | null;
  statistics: Int32Array;
  diagnostics: ScoreDiagnostic[];
  nextSequence: number;
  serial: number;
  score: ScoreLoadResult;
}
