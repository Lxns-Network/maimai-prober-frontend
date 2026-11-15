import { GROUND_MAIN_PART, MINE_PART, PLAIN_AIR_PART } from "../bake/events";
import { airModelFor } from "../../notes/air";
import { AIR_PARENT_KIND, AIR_SLIDE_MODEL_TABLES } from "../../notes/airSlideParts";
import { timelineFramesAt } from "../../notes/extapClock";
import { widthIndex, widthOf } from "../../notes/matrix";
import { advanceMotionFrame, motionSeed } from "../../notes/motionClock";
import type { NoteScore } from "../../notes/score";
import { MODEL_INDICES, NOTE_FIELDS, SPAWN_CONSTANTS } from "../../notes/tables";
import { effectiveTime, registerImmutableTimeline, windowPredicate } from "../../notes/timing";
import { registerImmutableScroll } from "../../notes/space";
import { PHASE, type ObjectRun } from "./emissions";
import { airTimeMs } from "./families/air";
import { AIR_HOLD_PARTS } from "./families/airHold";
import { AIR_SLIDE_HEAD_PART } from "./families/airSlide";
import { scanState } from "./spawnStep";

const f32 = Math.fround;
const STEP_FRAMES = 0.5;
/** Steps from being built until an AIR long note first transforms its parts. */
const ACTIVE_AFTER = 2;
/** Model sets that share one pool of animation slots across every note family. */
const SHARED_BELOW = 210;
const DOWN_SEED_SCALE = 0.4000000059604645;
const DOWN_MODELS = Object.freeze({ from: 178, to: 209 });
const AIR_HOLD_HEAD_FIRST = 161;
const AIR_HOLD_ELEMENT_FIRST = [357, 373] as const;
const RECORD_HEAD_KEY = 0x70;
const RECORD_TAIL_KEY = 0x74;
const MINE_TICK = 1;
const MINE_UPPER = 49;

interface Clock {
  upper: number;
  loop: boolean;
  rate: number;
  scale: number;
}
const clock = (upper: number): Clock => Object.freeze({ upper, loop: true, rate: 1, scale: 1 });
const CLOCKS = Object.freeze([
  { from: 146, to: 225, clock: clock(120) },
  { from: 342, to: 357, clock: clock(20) },
  { from: 358, to: 373, clock: clock(60) },
]);
const MINE_CLOCK = clock(MINE_UPPER);

function clockOf(model: number): Clock | null {
  for (const range of CLOCKS) if (model >= range.from && model <= range.to) return range.clock;
  return null;
}

/**
 * When a part's clock is rewritten from the timeline frame before a step's tick: on steps it is
 * displayed and its note is in the depth window; on steps its note transforms and is in the window;
 * or on those steps and every step it is displayed.
 */
type SeedRule = "displayed-in-window" | "in-window" | "displayed-or-in-window";

interface Part {
  run: ObjectRun;
  part: number;
  model: number;
  clock: Clock;
  tick: number;
  /** Pool the part takes a slot from, or null for a clock of its own. */
  pool: string | null;
  /** Frame written when the part is bound, or null to continue from its slot. */
  initial: number | null;
  seed: SeedRule | null;
  seedScale: number;
  /** Frame a seeded tick reaches on each step, filled as needed. */
  pure: Float32Array | null;
  window: StepWindow | null;
  /** Steps on which the part's note transforms its parts, from `transformFrom` up to `release`. */
  transformFrom: number;
  bind: number;
  release: number;
  /** End-of-step visibility of the part: change steps and the value from each on. */
  shownSteps: number[];
  shownValues: number[];
  inherited: number;
  slot: Slot | null;
}

interface Slot {
  frame: number;
  busy: boolean;
}

/** Whether a note's own time is in the depth window, evaluated at most once per step. */
interface StepWindow {
  key: number;
  timeFrames: number;
  /** First step the memo covers; 0 unknown, 1 outside the window, 2 inside it. */
  from: number;
  memo: Uint8Array;
}

/** Animation frames of every animated note part, one track per bound record and part. */
export interface MotionTracks {
  /** Display speed row the frames were computed for. */
  speedRow: number;
  records: Uint32Array;
  parts: Uint16Array;
  models: Uint16Array;
  /** Step of each track's first frame. */
  firsts: Int32Array;
  /** Start of each track's frames; a track ends where the next one starts. */
  offsets: Uint32Array;
  /** The frame each track's clock reaches after a step, or NaN on a step it does not advance. */
  frames: Float32Array;
}

export interface MotionInput {
  score: NoteScore;
  speedRow: number;
  /** Grid steps the tracks cover. */
  steps: number;
  runs: readonly ObjectRun[];
}

function shownChanges(run: ObjectRun, part: number): { steps: number[]; values: number[] } {
  const steps: number[] = [];
  const values: number[] = [];
  for (const model of run.models) {
    if (model.part !== part) continue;
    if (steps.length && steps[steps.length - 1] === model.step)
      values[values.length - 1] = model.shown;
    else {
      steps.push(model.step);
      values.push(model.shown);
    }
  }
  return { steps, values };
}

/** Key and frame time a note's head is placed by, per the parent it sits on. */
function headTiming(
  record: DataView,
  joints: readonly DataView[],
): { key: number; timeFrames: number } {
  const kind = parentKind(record);
  return {
    key: record.getInt32(kind === 0 ? RECORD_HEAD_KEY : RECORD_TAIL_KEY, true),
    timeFrames: f32(airTimeMs(record, joints) * SPAWN_CONSTANTS.framesPerMs),
  };
}

function parentKind(record: DataView): number {
  const type = record.getInt32(0x10, true);
  const kind = type >= 0 && type < AIR_PARENT_KIND.length ? AIR_PARENT_KIND[type] : 3;
  if (kind === 3) throw new RangeError(`An AIR part on a parent of type ${type}`);
  return kind;
}

/** Width slot of an attached AIR long note: its parent's last joint for a SLIDE, else its own. */
function attachedSlot(record: DataView, joints: readonly DataView[]): number {
  if (parentKind(record) !== 2) return widthIndex(widthOf(record.getInt32(0x2c, true)));
  const last = joints[joints.length - 1];
  if (!last) throw new RangeError("An attached AIR on a SLIDE needs the SLIDE's joints");
  return widthIndex(widthOf(last.getInt32(0x20, true)));
}

/** Clock descriptors shared by offline recording and live display-speed playback. */
export function motionParts(score: NoteScore, runs: readonly ObjectRun[], steps: number): Part[] {
  const K = SPAWN_CONSTANTS.framesPerMs;
  const parts: Part[] = [];
  const add = (
    run: ObjectRun,
    part: number,
    model: number,
    rest: Pick<Part, "pool" | "initial" | "seed" | "window" | "release"> & { tick?: number },
  ) => {
    const clock = rest.pool === null ? MINE_CLOCK : clockOf(model);
    if (!clock) return;
    const shown = shownChanges(run, rest.pool === null ? GROUND_MAIN_PART : part);
    parts.push({
      run,
      part,
      model,
      clock,
      tick: rest.tick ?? STEP_FRAMES,
      pool: rest.pool,
      initial: rest.initial,
      seed: rest.seed,
      seedScale: model >= DOWN_MODELS.from && model <= DOWN_MODELS.to ? DOWN_SEED_SCALE : 1,
      pure: null,
      window: rest.window,
      transformFrom: run.object.spawn + ACTIVE_AFTER,
      bind: run.object.spawn,
      release: rest.release,
      shownSteps: shown.steps,
      shownValues: shown.values,
      inherited: 0,
      slot: null,
    });
  };
  const poolOf = (model: number, family: string) =>
    model < SHARED_BELOW ? `shared/${model}` : `${family}/${model}`;
  const windowOf = (record: DataView, joints: readonly DataView[], run: ObjectRun): StepWindow => ({
    ...headTiming(record, joints),
    from: run.object.spawn,
    memo: new Uint8Array(Math.max(0, Math.min(run.removal, steps) - run.object.spawn)),
  });

  for (const run of runs) {
    const index = run.object.record;
    const record = score.records[index];
    const joints = score.slideJoints?.get(index) ?? [];
    switch (run.object.className) {
      case "AirNote": {
        const model = airModelFor(record, joints);
        const judged = run.judges[0];
        if (!judged) throw new RangeError(`AIR record ${index} is never judged`);
        add(run, PLAIN_AIR_PART, model, {
          pool: poolOf(model, "shared"),
          initial: null,
          seed: "displayed-in-window",
          window: windowOf(record, joints, run),
          release: judged.step,
        });
        break;
      }
      case "AirHoldNote": {
        const slot = attachedSlot(record, joints);
        const window = windowOf(record, joints, run);
        const release = run.removal - 1;
        const head = AIR_HOLD_HEAD_FIRST - slot;
        add(run, AIR_HOLD_PARTS.body, head, {
          pool: poolOf(head, "hold"),
          initial: null,
          seed: "in-window",
          window,
          release,
        });
        const elements = score.airHolds?.get(index) ?? [];
        const times = elements.map((joint) => f32(joint.getFloat32(8, true) * K));
        if (record.getUint8(0x24) !== 0) times.push(f32(record.getFloat32(0x20, true) * K));
        times.forEach((time, k) =>
          AIR_HOLD_ELEMENT_FIRST.forEach((first, j) => {
            const model = first - slot;
            add(run, k * 2 + j, model, {
              pool: poolOf(model, "hold"),
              initial: time,
              seed: "displayed-or-in-window",
              window,
              release,
            });
          }),
        );
        break;
      }
      case "AirSlideNote": {
        const slot = attachedSlot(record, joints);
        const colour = record.getInt32(0x94, true);
        const variant = colour === 0 ? 2 : colour === 2 ? 1 : 0;
        const window = windowOf(record, joints, run);
        const release = run.removal - 1;
        const head = AIR_SLIDE_MODEL_TABLES.head[3 * slot + variant];
        add(run, AIR_SLIDE_HEAD_PART, head, {
          pool: poolOf(head, "slide"),
          initial: null,
          seed: "in-window",
          window,
          release,
        });
        (score.airSlides?.get(index) ?? []).forEach((joint, k) => {
          if (!joint.getUint8(0x14)) return;
          const width = widthIndex(widthOf(joint.getInt32(0x20, true)));
          const time = f32(joint.getFloat32(8, true) * K);
          [AIR_SLIDE_MODEL_TABLES.nodeFirst, AIR_SLIDE_MODEL_TABLES.nodeSecond].forEach(
            (table, j) => {
              const model = table[width];
              add(run, k * 2 + j, model, {
                pool: poolOf(model, "slide"),
                initial: time,
                seed: "displayed-or-in-window",
                window,
                release,
              });
            },
          );
        });
        break;
      }
      case "MineNote": {
        const model = MODEL_INDICES.mine[widthIndex(widthOf(record.getInt32(0x2c, true)))];
        add(run, MINE_PART, model, {
          pool: null,
          initial: 0,
          seed: null,
          window: null,
          release: run.removal,
          tick: MINE_TICK,
        });
        break;
      }
    }
  }

  return parts;
}

/**
 * The animation frames every animated note part reaches. Parts of the shared model sets take
 * slots from one pool per model and continue from the frame the slot's last holder left; a slot is
 * the lowest free one when bound and is freed when its holder is released.
 */
export function motionTracks(input: MotionInput): MotionTracks {
  const { score, steps } = input;
  registerImmutableTimeline(score);
  registerImmutableScroll(score.scroll);
  const state = scanState(input.speedRow);
  const setNow = (k: number) => state.setFloat32(NOTE_FIELDS.now, f32(k * STEP_FRAMES), true);
  const absolute = new Float64Array(steps).fill(NaN);
  const absoluteAt = (k: number) => {
    if (Number.isNaN(absolute[k])) {
      setNow(k);
      absolute[k] = timelineFramesAt(state, score);
    }
    return absolute[k];
  };
  const inWindow = (window: StepWindow, k: number) => {
    const now = f32(k * STEP_FRAMES);
    if (now >= window.timeFrames) return true;
    const at = k - window.from;
    if (at >= 0 && at < window.memo.length && window.memo[at] !== 0) return window.memo[at] === 2;
    setNow(k);
    const te = effectiveTime(state, score, window.key, window.timeFrames);
    const value = windowPredicate(state, score, -1, te, 0, 1);
    if (at >= 0 && at < window.memo.length) window.memo[at] = value ? 2 : 1;
    return value;
  };

  const parts = motionParts(score, input.runs, steps);

  const frames = new Map<Part, { first: number; values: Float32Array }>();
  const pure = new Map<string, Float32Array>();
  for (const part of parts) {
    if (part.seed === null) continue;
    const name = `${part.clock.upper}/${part.seedScale}/${part.tick}`;
    let values = pure.get(name);
    if (!values) pure.set(name, (values = new Float32Array(steps).fill(NaN)));
    part.pure = values;
  }
  const pureFrame = (part: Part, k: number) => {
    const values = part.pure!;
    if (Number.isNaN(values[k]))
      values[k] = advanceMotionFrame(
        motionSeed(absoluteAt(k), part.seedScale),
        part.clock,
        part.tick,
      );
    return values[k];
  };
  const run = (part: Part) => {
    const end = Math.min(part.release, steps);
    const values = new Float32Array(Math.max(0, end - part.bind)).fill(NaN);
    let frame = part.initial ?? part.inherited;
    let change = 0;
    let shown = 0;
    const { seed, window } = part;
    const seedsHidden = seed === "in-window" || seed === "displayed-or-in-window";
    for (let k = part.bind; k < end; ) {
      while (change < part.shownSteps.length && part.shownSteps[change] <= k)
        shown = part.shownValues[change++];
      const next = Math.min(change < part.shownSteps.length ? part.shownSteps[change] : end, end);
      if (!shown) {
        if (seedsHidden && window)
          for (let j = next - 1; j >= Math.max(k, part.transformFrom); j--)
            if (inWindow(window, j)) {
              frame = motionSeed(absoluteAt(j), part.seedScale);
              break;
            }
        k = next;
        continue;
      }
      for (; k < next; k++) {
        const advanced = advanceMotionFrame(frame, part.clock, part.tick);
        if (seed === null || !window || (seed !== "displayed-in-window" && k < part.transformFrom))
          frame = advanced;
        else if (seed === "displayed-or-in-window") frame = pureFrame(part, k);
        else {
          const seeded = pureFrame(part, k);
          frame = seeded === advanced || !inWindow(window, k) ? advanced : seeded;
        }
        values[k - part.bind] = frame;
      }
    }
    frames.set(part, { first: part.bind, values });
    if (part.slot) part.slot.frame = frame;
  };

  type Event = {
    step: number;
    phase: number;
    order: number;
    index: number;
    bind: boolean;
    part: Part;
  };
  const events: Event[] = [];
  parts.forEach((part, index) => {
    const order = part.run.object.order;
    events.push({ step: part.bind, phase: PHASE.spawn, order, index, bind: true, part });
    if (part.release < steps)
      events.push({ step: part.release, phase: PHASE.tick, order, index, bind: false, part });
  });
  events.sort(
    (a, b) => a.step - b.step || a.phase - b.phase || a.order - b.order || a.index - b.index,
  );
  const pools = new Map<string, Slot[]>();
  for (const event of events) {
    const { part } = event;
    if (part.pool === null) {
      if (!event.bind) run(part);
      continue;
    }
    if (event.bind) {
      let slots = pools.get(part.pool);
      if (!slots) pools.set(part.pool, (slots = []));
      let slot = slots.find((candidate) => !candidate.busy);
      if (!slot) slots.push((slot = { frame: 0, busy: false }));
      slot.busy = true;
      part.slot = slot;
      part.inherited = slot.frame;
    } else {
      run(part);
      part.slot!.busy = false;
    }
  }
  for (const part of parts) if (!frames.has(part)) run(part);

  const tracks = parts
    .map((part) => {
      const { values } = frames.get(part)!;
      let lo = 0;
      let hi = values.length;
      while (lo < hi && Number.isNaN(values[lo])) lo++;
      while (hi > lo && Number.isNaN(values[hi - 1])) hi--;
      return { part, first: part.bind + lo, values: values.subarray(lo, hi) };
    })
    .filter((track) => track.values.length > 0);
  const out: MotionTracks = {
    speedRow: input.speedRow,
    records: new Uint32Array(tracks.length),
    parts: new Uint16Array(tracks.length),
    models: new Uint16Array(tracks.length),
    firsts: new Int32Array(tracks.length),
    offsets: new Uint32Array(tracks.length + 1),
    frames: new Float32Array(tracks.reduce((n, track) => n + track.values.length, 0)),
  };
  let at = 0;
  tracks.forEach((track, t) => {
    out.records[t] = track.part.run.object.record;
    out.parts[t] = track.part.part;
    out.models[t] = track.part.model;
    out.firsts[t] = track.first;
    out.offsets[t] = at;
    out.frames.set(track.values, at);
    at += track.values.length;
  });
  out.offsets[tracks.length] = at;
  return out;
}
