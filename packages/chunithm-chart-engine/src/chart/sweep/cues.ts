import type { BakeEvent } from "../bake/events";
import { AUTOPLAY_GRADE, firstStepFrom, laneChecker, stepFrames } from "../lifecycle/autoplayJudge";
import type { LifecycleContext } from "../lifecycle/context";
import { ACTIVE_AFTER, type ObjectRun } from "../lifecycle/emissions";
import { longHeadRow } from "../lifecycle/families/hold";
import type { NoteScore } from "../../notes/score";
import { SPAWN_CONSTANTS } from "../../notes/tables";

const STEP_SECONDS = 1 / 120;
/** Player gain every cue starts with. */
const PLAYER_GAIN = 1;
/** Channel recorded for a cue started by another cue's script. */
const SCRIPT_CHANNEL = 0xff;
const f = Math.fround;
const K = SPAWN_CONSTANTS.framesPerMs;

/** Channels and cues used by the chart and live judgments. */
export const SOUND = Object.freeze({
  tap: { channel: 6, cue: 60 },
  tapMiss: { channel: 16, cue: 61 },
  holdTail: { channel: 9, cue: 71 },
  slideTail: { channel: 12, cue: 72 },
  flickSecond: { channel: 22, cue: 99 },
  airElement: { channel: 18, cue: 89 },
  ladderElement: { channel: 18, cue: 578 },
  extra: { channel: 24, cue: 46 },
  airHead: { channel: 4, cue: 84 },
  guide: { channel: 17, cue: 44 },
  airUp: { channel: 4, cue: 58 },
  airDown: { channel: 4, cue: 306 },
});
/** Cue each kind of long note loops, and the pool its player is taken from. */
export const LOOP = {
  hold: { pool: 0, cue: 92 },
  slide: { pool: 0, cue: 95 },
  air: { pool: 1, cue: 85 },
} as const;
/** Player channels of the ground and air pools. */
const POOLS = [
  { first: 27, count: 6 },
  { first: 33, count: 6 },
] as const;
/** Directions below this index an AIR upward. */
export const AIR_UP_DIRECTIONS = 3;
/** EX kinds that have an additional sound. */
const EXTRA_KINDS = 8;

/**
 * Why a cue stopped: its player stopped, a script stopped it, its limit group made room, or a
 * category it belongs to made room.
 */
export const CUE_STOP = Object.freeze({ player: 0, script: 42, category: 47, limit: 54 });

/** Limit group of a cue, the cues it starts when first serviced and the cues its script stops later. */
interface CueProgram {
  group: number | null;
  count: number;
  children: readonly number[];
  stops?: { after: number; cues: readonly number[] };
}
const program = (
  group: number | null,
  count = 1,
  children: readonly number[] = [],
  stops?: CueProgram["stops"],
): CueProgram => ({ group, count, children, stops });
const CUES: ReadonlyMap<number, CueProgram> = new Map([
  [44, program(0)],
  [46, program(2)],
  [47, program(3, 4)],
  [48, program(4, 4)],
  [54, program(6)],
  [57, program(9)],
  [58, program(10)],
  [60, program(12, 1, [54, 57], { after: 50, cues: [54, 57] })],
  [61, program(13)],
  [71, program(null)],
  [72, program(null)],
  [84, program(14)],
  [85, program(15, 4)],
  [89, program(19)],
  [92, program(null, 1, [47, 54])],
  [95, program(null, 1, [48, 54])],
  [99, program(22)],
  [306, program(48)],
  [578, program(55)],
]);
/** Cues whose category holds a limited number of cues at once, shared by every cue in it. */
const CATEGORY_LIMITS: ReadonlyMap<number, { category: number; count: number }> = new Map([
  [71, { category: 0, count: 1 }],
  [72, { category: 0, count: 1 }],
]);

/** One sound an object plays: a cue started on a channel, a looping player started, or stopped. */
export type Sound =
  | { kind: "start"; cue: number; channel: number }
  | { kind: "loop"; pool: 0 | 1; cue: number }
  | { kind: "stop" };

interface Timed {
  step: number;
  /** 0 while objects tick, 1 when the objects that ended are removed. */
  phase: number;
  order: number;
  seq: number;
  sound: Sound;
}

interface Cue {
  row: number;
  cue: number;
  channel: number;
  program: CueProgram;
  stopped: boolean;
  serviced: boolean;
  /** Step the script's wait ends at, once serviced. */
  wake: number;
}

export type CueRow = Extract<BakeEvent, { kind: "cue" | "cuestop" }>;

const MICROSECONDS = 1000;
const binary64 = new DataView(new ArrayBuffer(8));
/** Whole milliseconds the sequence clock reads at a step: floor(timestamp * 1000) microseconds, exact. */
function sequenceMilliseconds(step: number): number {
  binary64.setFloat64(0, (step * 1000) / 120, false);
  const high = binary64.getUint32(0, false);
  const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(binary64.getUint32(4, false));
  const exponent = (high >>> 20) & 0x7ff;
  const units = exponent === 0 ? fraction : ((1n << 52n) | fraction) << BigInt(exponent - 1);
  return Math.floor(Number((units * BigInt(MICROSECONDS)) >> 1074n) / MICROSECONDS);
}

/**
 * The cue instances of one song: group limits, player pools, the cues a first service starts and
 * the cues a script stops once its wait has run out.
 */
export function cueSimulation(rows: CueRow[]) {
  const groups = new Map<number, Cue[]>();
  const categories = new Map<number, Cue[]>();
  const byChannel = new Map<number, Cue[]>();
  const live = new Map<number, Cue[]>();
  const pools: { channel: number; owner: number }[][] = [[], []];
  const scripted: Cue[] = [];
  let starts = 0;
  let step = 0;
  let time = 0;

  const listOf = (map: Map<number, Cue[]>, key: number) => {
    let list = map.get(key);
    if (!list) map.set(key, (list = []));
    return list;
  };
  const remove = (list: Cue[], cue: Cue) => list.splice(list.indexOf(cue), 1);
  const stop = (cue: Cue, reason: number) => {
    if (cue.stopped) return;
    cue.stopped = true;
    const { group } = cue.program;
    if (group !== null) remove(groups.get(group)!, cue);
    const limit = CATEGORY_LIMITS.get(cue.cue);
    if (limit) remove(categories.get(limit.category)!, cue);
    remove(live.get(cue.cue)!, cue);
    remove(byChannel.get(cue.channel)!, cue);
    rows.push({ kind: "cuestop", time, row: cue.row, reason });
  };
  const start = (id: number, channel: number, recorded: number) => {
    const cueProgram = CUES.get(id);
    if (!cueProgram) throw new RangeError(`Cue ${id} has no program`);
    const { group, count } = cueProgram;
    if (group !== null) {
      const previous = groups.get(group) ?? [];
      if (previous.length >= count) stop(previous[0], CUE_STOP.limit);
    }
    const limit = CATEGORY_LIMITS.get(id);
    if (limit) {
      const previous = categories.get(limit.category) ?? [];
      if (previous.length >= limit.count) stop(previous[0], CUE_STOP.category);
    }
    const cue: Cue = {
      row: starts++,
      cue: id,
      channel,
      program: cueProgram,
      stopped: false,
      serviced: false,
      wake: 0,
    };
    if (group !== null) listOf(groups, group).push(cue);
    if (limit) listOf(categories, limit.category).push(cue);
    listOf(byChannel, channel).push(cue);
    listOf(live, id).push(cue);
    if (cueProgram.children.length) scripted.push(cue);
    rows.push({ kind: "cue", time, cue: id, channel: recorded, gain: PLAYER_GAIN });
  };
  const prepare = (pool: 0 | 1) => {
    const entries = pools[pool];
    const { first, count } = POOLS[pool];
    if (entries.length >= count) return entries[0].channel;
    for (let channel = first; channel < first + count; channel++)
      if (!entries.some((entry) => entry.channel === channel)) return channel;
    throw new Error("A cue player pool has no channel");
  };

  return {
    begin(next: number) {
      step = next;
      time = next * STEP_SECONDS;
    },
    apply(sound: Sound, owner: number) {
      if (sound.kind === "start") start(sound.cue, sound.channel, sound.channel);
      else if (sound.kind === "loop") {
        const channel = prepare(sound.pool);
        pools[sound.pool] = pools[sound.pool].filter((entry) => entry.channel !== channel);
        pools[sound.pool].push({ channel, owner });
        start(sound.cue, channel, channel);
      } else {
        const entry = pools.flat().find((candidate) => candidate.owner === owner);
        if (entry)
          for (const cue of [...(byChannel.get(entry.channel) ?? [])]) stop(cue, CUE_STOP.player);
      }
    },
    /** Services every running script once, in the order its cue started. */
    service() {
      for (const cue of [...scripted]) {
        if (cue.stopped) scripted.splice(scripted.indexOf(cue), 1);
        else if (!cue.serviced) {
          cue.serviced = true;
          for (const child of cue.program.children) start(child, cue.channel, SCRIPT_CHANNEL);
          const { stops } = cue.program;
          if (stops) {
            const origin = sequenceMilliseconds(step);
            let wake = step + 1;
            while (sequenceMilliseconds(wake) - origin < stops.after) wake++;
            cue.wake = wake;
          } else scripted.splice(scripted.indexOf(cue), 1);
        } else if (cue.wake === step) {
          for (const target of cue.program.stops!.cues)
            for (const other of [...(live.get(target) ?? [])]) stop(other, CUE_STOP.script);
          scripted.splice(scripted.indexOf(cue), 1);
        }
      }
    },
  };
}

/** Whether a TAP, HOLD or SLIDE result plays the additional EX sound. */
export const playsExtra = (record: DataView) => {
  const type = record.getInt32(0x10, true);
  const kind = record.getInt32(0x88, true);
  const extra = type > 0 && ((type <= 2 && record.getUint8(0x8c) !== 0) || type === 4);
  return extra && kind >= 0 && kind < EXTRA_KINDS;
};

export const startSound = (target: { channel: number; cue: number }): Sound => ({
  kind: "start",
  cue: target.cue,
  channel: target.channel,
});

/** Judge configuration frames a long note's tail sound leads its end by. */
const CONFIG_SOUND_LEAD = 0x70c;
const CONFIG_SLIDE_WINDOWS = 0x730;
const CONFIG_SLIDE_ROW_BYTES = 20;
const RECORD_TAIL_TIME = 0x38;
const TICK_FRAMES_PER_MS = f(0.06);

/** Step a HOLD plays its tail sound at, or -1 when it is removed first. */
export function holdTailStep(run: ObjectRun, record: DataView, context: LifecycleContext): number {
  const { config, offset } = context;
  const noteFrames = f(record.getFloat32(8, true) * K);
  const tailStart = f(noteFrames + offset);
  const tailEnd = f(f(record.getFloat32(RECORD_TAIL_TIME, true) * TICK_FRAMES_PER_MS) + offset);
  const lead = config.getFloat32(CONFIG_SOUND_LEAD, true);
  const head = laneChecker(record, config, longHeadRow(record, context.difficulty), offset);
  const active = run.object.spawn + ACTIVE_AFTER;
  const open = firstStepFrom(
    active,
    Math.floor(2 * tailStart) - 2,
    (k) => !(head.early > stepFrames(k)) && tailStart <= stepFrames(k),
  );
  const step = firstStepFrom(
    open,
    Math.floor(2 * (tailEnd + lead)) - 2,
    (k) => f(stepFrames(k) - lead) >= tailEnd,
  );
  return step < run.removal ? step : -1;
}

/** Steps each flagged joint of a SLIDE plays its tail sound at, in joint order. */
export function slideTailSteps(
  run: ObjectRun,
  record: DataView,
  joints: readonly DataView[],
  context: LifecycleContext,
): { step: number; last: boolean }[] {
  const { config, offset } = context;
  const noteFrames = f(record.getFloat32(8, true) * K);
  const tailStart = f(noteFrames + offset);
  const firstWidth = record.getInt32(0x2c, true) + 1;
  const gate = f(
    f(
      config.getFloat32(
        CONFIG_SLIDE_WINDOWS + CONFIG_SLIDE_ROW_BYTES * (16 - firstWidth) + 4,
        true,
      ) + offset,
    ) + noteFrames,
  );
  const lead = config.getFloat32(CONFIG_SOUND_LEAD, true);
  const active = run.object.spawn + ACTIVE_AFTER;
  const open = firstStepFrom(
    active,
    Math.floor(2 * tailStart) - 2,
    (k) => !(gate > stepFrames(k)) && !(stepFrames(k) < tailStart),
  );
  const out: { step: number; last: boolean }[] = [];
  let due = -Infinity;
  joints.forEach((joint, j) => {
    const last = j === joints.length - 1;
    const time = f(f(joint.getFloat32(8, true) * K) + offset);
    due = Math.max(due, time);
    if (!last && joint.getUint8(0x14) === 0) return;
    const step = firstStepFrom(
      open,
      Math.floor(2 * (due + lead)) - 2,
      (k) => !(due > f(stepFrames(k) - lead)),
    );
    if (step < run.removal) out.push({ step, last });
  });
  return out;
}

/** Sounds one object plays, with the step and order within it. */
function objectSounds(
  run: ObjectRun,
  score: NoteScore,
  context: LifecycleContext,
): Omit<Timed, "order">[] {
  const { className } = run.object;
  const index = run.object.record;
  const record = score.records[index];
  const out: Omit<Timed, "order">[] = [];
  const add = (step: number, seq: number, sound: Sound, phase = 0) =>
    out.push({ step, seq, sound, phase });
  const head = run.judges.find((judge) => judge.judgePhase === 0);
  const result = (grade: number) => grade === AUTOPLAY_GRADE;
  switch (className) {
    case "TapNote":
    case "CharaTapNote":
    case "MineNote":
    case "FlickNote": {
      const judge = run.judges[0];
      if (!judge || !result(judge.result)) break;
      if (playsExtra(record) && className !== "MineNote")
        add(judge.step, 0, startSound(SOUND.extra));
      add(judge.step, 1, startSound(SOUND.tap));
      if (className === "FlickNote") add(judge.step, 2, startSound(SOUND.flickSecond));
      break;
    }
    case "HoldNote":
    case "SlideNote": {
      const loop = className === "HoldNote" ? LOOP.hold : LOOP.slide;
      if (head && result(head.result)) {
        if (playsExtra(record)) add(head.step, 0, startSound(SOUND.extra));
        add(head.step, 1, { kind: "loop", pool: loop.pool, cue: loop.cue });
      }
      add(run.removal, 0, { kind: "stop" }, 1);
      if (className === "HoldNote") {
        const step = holdTailStep(run, record, context);
        if (step >= 0) {
          add(step, 2, startSound(SOUND.holdTail));
          add(step, 3, { kind: "stop" });
        }
      } else {
        const joints = score.slideJoints?.get(index) ?? [];
        slideTailSteps(run, record, joints, context).forEach(({ step, last }, n) => {
          add(step, 2 + 2 * n, startSound(SOUND.slideTail));
          if (last) add(step, 3 + 2 * n, { kind: "stop" });
        });
      }
      break;
    }
    case "AirNote": {
      const judge = run.judges[0];
      if (judge && result(judge.result))
        add(
          judge.step,
          0,
          startSound(record.getInt32(0x90, true) < AIR_UP_DIRECTIONS ? SOUND.airUp : SOUND.airDown),
        );
      break;
    }
    case "AirHoldNote":
    case "AirSlideNote": {
      if (head && result(head.result)) {
        add(head.step, 0, startSound(SOUND.airHead));
        add(head.step, 1, { kind: "loop", pool: LOOP.air.pool, cue: LOOP.air.cue });
      }
      run.judges.forEach((judge, n) => {
        if (judge.element && result(judge.result))
          add(judge.step, 2 + n, startSound(SOUND.airElement));
      });
      if (run.soundStop !== undefined) add(run.soundStop, 2 + run.judges.length, { kind: "stop" });
      add(run.removal, 0, { kind: "stop" }, 1);
      break;
    }
    case "AirLadderNote": {
      run.judges.forEach((judge, n) => {
        if (result(judge.result)) add(judge.step, n, startSound(SOUND.ladderElement));
      });
      break;
    }
    default:
      throw new RangeError(`Note class ${className} has no sounds`);
  }
  return out;
}

/** Sound-guide kinds an object queues, with the frame time each is due at. */
function objectGuides(run: ObjectRun, score: NoteScore): { kind: number; frames: number }[] {
  const { className } = run.object;
  const index = run.object.record;
  const record = score.records[index];
  const out: { kind: number; frames: number }[] = [];
  const at = (milliseconds: number) => f(milliseconds * K);
  switch (className) {
    case "TapNote":
    case "CharaTapNote":
    case "FlickNote":
      out.push({ kind: 1, frames: at(record.getFloat32(8, true)) });
      break;
    case "HoldNote":
      out.push({ kind: 1, frames: at(record.getFloat32(8, true)) });
      out.push({ kind: 2, frames: at(record.getFloat32(RECORD_TAIL_TIME, true)) });
      break;
    case "SlideNote": {
      out.push({ kind: 1, frames: at(record.getFloat32(8, true)) });
      const joints = score.slideJoints?.get(index) ?? [];
      joints.forEach((joint, j) => {
        if (j === joints.length - 1 || joint.getUint8(0x14) !== 0)
          out.push({ kind: 2, frames: at(joint.getFloat32(8, true)) });
      });
      break;
    }
    case "AirHoldNote": {
      for (const joint of score.airHolds?.get(index) ?? [])
        out.push({ kind: 3, frames: at(joint.getFloat32(8, true)) });
      if (record.getUint8(0x24) !== 0)
        out.push({ kind: 3, frames: at(record.getFloat32(0x20, true)) });
      break;
    }
    case "AirSlideNote": {
      for (const joint of score.airSlides?.get(index) ?? [])
        if (joint.getUint8(0x14) !== 0)
          out.push({ kind: 3, frames: at(joint.getFloat32(8, true)) });
      break;
    }
    case "AirLadderNote": {
      for (const sample of score.ladders?.get(index)?.samples ?? [])
        out.push({ kind: 3, frames: at(sample.getFloat32(8, true)) });
      break;
    }
    default:
      break;
  }
  return out;
}

export interface CueInput {
  score: NoteScore;
  runs: readonly ObjectRun[];
  context: LifecycleContext;
  /** Grid steps the chart runs for. */
  steps: number;
}

const CONFIG_GUIDE_OFFSET = 0xb00;
const GUIDE_KINDS = 3;

/**
 * Cue starts and stops of the chart's sounds, each in step order. Within a step, cues start in
 * object order, then for the sound guides that fall due, then for the first service of started cues.
 */
export function cueEvents(input: CueInput): CueRow[] {
  const { score, runs, context, steps } = input;
  const timed: Timed[] = [];
  for (const run of runs)
    for (const sound of objectSounds(run, score, context))
      timed.push({ ...sound, order: run.object.order });

  const offset = context.config.getFloat32(CONFIG_GUIDE_OFFSET, true);
  const guides = new Map<number, number>();
  for (const run of runs)
    for (const { kind, frames } of objectGuides(run, score)) {
      const due = Math.max(run.object.spawn + 1, Math.ceil(2 * f(frames + offset)));
      guides.set(due, (guides.get(due) ?? 0) | (1 << kind));
    }

  timed.sort((a, b) => a.step - b.step || a.phase - b.phase || a.order - b.order || a.seq - b.seq);
  const rows: CueRow[] = [];
  const simulation = cueSimulation(rows);
  let next = 0;
  for (let step = 0; step < steps; step++) {
    simulation.begin(step);
    while (next < timed.length && timed[next].step === step) {
      simulation.apply(timed[next].sound, timed[next].order);
      next++;
    }
    const kinds = guides.get(step) ?? 0;
    for (let kind = 1; kind <= GUIDE_KINDS; kind++)
      if (kinds & (1 << kind)) simulation.apply(startSound(SOUND.guide), -1);
    simulation.service();
  }
  return rows;
}
