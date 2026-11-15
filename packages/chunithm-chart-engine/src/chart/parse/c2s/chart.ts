import type {
  ChartBpm,
  ChartBpmSummary,
  ChartClock,
  ChartHeader,
  ChartIntervalEvent,
  ChartJoint,
  ChartLine,
  ChartMeter,
  ChartNote,
  ChartPosition,
  ChartSample,
  ChartTick,
  ParseChartOptions,
  ParsedChart,
} from "./types";
import { commandId } from "./commands";
import { readDocumentLines } from "./document";
import { HEADER_VERSION_OFFSETS, headerField, headerVersionNumbers } from "./header";
import { J40, J50, SAMPLES, T148, T158, f32, i32, realWidth, u32 } from "./score/common";
import { loadScore, POST_PROCESS_STEP_COUNT } from "./score/loader";
import { POST_PROCESS_STEP_INDEX } from "./score/postProcess";
import type { NoteRecord } from "./score/storage";
import { K, LAYOUT, PK, STATS } from "./score/tables";

export function normalizeLineEndings(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let n = 0;
  for (let i = 0; i < bytes.length; i++)
    if (!(bytes[i] === 13 && bytes[i + 1] === 10)) out[n++] = bytes[i];
  return out.slice(0, n);
}

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

function fieldOffset(name: string, column: number): number {
  const id = commandId(ascii(name));
  const field = headerField(id, column);
  if (!field) throw new Error(`头部命令 ${name} 第 ${column} 列没有写入字段`);
  return field.offset;
}

const HEADER = {
  music: fieldOffset("MUSIC", 1),
  sequenceId: fieldOffset("SEQUENCEID", 1),
  difficult: fieldOffset("DIFFICULT", 1),
  level: fieldOffset("LEVEL", 1),
  creator: fieldOffset("CREATOR", 1),
  bpmDef: [1, 2, 3, 4].map((c) => fieldOffset("BPM_DEF", c)),
  metDef: [1, 2].map((c) => fieldOffset("MET_DEF", c)),
  clkDef: fieldOffset("CLK_DEF", 1),
  progJudgeBpm: fieldOffset("PROGJUDGE_BPM", 1),
  progJudgeAer: fieldOffset("PROGJUDGE_AER", 1),
  tutorial: fieldOffset("TUTORIAL", 1),
};

const pos = (v: DataView, o: number): ChartPosition => ({
  measure: f32(v, o),
  beat: f32(v, o + 4),
  timeMs: f32(v, o + 8),
});

function readHeader(view: DataView, strings: Map<number, Uint8Array>): ChartHeader {
  const str = (offset: number) => strings.get(offset)?.slice() ?? new Uint8Array();
  return {
    version: HEADER_VERSION_OFFSETS.map(str),
    versionNumbers: HEADER_VERSION_OFFSETS.map((_, i) => headerVersionNumbers(view, i)),
    music: i32(view, HEADER.music),
    sequenceId: i32(view, HEADER.sequenceId),
    difficult: str(HEADER.difficult),
    level: f32(view, HEADER.level),
    creator: str(HEADER.creator),
    bpmDef: HEADER.bpmDef.map((o) => f32(view, o)),
    metDef: HEADER.metDef.map((o) => i32(view, o)),
    resolution: u32(view, K.resolutionOffset),
    clkDef: i32(view, HEADER.clkDef),
    progJudgeBpm: f32(view, HEADER.progJudgeBpm),
    progJudgeAer: f32(view, HEADER.progJudgeAer),
    tutorial: view.getUint8(HEADER.tutorial) !== 0,
  };
}

const joint = (j: DataView): ChartJoint => ({
  position: pos(j, 0),
  serial: u32(j, 0x0c),
  lane: i32(j, 0x10),
  flag: j.getUint8(0x14),
  height: i32(j, 0x18),
  height2: i32(j, 0x1c),
  widthIndex: i32(j, 0x20),
  width: realWidth(i32(j, 0x20)),
});

const sample = (s: DataView): ChartSample => ({
  position: pos(s, 0),
  lane: f32(s, 0x10),
  height: f32(s, 0x14),
  width: f32(s, 0x18),
  flag: s.getUint8(0x1c),
});

const tick = (t: DataView): ChartTick => ({
  position: pos(t, 0),
  kind: i32(t, 0x10),
  judged: t.getUint8(0x14) !== 0,
  center: f32(t, 0x18),
  height: f32(t, 0x1c),
});

export function readScoreNote(n: NoteRecord): ChartNote {
  const v = n.view;
  return {
    type: i32(v, 0x10),
    secondaryType: i32(v, 0x14),
    start: pos(v, 0x00),
    end: pos(v, 0x30),
    airEnd: pos(v, 0x18),
    lane: i32(v, 0x28),
    widthIndex: i32(v, 0x2c),
    width: realWidth(i32(v, 0x2c)),
    sequence: u32(v, 0x78),
    counter7c: i32(v, 0x7c),
    counter80: i32(v, 0x80),
    counter84: i32(v, 0x84),
    chrDirection: i32(v, 0x88),
    airDirection: i32(v, 0x90),
    color: i32(v, 0x94),
    slideGroup: i32(v, 0x98),
    height: i32(v, 0x9c),
    height2: i32(v, 0xa0),
    sampleStep: i32(v, 0x6c),
    slaAtStart: i32(v, 0x70),
    slaAtEnd: i32(v, 0x74),
    flag24: v.getUint8(0x24),
    flag8c: v.getUint8(0x8c),
    primaryJoints: n.vectors[J40].items.map(joint),
    secondaryJoints: n.vectors[J50].items.map(joint),
    samples: n.vectors[SAMPLES].items.map(sample),
    primaryTicks: n.vectors[T148].items.map(tick),
    secondaryTicks: n.vectors[T158].items.map(tick),
    record: n,
  };
}

const interval = (e: DataView): ChartIntervalEvent => ({
  start: pos(e, 0),
  end: pos(e, 0x14),
  sequence: u32(e, 0x0c),
  value: f32(e, 0x10),
});

const clock = (c: DataView): ChartClock => ({ position: pos(c, 0), sequence: u32(c, 0x0c) });

const line = (l: DataView): ChartLine => ({
  position: pos(l, 0),
  index: i32(l, 0x10),
  subIndex: i32(l, 0x14),
});

export function parseChart(bytes: Uint8Array, options: ParseChartOptions = {}): ParsedChart {
  const steps = options.postProcessSteps ?? POST_PROCESS_STEP_COUNT;
  const { records } = readDocumentLines(normalizeLineEndings(bytes));
  const score = loadScore(records, {
    mode: options.mode ?? 0,
    mirror: options.mirror ?? false,
    serialBase: options.serialBase ?? 0,
    path: options.path ?? new Uint8Array(),
    postCalls: steps,
  });
  const { run } = score;
  const o = run.owner;
  const done = (step: number) => score.postProcessed > step;
  const bpmSize = LAYOUT.bpm.size;
  const bpm: ChartBpm[] = [];
  for (let off = 0; off < run.bpm.byteLength; off += bpmSize)
    bpm.push({
      position: pos(run.bpm, off),
      sequence: u32(run.bpm, off + 0x0c),
      bpm: f32(run.bpm, off + 0x10),
    });
  const [first, min, max, mode] = [
    PK.bpmStatOffsets[3],
    PK.bpmMinOffset,
    PK.bpmMaxOffset,
    PK.bpmModeOffset,
  ];
  const bpmSummary: ChartBpmSummary | null =
    done(POST_PROCESS_STEP_INDEX.bpmStatistics) && bpm.length
      ? { first: f32(o, first), min: f32(o, min), max: f32(o, max), mode: f32(o, mode) }
      : null;
  const hasLast = done(POST_PROCESS_STEP_INDEX.findLastPositions);
  return {
    header: readHeader(score.header, run.strings),
    bpm,
    meters: run.timeline.met.items.map((m) => ({
      position: pos(m, 0),
      sequence: u32(m, 0x0c),
      lower: u32(m, 0x10),
      upper: u32(m, 0x14),
    })) satisfies ChartMeter[],
    intervalEvents: [...run.timeline.map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([key, vec]) => ({ key, events: vec.items.map(interval) })),
    dcm: run.timeline.dcm.items.map(interval),
    clocks: run.timeline.clk.items.map(clock),
    clockLines: run.clockLines.items.map(clock),
    lines: [
      run.lines[0].items.map(line),
      run.lines[1].items.map(line),
      run.lines[2].items.map(line),
      run.lines[3].items.map(line),
    ],
    notes: run.notes.items.map(readScoreNote),
    lastNote: hasLast ? pos(o, PK.lastNoteOffset) : null,
    lastEvent: hasLast ? pos(o, PK.lastEventOffset) : null,
    bpmSummary,
    statistics: Int32Array.from({ length: (STATS.clear.end - STATS.clear.begin) / 4 }, (_, i) =>
      i32(o, STATS.clear.begin + 4 * i),
    ),
    diagnostics: run.diagnostics,
    nextSequence: score.nextSequence,
    serial: score.serial,
    score,
  };
}
