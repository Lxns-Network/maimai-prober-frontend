import type { BakeEvent } from "../bake/events";
import { REAL_WIDTH } from "../bind/realWidth";
import { stepFrames } from "../lifecycle/autoplayJudge";
import { PHASE, type JudgeEmission, type ObjectRun } from "../lifecycle/emissions";
import { AIR_HOLD_ELEMENT_Y } from "../../notes/airHoldParts";
import { effectLane, heightY } from "../../notes/ladderElements";
import type { NoteScore } from "../../notes/score";
import { lanePosition } from "../../notes/space";
import { EFFECT_GROUP, PLAYER_ORDER } from "../../effects/players";
export { EFFECT_GROUP, PLAYER_ORDER } from "../../effects/players";

const STEP_HZ = 120;
const f = Math.fround;

/** Live instances each group holds before the oldest is evicted, and its admission interval in frames. */
export const GROUP_CAPACITY: readonly number[] = [24, 24, 24, 32, 16, 16, 16, 4, 48, 4];
export const GROUP_INTERVAL_FRAMES: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 5, 0, 5];
const intervalMs = GROUP_INTERVAL_FRAMES.map((frames) =>
  Math.trunc(f(f((1000 / STEP_HZ) * frames) + 0.5)),
);

/** One group's emission count resets each update; its cooldown spans updates. */
function createEffectAdmission() {
  const emitted = new Uint8Array(GROUP_CAPACITY.length);
  const nextTime = new Float64Array(GROUP_CAPACITY.length);
  let previousStep = -1;
  return (group: number, step: number) => {
    if (step !== previousStep) {
      emitted.fill(0);
      previousStep = step;
    }
    if (emitted[group] >= GROUP_CAPACITY[group]) return false;
    if (intervalMs[group]) {
      const now = Math.floor((step * 1000) / STEP_HZ);
      if (now < nextTime[group]) return false;
      nextTime[group] = now + intervalMs[group];
    }
    emitted[group]++;
    return true;
  };
}

/** Why an instance ended: its life ran out, its group made room, or its slide stopped it. */
export const EFFECT_END = Object.freeze({ natural: 0, evicted: 1, stopped: 2 });

/** Life, in frames, of each resource's root node; a negative life never ends on its own. */
export const EFFECT_LIFE_FRAMES: ReadonlyMap<number, number> = new Map<number, number>([
  ...[2, 3, 4, 5, 6, 7, 8, 14, 15, 16, 17, 18, 19, 20, 21].map((id) => [id, 30] as const),
  [22, 40],
  ...Array.from({ length: 20 }, (_, i) => [23 + i, 60] as const),
  [44, -1],
  [45, 45],
  [48, 25],
  [60, 45],
]);

type Draw = readonly [dt: number, effect: number, particle: number];
const repeat = (draw: Draw, count: number): Draw[] => Array.from({ length: count }, () => draw);

const AIR_BOMB: Draw[] = [
  [1, 0, 3],
  [1, 0, 3],
  [1, 4, 0],
  [1, 4, 0],
  [7, 0, 3],
];
const SECTION: Draw[] = [
  [0, 4, 0],
  [0, 4, 0],
];

/**
 * Random draws each resource's instance makes, as `[steps after the instance starts, effect-stream
 * draws, particle-stream draws]`, one entry per node birth in birth order. A node birth is the
 * constructor of a node the instance tree grows: a primitive node draws four values for its centre
 * (the ladder burst's nodes draw more for random matrices and an angle), a particle node draws three
 * of the particle stream; a node is born once the instance age, half a frame per step, reaches its
 * controller start time. Resources 23 and 45 grow only particle nodes; 29-42 grow two particle nodes and two
 * primitive nodes one step in and a third particle node seven steps in; 44 grows its three
 * primitive nodes at its first active step.
 */
export const EFFECT_DRAWS: ReadonlyMap<number, readonly Draw[]> = new Map<number, readonly Draw[]>([
  ...[2, 3, 4, 5, 6, 7, 8].map((id) => [id, SECTION] as const),
  [14, repeat([1, 8, 0], 6)],
  [15, repeat([1, 8, 0], 6)],
  [16, [[1, 8, 0]]],
  [17, repeat([1, 8, 0], 3)],
  [18, repeat([1, 8, 0], 3)],
  [19, repeat([1, 8, 0], 6)],
  [20, repeat([1, 8, 0], 6)],
  [21, repeat([1, 8, 0], 6)],
  [22, [...repeat([0, 4, 0], 6), ...repeat([1, 4, 0], 6)]],
  [23, [[1, 0, 3]]],
  [24, [[1, 4, 0]]],
  [25, [[1, 4, 0]]],
  [26, repeat([1, 4, 0], 2)],
  [27, []],
  [28, [[1, 4, 0]]],
  ...Array.from({ length: 14 }, (_, i) => [29 + i, AIR_BOMB] as const),
  [
    44,
    [
      [0, 4, 0],
      [0, 5, 0],
      [0, 4, 0],
    ],
  ],
  [45, repeat([1, 0, 3], 5)],
  [48, [[0, 4, 0]]],
  [
    60,
    [
      [1, 21, 0],
      [1, 21, 0],
      [1, 4, 0],
      [1, 0, 3],
      [1, 0, 3],
      [1, 5, 0],
    ],
  ],
]);

const PLAYER = new Map(PLAYER_ORDER.map((id, index) => [id, index]));

/** Widest note width each burst width bucket serves. */
export const WIDTH_BUCKETS: readonly number[] = [1, 2, 3, 4, 6, 8, 16];
const bucketOf = (width: number) => WIDTH_BUCKETS.findIndex((limit) => width > 0 && width <= limit);

const BURST_ROWS = 7;
/** Burst resource per width bucket, then reaction and text resource, of each result type. */
export const RESULT_EFFECTS = (() => {
  const burst = new Uint8Array(19 * BURST_ROWS);
  const reaction = new Uint8Array(19);
  const text = new Uint8Array(19);
  const row = (types: number[], ids: number | number[], react: number, label: number) => {
    for (const type of types) {
      for (let b = 0; b < BURST_ROWS; b++)
        burst[type * BURST_ROWS + b] = typeof ids === "number" ? ids : ids[b];
      reaction[type] = react;
      text[type] = label;
    }
  };
  const run = (first: number) => Array.from({ length: BURST_ROWS }, (_, i) => first + i);
  row([0, 2, 3, 4, 5, 6], 23, 24, 25);
  row([1], 0, 24, 25);
  row([7, 9], run(29), 0, 26);
  row([8], run(36), 0, 26);
  row([10, 16], 23, 0, 25);
  row([11], 0, 0, 25);
  row([12], 23, 0, 26);
  row([13], 45, 0, 26);
  row([14, 15], 27, 28, 25);
  row([17], 23, 24, 25);
  row([18], 60, 0, 25);
  return { burst, reaction, text };
})();

/** Resource of an AIR HOLD section effect by width colour. */
export const SECTION_RESOURCE: readonly number[] = [8, 7, 6, 5, 4, 4, 3, 3, 2, 2, 2, 2, 2, 2, 2, 2];
const BEAM_RESOURCE = 48;
const SLIDE_KEEP_RESOURCE = 44;
const CHARA_LOCAL_RESOURCE = 22;
/** Native directional CHR selection: UP, DW, CE, RC, LC, RS, LS, BS. */
const CHARA_GLOBAL_RESOURCES = [14, 15, 16, 18, 17, 20, 19, 21] as const;
/** Lanes a chara effect's exclusion window spans by width colour, and the frames it holds. */
export const CHARA_WINDOW: readonly number[] = [2, 4, 6, 8, 2, 12, 2, 16, 2, 2, 2, 2, 2, 2, 2, 32];
export const CHARA_LOCAL_FRAMES = 1;
export const CHARA_GLOBAL_FRAMES = 7;
const CHARA_LANES = 32;
const AIR_UP_DIRECTIONS = 3;
const NO_DISPLAY = -1;
const BEAM_ANIMATION = 400;
const SLIDE_KEEP_ANIMATION = 1000;
const FLAG_MIRROR = 1;
const DEPTH = -65;
const BEAM_Y = -15.574000358581543;
const HEIGHT_STEP = 0.10000000149011612;

/** Depth offset of each result kind's text label. */
const LABEL_Z: readonly number[] = [
  0, 0, 0, 0, 0, 0, 0, -30, -30, -40, 0, -40, -40, 0, 0, 0, 0, -40, 0,
];

const widthOf = (index: number) =>
  index < 0 || index >= REAL_WIDTH.length ? 0 : REAL_WIDTH[index];
const colourOf = (width: number) => Math.max(0, Math.min(width, 16) - 1);

/** The effect row of a bake event list. */
export type EffectRow = Extract<BakeEvent, { kind: "effect" }>;

/** Per-instance creation parameters and fate, one entry per effect row in row order. */
export interface EffectInstances {
  /** Stable, increasing creation identities for live input; retained rows are immutable. */
  ids?: Uint32Array;
  resource: Uint16Array;
  group: Uint8Array;
  /** Step the instance is created at. */
  created: Int32Array;
  /** First step the instance is shown at; -1 for a slide-keep whose slide is never judged. */
  start: Int32Array;
  /** Step the instance is removed at; it is not updated at that step. May lie past the grid. */
  end: Int32Array;
  /** One of `EFFECT_END`. */
  endReason: Uint8Array;
  displayState: Int8Array;
  animation: Uint16Array;
  /** Bit 0: mirrored. */
  flags: Uint8Array;
  scaleX: Float32Array;
  scaleY: Float32Array;
  scaleZ: Float32Array;
  /**
   * First step the instance's tree is not hidden at. An instance is hidden from the step after it
   * is created until then; a slide's effect is also given display state 0 at that step.
   */
  reveal: Int32Array;
  /** Placement at creation. */
  posX: Float32Array;
  posY: Float32Array;
  posZ: Float32Array;
  kind: Uint8Array;
}

/**
 * Random stream state after each step that draws, in step order: `steps[i]` is a grid step and
 * `low[i]`, `high[i]` (effect stream) and `crt[i]` (particle stream) the states its draws end at.
 * The streams start at `(1, 0)` and `1`.
 */
export interface RandomStreams {
  steps: Int32Array;
  low: Uint32Array;
  high: Uint32Array;
  crt: Uint32Array;
}

/**
 * Starting state of every node birth, in the order the births happen: `instance[i]` indexes the
 * effect rows, `entry[i]` the instance resource's `EFFECT_DRAWS` entry, `step[i]` the grid step,
 * and `low[i]`, `high[i]`, `crt[i]` the stream states just before the birth's draws.
 */
export interface Consumption {
  instance: Uint32Array;
  entry: Uint8Array;
  step: Int32Array;
  low: Uint32Array;
  high: Uint32Array;
  crt: Uint32Array;
}

/**
 * Position changes after creation, sorted by step and then instance: instance `instance[i]` is
 * placed at `(x[i], y[i], z[i])` from the start of grid step `step[i]` on.
 */
export interface EffectMoves {
  instance: Uint32Array;
  step: Int32Array;
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
}

export interface EffectSweep {
  rows: EffectRow[];
  instances: EffectInstances;
  moves: EffectMoves;
  streams: RandomStreams;
  consumption: Consumption;
}

export interface EffectInput {
  score: NoteScore;
  runs: readonly ObjectRun[];
  /** The chart's judgment and band events, as assembled from the runs. */
  events: readonly BakeEvent[];
  /** Grid steps the chart runs for. */
  steps: number;
}

interface PushExtra {
  displayState?: number;
  animation?: number;
  flags?: number;
  scaleX?: number;
  kind?: number;
  x?: number;
  y?: number;
  z?: number;
}

/** Requests in the order the notes make them, as parallel columns. */
class Requests {
  length = 0;
  step = new Int32Array(1024);
  resource = new Uint16Array(1024);
  group = new Uint8Array(1024);
  note = new Uint32Array(1024);
  lane = new Int32Array(1024);
  width = new Uint8Array(1024);
  displayState = new Int8Array(1024);
  animation = new Uint16Array(1024);
  flags = new Uint8Array(1024);
  scaleX = new Float32Array(1024);
  kind = new Uint8Array(1024);
  posX = new Float32Array(1024);
  posY = new Float32Array(1024);
  posZ = new Float32Array(1024);

  push(
    step: number,
    group: number,
    resource: number,
    note: number,
    lane: number,
    width: number,
    extra: PushExtra = {},
  ): void {
    if (this.length === this.step.length) this.grow();
    const at = this.length++;
    this.step[at] = step;
    this.group[at] = group;
    this.resource[at] = resource;
    this.note[at] = note;
    this.lane[at] = lane;
    this.width[at] = width;
    this.displayState[at] = extra.displayState ?? 0;
    this.animation[at] = extra.animation ?? 100;
    this.flags[at] = extra.flags ?? 0;
    this.scaleX[at] = extra.scaleX ?? 1;
    this.kind[at] = extra.kind ?? 255;
    this.posX[at] = extra.x ?? 0;
    this.posY[at] = extra.y ?? 0;
    this.posZ[at] = extra.z ?? DEPTH;
  }

  private grow(): void {
    const size = this.step.length * 2;
    const widen = <T extends { set(array: ArrayLike<number>): void }>(
      array: T,
      make: (n: number) => T,
    ): T => {
      const next = make(size);
      next.set(array as unknown as ArrayLike<number>);
      return next;
    };
    this.step = widen(this.step, (n) => new Int32Array(n));
    this.resource = widen(this.resource, (n) => new Uint16Array(n));
    this.group = widen(this.group, (n) => new Uint8Array(n));
    this.note = widen(this.note, (n) => new Uint32Array(n));
    this.lane = widen(this.lane, (n) => new Int32Array(n));
    this.width = widen(this.width, (n) => new Uint8Array(n));
    this.displayState = widen(this.displayState, (n) => new Int8Array(n));
    this.animation = widen(this.animation, (n) => new Uint16Array(n));
    this.flags = widen(this.flags, (n) => new Uint8Array(n));
    this.scaleX = widen(this.scaleX, (n) => new Float32Array(n));
    this.kind = widen(this.kind, (n) => new Uint8Array(n));
    this.posX = widen(this.posX, (n) => new Float32Array(n));
    this.posY = widen(this.posY, (n) => new Float32Array(n));
    this.posZ = widen(this.posZ, (n) => new Float32Array(n));
  }
}

interface Item {
  step: number;
  phase: number;
  order: number;
  seq: number;
  run: ObjectRun;
  judge: JudgeEmission | null;
  /** Index of the tick or element this judgment belongs to, where it has one. */
  part: number;
  /** Ordinal among the object's tick judgments, and among its element judgments. */
  tick: number;
  element: number;
}

/** Chara effects are admitted per half lane and, chart-wide, once per window. */
function charaGate() {
  const deadlines = new Float32Array(CHARA_LANES);
  let global = 0;
  return (lane: number, width: number, now: number) => {
    let local = false;
    if (lane >= 0 && lane + width <= 16) {
      const half = Math.trunc(CHARA_WINDOW[width - 1] / 2);
      const low = Math.max(0, Math.min(CHARA_LANES - 1, 2 * lane + width - half));
      const high = Math.max(0, Math.min(CHARA_LANES - 1, 2 * lane - 1 + width + half));
      local = true;
      for (let at = low; at < high; at++) if (deadlines[at] > now) local = false;
      if (local) for (let at = low; at <= high; at++) deadlines[at] = f(now + CHARA_LOCAL_FRAMES);
    }
    const open = global <= now;
    if (open) global = f(now + CHARA_GLOBAL_FRAMES);
    return { local, global: open };
  };
}

const scoringRows = new WeakMap<readonly DataView[], DataView[]>();
function flagged(rows: readonly DataView[] | undefined) {
  if (!rows) return [];
  let selected = scoringRows.get(rows);
  if (!selected) {
    selected = rows.filter((row) => row.getUint8(0x14) !== 0);
    scoringRows.set(rows, selected);
  }
  return selected;
}

/** Every effect request the notes make, in order. */
function collectRequests(input: EffectInput): Requests {
  const { score, runs, steps } = input;
  const requests = new Requests();
  const items: Item[] = [];
  for (const run of runs) {
    const { className, spawn, order } = run.object;
    if (spawn < steps && (className === "SlideNote" || className === "FlickNote"))
      items.push({
        step: spawn,
        phase: PHASE.spawn,
        order,
        seq: 0,
        run,
        judge: null,
        part: 0,
        tick: 0,
        element: 0,
      });
    let part = 0;
    let tick = 0;
    let element = 0;
    run.judges.forEach((judge, seq) => {
      if (judge.step >= steps) return;
      items.push({
        step: judge.step,
        phase: judge.phase,
        order,
        seq,
        run,
        judge,
        part,
        tick,
        element,
      });
      if (judge.judgePhase > 0 || judge.element) part++;
      if (judge.element) element++;
      else if (judge.judgePhase > 0) tick++;
    });
  }
  items.sort((a, b) => a.step - b.step || a.phase - b.phase || a.order - b.order || a.seq - b.seq);

  const gate = charaGate();
  let toggle = 0;
  for (const item of items) {
    const { step, run, judge } = item;
    const { className, record: index } = run.object;
    const record = score.records[index];
    const type = record.getInt32(0x10, true);
    const lane = record.getInt32(0x28, true);
    const width = widthOf(record.getInt32(0x2c, true));
    if (!judge) {
      if (className === "FlickNote") toggle = 1;
      else {
        const colour = colourOf(width);
        requests.push(step, EFFECT_GROUP.slideKeep, SLIDE_KEEP_RESOURCE, index, 0, colour + 1, {
          displayState: 1,
          animation: SLIDE_KEEP_ANIMATION,
          x: lanePosition(lane, width),
        });
      }
      continue;
    }
    const result = (kind: number, at: number, span: number, x = lanePosition(at, span), y = 0) => {
      const long = kind >= 2 && kind <= 6;
      const mirror = kind === 15 ? FLAG_MIRROR : 0;
      requests.push(step, EFFECT_GROUP.text, RESULT_EFFECTS.text[kind], index, at, span, {
        kind,
        x,
        y: kind === 12 || kind === 13 ? 0 : y,
        z: f(DEPTH + LABEL_Z[kind]),
      });
      const bucket = bucketOf(span);
      const burst = bucket < 0 ? 0 : RESULT_EFFECTS.burst[kind * BURST_ROWS + bucket];
      if (burst)
        requests.push(step, EFFECT_GROUP.burst, burst, index, at, span, {
          flags: mirror,
          scaleX: kind >= 7 && kind <= 9 ? f(f(span) / f(WIDTH_BUCKETS[bucket])) : 1,
          kind,
          x,
          y,
        });
      if (!long && RESULT_EFFECTS.reaction[kind])
        requests.push(step, EFFECT_GROUP.reaction, RESULT_EFFECTS.reaction[kind], index, at, span, {
          flags: mirror,
          kind,
          x,
          y,
        });
    };
    const chara = (at: number, span: number) => {
      const resource = CHARA_GLOBAL_RESOURCES[record.getInt32(0x88, true)];
      if (resource === undefined) return;
      const { local, global } = gate(at, span, stepFrames(step));
      if (local)
        requests.push(step, EFFECT_GROUP.charaLocal, CHARA_LOCAL_RESOURCE, index, at, span, {
          displayState: 1,
          x: lanePosition(at, span),
        });
      if (global) requests.push(step, EFFECT_GROUP.charaGlobal, resource, index, 0, 0, { z: 0 });
    };
    const section = (colour: number, x: number, y: number) => {
      requests.push(step, EFFECT_GROUP.section, SECTION_RESOURCE[colour], index, 0, colour + 1, {
        displayState: NO_DISPLAY,
        x,
        y,
      });
      requests.push(step, EFFECT_GROUP.beam, BEAM_RESOURCE, index, 0, 0, {
        displayState: NO_DISPLAY,
        animation: BEAM_ANIMATION,
        x,
        y: BEAM_Y,
      });
    };
    const air = { lane, width };
    if (type === 2 && className.startsWith("Air")) {
      const joints = score.slideJoints?.get(index) ?? [];
      const last = joints[joints.length - 1];
      air.lane = last.getInt32(0x10, true);
      air.width = widthOf(last.getInt32(0x20, true));
    }
    const extended = type > 0 && ((type <= 2 && record.getUint8(0x8c) !== 0) || type === 4);
    switch (className) {
      case "TapNote":
        result(0, lane, width);
        break;
      case "CharaTapNote":
        result(1, lane, width);
        chara(lane, width);
        break;
      case "FlickNote": {
        const side = (toggle & 255) !== 0 ? 0 : 1;
        toggle = side;
        result(14 + side, lane, width);
        break;
      }
      case "MineNote":
        result(17, lane, width);
        break;
      case "HoldNote":
        if (judge.judgePhase === 0) {
          result(Number(extended), lane, width);
          if (extended) chara(lane, width);
        } else result(judge.judgePhase === 2 ? 3 : 2, lane, width);
        break;
      case "SlideNote":
        if (judge.judgePhase === 0) {
          result(Number(extended), lane, width);
          if (extended) chara(lane, width);
        } else {
          const tick = flagged(score.ticks?.get(index))[item.part];
          const laneAt = tick.getFloat32(0x18, true);
          result(4, Math.min(15, Math.floor(laneAt) >>> 0), width, effectLane(laneAt));
        }
        break;
      case "AirNote":
        result(record.getInt32(0x90, true) < AIR_UP_DIRECTIONS ? 7 : 8, air.lane, air.width);
        break;
      case "AirHoldNote":
        if (judge.element)
          section(colourOf(air.width), lanePosition(air.lane, air.width), AIR_HOLD_ELEMENT_Y);
        break;
      case "AirSlideNote":
        if (judge.element) {
          const joint = flagged(score.airSlides?.get(index))[item.element];
          const x = lanePosition(
            joint.getInt32(0x10, true),
            f(widthOf(joint.getInt32(0x20, true))),
          );
          const y = heightY(f(f(joint.getInt32(0x18, true)) * HEIGHT_STEP));
          result(judge.judgePhase === 2 ? 13 : 12, air.lane, air.width, x, y);
          section(joint.getInt32(0x20, true), x, y);
        } else if (judge.judgePhase === 0) result(9, air.lane, air.width);
        else {
          const tick = flagged(score.secondaryTicks?.get(index))[item.tick];
          result(11, air.lane, air.width, effectLane(tick.getFloat32(0x18, true)));
        }
        break;
      case "AirLadderNote": {
        const sample = score.ladders?.get(index)?.samples[item.seq];
        if (!sample) result(18, lane, width);
        else {
          const sampleLane = sample.getFloat32(0x10, true);
          const sampleWidth = sample.getFloat32(0x18, true);
          result(
            18,
            lane,
            width,
            effectLane(f(f(sampleWidth * 0.5) + sampleLane)),
            heightY(sample.getFloat32(0x14, true)),
          );
        }
        break;
      }
      default:
        throw new RangeError(`Note class ${className} has no effects`);
    }
  }
  return requests;
}

const modeSteps = (events: readonly BakeEvent[]) => {
  const begun = new Map<number, number>();
  const ended = new Map<number, number>();
  for (const event of events) {
    if (event.kind !== "slide") continue;
    const step = Math.round(event.time * STEP_HZ);
    if (event.mode === 1 && !begun.has(event.note)) begun.set(event.note, step);
    if (event.mode === 3 && !ended.has(event.note)) ended.set(event.note, step);
  }
  return { begun, ended };
};

const ACTIVE_AFTER_BEGIN = 2;
const NEVER = 0x7fffffff;
const SLIDE_HALF = 0.5;
const SLIDE_EPSILON = 0.0010000000474974513;
const SLIDE_FRAMES_PER_MS = 0.05999999865889549;

/** Where a SLIDE's effect stands at a frame time: the lane of its band, projected to effect space. */
function slideKeepPath(score: NoteScore, record: number): (now: number) => number {
  const head = score.records[record];
  const joints = score.slideJoints?.get(record) ?? [];
  const n = joints.length;
  const start = new Float32Array(n);
  const end = new Float32Array(n);
  const from = new Float32Array(n);
  const to = new Float32Array(n);
  let time = f(head.getFloat32(8, true) * SLIDE_FRAMES_PER_MS);
  let lane = head.getInt32(0x28, true);
  let width = head.getInt32(0x2c, true);
  joints.forEach((joint, k) => {
    const nextTime = f(joint.getFloat32(8, true) * SLIDE_FRAMES_PER_MS);
    const nextLane = joint.getInt32(0x10, true);
    const nextWidth = joint.getInt32(0x20, true);
    start[k] = time;
    end[k] = nextTime;
    from[k] = f(f(lane) + f(f(widthOf(width)) * SLIDE_HALF));
    to[k] = f(f(nextLane) + f(f(widthOf(nextWidth)) * SLIDE_HALF));
    time = nextTime;
    lane = nextLane;
    width = nextWidth;
  });
  return (now) => {
    let cur = 0;
    for (let k = 0; k < n; k++) if (now >= start[k] && end[k] > now) cur = k;
    const a = end[cur] - now > 0 ? f(end[cur] - now) : 0;
    const b = now - start[cur] > 0 ? f(now - start[cur]) : 0;
    const sum = f(b + a);
    let centre: number;
    if (SLIDE_EPSILON > Math.abs(sum)) centre = from[cur];
    else centre = f(f(f(from[cur] * a) + f(to[cur] * b)) / sum);
    return effectLane(centre);
  };
}
const KEY_PLAYER = 64;
const KEY_INSTANCE = 1 << 18;
const KEY_ENTRY = 16;

/**
 * Admits the requests into their groups, ends instances as their life runs out, their group makes
 * room or their slide stops, and replays the random draws of every instance that lives to make
 * them. Everything derives from the notes' own runs.
 */
export function effectSweep(input: EffectInput): EffectSweep {
  const { runs, steps } = input;
  const requests = collectRequests(input);
  const { begun, ended } = modeSteps(input.events);
  const removal = new Map<number, number>();
  for (const run of runs)
    if (run.object.className === "SlideNote") removal.set(run.object.record, run.removal);

  const admit = createEffectAdmission();
  const horizon = steps + 400;
  const accepted = new Int32Array(requests.length);
  let count = 0;
  const end = new Int32Array(requests.length);
  const reason = new Uint8Array(requests.length);
  const dead = new Uint8Array(requests.length);
  const releaseHead = new Int32Array(horizon + 1).fill(-1);
  const releaseNext = new Int32Array(requests.length).fill(-1);
  const releaseKind = new Uint8Array(requests.length);
  const queues: number[][] = GROUP_CAPACITY.map(() => []);
  const heads = new Int32Array(GROUP_CAPACITY.length);
  const live = new Int32Array(GROUP_CAPACITY.length);

  const schedule = (instance: number, step: number, kind: number) => {
    if (step > horizon) return;
    releaseKind[instance] = kind;
    releaseNext[instance] = releaseHead[step];
    releaseHead[step] = instance;
  };
  const release = (instance: number, step: number, why: number) => {
    if (dead[instance]) return;
    dead[instance] = 1;
    end[instance] = step;
    reason[instance] = why;
    live[requestsGroup(instance)]--;
  };
  const requestsGroup = (instance: number) => requests.group[accepted[instance]];

  let next = 0;
  for (let step = 0; step <= horizon; step++) {
    for (; next < requests.length && requests.step[next] === step; next++) {
      const group = requests.group[next];
      const capacity = GROUP_CAPACITY[group];
      if (!admit(group, step)) continue;
      const instance = count++;
      accepted[instance] = next;
      if (live[group] >= capacity) {
        const queue = queues[group];
        while (dead[queue[heads[group]]]) heads[group]++;
        release(queue[heads[group]++], step, EFFECT_END.evicted);
      }
      queues[group].push(instance);
      live[group]++;
      const resource = requests.resource[next];
      const life = EFFECT_LIFE_FRAMES.get(resource);
      if (life === undefined) throw new RangeError(`Effect resource ${resource} has no life`);
      if (life >= 0) schedule(instance, step + 2 * life + 1, EFFECT_END.natural);
      else {
        const note = requests.note[next];
        schedule(instance, ended.get(note) ?? removal.get(note) ?? horizon, EFFECT_END.stopped);
      }
    }
    for (let instance = releaseHead[step]; instance !== -1; instance = releaseNext[instance])
      release(instance, step, releaseKind[instance]);
  }
  for (let instance = 0; instance < count; instance++) if (!dead[instance]) end[instance] = horizon;

  const created = new Int32Array(count);
  const start = new Int32Array(count);
  const resource = new Uint16Array(count);
  let capacity = 0;
  for (let instance = 0; instance < count; instance++)
    capacity += EFFECT_DRAWS.get(requests.resource[accepted[instance]])?.length ?? 0;
  const keys = new Float64Array(capacity);
  let planned = 0;
  for (let instance = 0; instance < count; instance++) {
    const at = accepted[instance];
    created[instance] = requests.step[at];
    resource[instance] = requests.resource[at];
    const draws = EFFECT_DRAWS.get(resource[instance]);
    if (!draws) throw new RangeError(`Effect resource ${resource[instance]} has no draws`);
    let base = created[instance];
    if (resource[instance] === SLIDE_KEEP_RESOURCE) {
      const first = begun.get(requests.note[at]);
      base = first === undefined ? -1 : first + ACTIVE_AFTER_BEGIN;
    }
    start[instance] = base;
    if (base < 0) continue;
    const player = PLAYER.get(resource[instance])!;
    for (let entry = 0; entry < draws.length; entry++) {
      const [dt, effect, particle] = draws[entry];
      const step = base + dt;
      if ((!effect && !particle) || step >= steps || end[instance] <= step) continue;
      keys[planned++] =
        ((step * KEY_PLAYER + player) * KEY_INSTANCE + instance) * KEY_ENTRY + entry;
    }
  }
  const plan = keys.subarray(0, planned).sort();

  const reveal = new Int32Array(count);
  const paths = new Map<number, (now: number) => number>();
  let moveCapacity = 0;
  for (let instance = 0; instance < count; instance++) {
    if (resource[instance] !== SLIDE_KEEP_RESOURCE) {
      reveal[instance] = created[instance];
      continue;
    }
    reveal[instance] = start[instance] < 0 ? NEVER : start[instance] - 1;
    if (start[instance] >= 0)
      moveCapacity += Math.max(0, Math.min(end[instance], steps) - reveal[instance]);
  }
  const moveKeys = new Float64Array(moveCapacity);
  const moveX = new Float32Array(moveCapacity);
  let moved = 0;
  for (let instance = 0; instance < count; instance++) {
    if (resource[instance] !== SLIDE_KEEP_RESOURCE || start[instance] < 0) continue;
    const note = requests.note[accepted[instance]];
    let path = paths.get(note);
    if (!path) paths.set(note, (path = slideKeepPath(input.score, note)));
    const last = Math.min(end[instance], steps);
    for (let step = reveal[instance]; step < last; step++) {
      moveKeys[moved] = step * KEY_INSTANCE + instance;
      moveX[moved++] = path(stepFrames(step));
    }
  }
  const order = Uint32Array.from({ length: moved }, (_, i) => i).sort(
    (a, b) => moveKeys[a] - moveKeys[b],
  );
  const moves: EffectMoves = {
    instance: new Uint32Array(moved),
    step: new Int32Array(moved),
    x: new Float32Array(moved),
    y: new Float32Array(moved),
    z: new Float32Array(moved).fill(DEPTH),
  };
  for (let i = 0; i < moved; i++) {
    const key = moveKeys[order[i]];
    const instance = key % KEY_INSTANCE;
    moves.instance[i] = instance;
    moves.step[i] = (key - instance) / KEY_INSTANCE;
    moves.x[i] = moveX[order[i]];
  }

  const consumption: Consumption = {
    instance: new Uint32Array(planned),
    entry: new Uint8Array(planned),
    step: new Int32Array(planned),
    low: new Uint32Array(planned),
    high: new Uint32Array(planned),
    crt: new Uint32Array(planned),
  };
  const stepsOut: number[] = [];
  const lows: number[] = [];
  const highs: number[] = [];
  const crts: number[] = [];
  let low = 1;
  let high = 0;
  let crt = 1;
  let lastStep = -1;
  for (let i = 0; i < planned; i++) {
    let key = plan[i];
    const entry = key % KEY_ENTRY;
    key = (key - entry) / KEY_ENTRY;
    const instance = key % KEY_INSTANCE;
    key = (key - instance) / KEY_INSTANCE;
    const step = (key - (key % KEY_PLAYER)) / KEY_PLAYER;
    if (step !== lastStep) {
      if (lastStep >= 0) {
        stepsOut.push(lastStep);
        lows.push(low);
        highs.push(high);
        crts.push(crt);
      }
      lastStep = step;
    }
    consumption.instance[i] = instance;
    consumption.entry[i] = entry;
    consumption.step[i] = step;
    consumption.low[i] = low;
    consumption.high[i] = high;
    consumption.crt[i] = crt;
    const [, effect, particle] = EFFECT_DRAWS.get(resource[instance])![entry];
    for (let k = 0; k < effect; k++) {
      const mask = (-1400276635 << (low & 3)) >>> 0;
      const vl = (low ^ mask) >>> 0;
      const vh = high;
      const al = (vl << 1) >>> 0;
      const ah = ((vh << 1) | (vl >>> 31)) >>> 0;
      const bl = (vl ^ al) >>> 0;
      const bh = (vh ^ ah) >>> 0;
      const cl = (bl << 2) >>> 0;
      const ch = ((bh << 2) | (bl >>> 30)) >>> 0;
      const dl = ((vl >>> 1) | (vh << 31)) >>> 0;
      const dh = vh >>> 1;
      const el = (vl ^ dl) >>> 0;
      const eh = (vh ^ dh) >>> 0;
      const fl = ((el >>> 2) | (eh << 30)) >>> 0;
      const fh = eh >>> 2;
      low = (vl ^ cl ^ fl) >>> 0;
      high = (vh ^ ch ^ fh) >>> 0;
    }
    for (let k = 0; k < particle; k++) crt = (Math.imul(crt, 0x343fd) + 0x269ec3) >>> 0;
  }
  if (lastStep >= 0) {
    stepsOut.push(lastStep);
    lows.push(low);
    highs.push(high);
    crts.push(crt);
  }
  const streams: RandomStreams = {
    steps: Int32Array.from(stepsOut),
    low: Uint32Array.from(lows),
    high: Uint32Array.from(highs),
    crt: Uint32Array.from(crts),
  };

  const rows: EffectRow[] = new Array(count);
  let cursor = 0;
  let beforeLow = 1;
  let beforeHigh = 0;
  let beforeCrt = 1;
  for (let instance = 0; instance < count; instance++) {
    const at = accepted[instance];
    const step = created[instance];
    while (cursor < streams.steps.length && streams.steps[cursor] < step) {
      beforeLow = streams.low[cursor];
      beforeHigh = streams.high[cursor];
      beforeCrt = streams.crt[cursor];
      cursor++;
    }
    rows[instance] = {
      kind: "effect",
      time: step / STEP_HZ,
      resource: resource[instance],
      note: requests.note[at],
      lane: requests.lane[at],
      width: requests.width[at],
      rngLow: beforeLow,
      rngHigh: beforeHigh,
      crt: beforeCrt,
    };
  }
  const pick = <T extends Int32Array | Uint8Array | Int8Array | Uint16Array | Float32Array>(
    column: T,
    make: (length: number) => T,
  ): T => {
    const out = make(count);
    for (let instance = 0; instance < count; instance++) out[instance] = column[accepted[instance]];
    return out;
  };
  return {
    rows,
    moves,
    instances: {
      resource,
      group: pick(requests.group, (n) => new Uint8Array(n)),
      created,
      start,
      end: end.slice(0, count),
      endReason: reason.slice(0, count),
      displayState: pick(requests.displayState, (n) => new Int8Array(n)),
      animation: pick(requests.animation, (n) => new Uint16Array(n)),
      flags: pick(requests.flags, (n) => new Uint8Array(n)),
      scaleX: pick(requests.scaleX, (n) => new Float32Array(n)),
      reveal,
      scaleY: new Float32Array(count).fill(1),
      scaleZ: new Float32Array(count).fill(1),
      posX: pick(requests.posX, (n) => new Float32Array(n)),
      posY: pick(requests.posY, (n) => new Float32Array(n)),
      posZ: pick(requests.posZ, (n) => new Float32Array(n)),
      kind: pick(requests.kind, (n) => new Uint8Array(n)),
    },
    streams,
    consumption,
  };
}
