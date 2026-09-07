import type {
  ButtonPosition,
  Chart,
  HoldEndNote,
  HoldStartNote,
  Note,
  SlideNote,
  SlidePathType,
  SlideSegment,
  TapNote,
  TouchHoldEndNote,
  TouchHoldStartNote,
  TouchNote,
  TouchPosition,
} from "@lxns-network/maimai-chart-engine";
import type { RendererSettings } from "./renderBenchmark";

export const STRESS_CHART_VERSION = 1;
export const STRESS_BENCHMARK_ID = `lxns-chart-render-v${STRESS_CHART_VERSION}`;

const BPM = 240;
const BEAT_MS = 60_000 / BPM;
const BEATS_PER_MEASURE = 4;
const LEAD_IN_BEATS = BEATS_PER_MEASURE;
const ACTIVE_MEASURES = 20;
const ACTIVE_BEATS = ACTIVE_MEASURES * BEATS_PER_MEASURE;
const SLOT_BEATS = 0.25;
const HOLD_BEATS = 2;
const SLIDE_DELAY_MS = BEAT_MS;
const SLIDE_DURATION_MS = BEAT_MS * 2;

const BUTTONS: ButtonPosition[] = [1, 2, 3, 4, 5, 6, 7, 8];
const TOUCHES: TouchPosition[] = [
  "A1",
  "B2",
  "C1",
  "D4",
  "E5",
  "A6",
  "B7",
  "C2",
  "D8",
  "E1",
  "A3",
  "B4",
  "D6",
  "E7",
];
const SLIDE_TYPES: SlidePathType[] = [
  "-",
  ">",
  "<",
  "^",
  "v",
  "p",
  "pp",
  "q",
  "qq",
  "s",
  "z",
  "w",
  "V",
];

export const STRESS_RENDERER_SETTINGS: RendererSettings = {
  hiSpeed: 6,
  alwaysKeepHiSpeed: false,
  slideDelay: 0,
  slideRotation: true,
  mirrorMode: "none",
  judgmentLineDesign: "simple",
  pinkSlideStart: true,
  highlightExNotes: true,
  normalColorBreakSlide: false,
  showFireworks: true,
  showHitEffect: true,
};

export const STRESS_BENCHMARK_PRESET = {
  startMs: LEAD_IN_BEATS * BEAT_MS,
  endMs: (LEAD_IN_BEATS + ACTIVE_BEATS) * BEAT_MS,
  fps: 120,
  size: 1440,
  dpr: 1.3,
  passes: 5,
  warmupFrames: 120,
  warmupPasses: 1,
  syncGpu: true,
  /** 整轮只在末尾读回一次，避免重复 getImageData 触发 Chrome 切到软件 Canvas。 */
  throughputChunkFrames: 2401,
} as const;

export interface StressChartFixture {
  id: string;
  version: number;
  hash: string;
  chart: Chart;
}

function buttonAt(index: number): ButtonPosition {
  return BUTTONS[((index % BUTTONS.length) + BUTTONS.length) % BUTTONS.length];
}

function notePosition(timing: number): Pick<Note, "measure" | "positionInMeasure"> {
  return {
    measure: Math.floor(timing / BEATS_PER_MEASURE),
    positionInMeasure: Math.floor(
      (((timing % BEATS_PER_MEASURE) + BEATS_PER_MEASURE) % BEATS_PER_MEASURE) * 128,
    ),
  };
}

function noteBase(timing: number) {
  return {
    timing,
    timingMs: timing * BEAT_MS,
    ...notePosition(timing),
    scale: 1,
    bpm: BPM,
  };
}

function makeTap(position: ButtonPosition, timing: number, slot: number): TapNote {
  const variant = (slot + position) % 8;
  return {
    ...noteBase(timing),
    position,
    type: variant === 0 ? "break" : variant === 4 ? "tap" : "simultaneous",
    isEx: variant === 1 || variant === 5,
    isStar: variant === 2 || variant === 6,
    isSpinningStar: variant === 6,
  };
}

function makeHold(
  position: ButtonPosition,
  timing: number,
  slot: number,
): [HoldStartNote, HoldEndNote] {
  const isBreakHold = slot % 8 === 0;
  const isEx = slot % 8 === 4;
  const endTiming = timing + HOLD_BEATS;
  return [
    {
      ...noteBase(timing),
      position,
      type: "hold-start-simultaneous",
      duration: HOLD_BEATS,
      isHoldStart: true,
      isBreakHold,
      isEx,
    },
    {
      ...noteBase(endTiming),
      position,
      type: "hold-end-simultaneous",
      holdStartTiming: timing,
      isHoldEnd: true,
      isBreakHold,
      isEx,
    },
  ];
}

function makeSlideSegment(
  type: SlidePathType,
  startPos: ButtonPosition,
  offset: number,
): SlideSegment {
  const endPos = buttonAt(startPos - 1 + offset);
  if (type !== "V") return { type, startPos, endPos };
  return { type, startPos, endPos, midPos: buttonAt(startPos - 1 + 2) };
}

function makeSlide(
  position: ButtonPosition,
  timing: number,
  slot: number,
  lane: number,
): SlideNote {
  const pathIndex = slot * 4 + lane;
  const isHeadless = pathIndex % 5 === 0;
  const paths = [0, 1, 2].map((pathOffset) => [
    makeSlideSegment(
      SLIDE_TYPES[(pathIndex + pathOffset) % SLIDE_TYPES.length],
      position,
      3 + pathOffset,
    ),
  ]);
  return {
    ...noteBase(timing),
    position,
    type: "slide",
    isHeadless,
    headlessMode: isHeadless ? (pathIndex % 10 === 0 ? "pop" : "fade") : undefined,
    hasTapHead: pathIndex % 5 === 1,
    isStartBreak: pathIndex % 7 === 0,
    allSlideBreaks: paths.map((_, index) => (pathIndex + index) % 6 === 0),
    isEx: pathIndex % 9 === 0,
    duration: HOLD_BEATS,
    durationMs: SLIDE_DURATION_MS,
    delayMs: SLIDE_DELAY_MS,
    slideSegments: paths[0],
    allSlideSegments: paths,
    allDurations: paths.map(() => HOLD_BEATS),
    allDurationMs: paths.map(() => SLIDE_DURATION_MS),
    allDelayMs: paths.map(() => SLIDE_DELAY_MS),
    allCustomLengths: paths.map(() => null),
    isSplitSlide: true,
    customLength: null,
  };
}

function makeTouch(position: TouchPosition, timing: number, slot: number): TouchNote {
  return {
    ...noteBase(timing),
    position,
    type: "touch",
    hasFirework: slot % 2 === 0,
  };
}

function makeTouchHold(
  position: TouchPosition,
  timing: number,
): [TouchHoldStartNote, TouchHoldEndNote] {
  const endTiming = timing + HOLD_BEATS;
  return [
    {
      ...noteBase(timing),
      position,
      type: "touch-hold-start",
      duration: HOLD_BEATS,
      durationMs: HOLD_BEATS * BEAT_MS,
      hasFirework: true,
      isHoldStart: true,
    },
    {
      ...noteBase(endTiming),
      position,
      type: "touch-hold-end",
      holdStartTiming: timing,
      hasFirework: true,
      isHoldEnd: true,
    },
  ];
}

function buildStressChart(): Chart {
  const notes: Note[] = [];
  const slots = ACTIVE_BEATS / SLOT_BEATS;

  for (let slot = 0; slot < slots; slot++) {
    const timing = LEAD_IN_BEATS + slot * SLOT_BEATS;

    for (const position of BUTTONS) notes.push(makeTap(position, timing, slot));

    for (let lane = 0; lane < 4; lane++) {
      notes.push(makeTouch(TOUCHES[(slot * 4 + lane) % TOUCHES.length], timing, slot + lane));
    }

    if (slot % 2 === 0) {
      for (let lane = 0; lane < 4; lane++) {
        notes.push(makeSlide(buttonAt(slot + lane * 2), timing, slot, lane));
      }
    }

    if (slot % 4 === 0) {
      for (let lane = 0; lane < 4; lane++) {
        notes.push(...makeHold(buttonAt(slot + lane * 2 + 1), timing, slot));
      }
      notes.push(
        ...makeTouchHold(TOUCHES[(slot + 5) % TOUCHES.length], timing),
        ...makeTouchHold(TOUCHES[(slot + 11) % TOUCHES.length], timing),
      );
    }
  }

  notes.sort((a, b) => a.timingMs - b.timingMs);
  return {
    title: `LXNS Renderer Stress v${STRESS_CHART_VERSION}`,
    artist: "LXNS",
    designer: "deterministic benchmark",
    bpm: BPM,
    level: { lv_6: "BENCH" },
    designers: { des_6: "deterministic benchmark" },
    difficulty: 6,
    availableDifficulties: { 6: true },
    measures: ACTIVE_MEASURES + 2,
    notes,
    bpmEvents: [{ timing: 0, bpm: BPM }],
    divisorEvents: [{ timing: 0, divisor: 16 }],
  };
}

function hashChart(chart: Chart): string {
  const payload = JSON.stringify({
    version: STRESS_CHART_VERSION,
    bpm: chart.bpm,
    measures: chart.measures,
    notes: chart.notes,
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 每次返回全新谱面，避免上一次渲染写入的滑条几何缓存影响预热阶段。 */
export function createStressChartFixture(): StressChartFixture {
  const chart = buildStressChart();
  return {
    id: STRESS_BENCHMARK_ID,
    version: STRESS_CHART_VERSION,
    hash: hashChart(chart),
    chart,
  };
}
