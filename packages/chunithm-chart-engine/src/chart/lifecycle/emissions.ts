import { BAND_ENDED, type BakeEvent, type JudgePart, type JudgePhase } from "../bake/events";
import type { NoteObject } from "./objects";

/**
 * Where in a grid step an object acts: ticking in list order, being removed after every tick,
 * being built at the step's end, or, after all of those, no longer framing a band.
 */
export const PHASE = Object.freeze({ tick: 0, remove: 1, spawn: 2, end: 3 });

/** Steps from an object being built until it first runs its active state, the first it can be shown. */
export const ACTIVE_AFTER = 2;
export type Phase = (typeof PHASE)[keyof typeof PHASE];

export interface JudgeEmission {
  step: number;
  phase: Phase;
  result: number;
  judgePhase: JudgePhase;
  part: JudgePart;
  /** Set on an AIR HOLD or AIR SLIDE element result, which a tick result of the same phase is not. */
  element?: true;
}

/** A visibility write to one model part; repeated writes of the same value may be omitted. */
export interface ModelEmission {
  step: number;
  phase: Phase;
  part: number;
  shown: 0 | 1;
}

/** A band state the object frames from `step` on; repeated states may be omitted. */
export interface BandEmission {
  step: number;
  phase: Phase;
  state: number;
}

/**
 * The band an object frames. A `band` starts from state 0; a `slide` or `airband` is recorded from
 * its first frame. Each of `ends` is the first step of a run of steps in which it is not framed.
 */
export interface BandRun {
  kind: "band" | "slide" | "airband";
  frames: BandEmission[];
  ends: number[];
}

/** Everything one note object does over its life, each list in the order the object does it. */
export interface ObjectRun {
  object: NoteObject;
  /** Grid step at which the object is removed. */
  removal: number;
  judges: JudgeEmission[];
  /** Step an attached AIR long note stops its looping sound at, when it has one. */
  soundStop?: number;
  models: ModelEmission[];
  band?: BandRun;
}

/**
 * Appends a run's model writes, dropping a write that repeats the visibility the part already has;
 * the assembled events are the same either way.
 */
export function modelWriter(models: ModelEmission[]) {
  const shown = new Map<number, number>();
  return (step: number, phase: Phase, part: number, value: 0 | 1): void => {
    if (shown.get(part) === value) return;
    shown.set(part, value);
    models.push({ step, phase, part, shown: value });
  };
}

/**
 * Appends a band's frames, dropping a frame that repeats the state framed before it with no end in
 * between; the assembled events are the same either way.
 */
export function bandWriter(band: BandRun) {
  let last: BandEmission | null = null;
  return (step: number, phase: Phase, state: number): void => {
    const previous = last;
    if (
      previous &&
      previous.state === state &&
      !band.ends.some((end) => end > previous.step && end <= step)
    )
      return;
    band.frames.push((last = { step, phase, state }));
  };
}

const STEP_SECONDS = 1 / 120;

interface Keyed<T> {
  step: number;
  phase: number;
  order: number;
  index: number;
  value: T;
}

function ordered<T extends { step: number; phase: number }>(
  runs: readonly ObjectRun[],
  pick: (run: ObjectRun) => readonly T[],
): Keyed<T>[] {
  const out: Keyed<T>[] = [];
  for (const run of runs)
    pick(run).forEach((value, index) =>
      out.push({ step: value.step, phase: value.phase, order: run.object.order, index, value }),
    );
  out.sort(
    (a, b) => a.step - b.step || a.phase - b.phase || a.order - b.order || a.index - b.index,
  );
  return out;
}

/**
 * Bake events of a set of object runs. Judgments keep the order the objects commit them in; a
 * model part's visibility is recorded at its first write and then only when a write changes it.
 */
export function assembleEvents(runs: readonly ObjectRun[]): BakeEvent[] {
  const events: BakeEvent[] = [];
  const recordOf = new Map(runs.map((run) => [run.object.order, run.object.record]));
  for (const { value, order } of ordered(runs, (run) => run.judges)) {
    events.push({
      kind: "judge",
      time: value.step * STEP_SECONDS,
      note: recordOf.get(order)!,
      result: value.result,
      phase: value.judgePhase,
      part: value.part,
    });
  }
  const states = new Map<number, number>();
  for (const { value, order } of ordered(runs, (run) => run.models)) {
    const record = recordOf.get(order)!;
    const key = record * 0x10000 + value.part;
    if (states.get(key) === value.shown) continue;
    states.set(key, value.shown);
    events.push({
      kind: "airmodel",
      time: value.step * STEP_SECONDS,
      note: record,
      part: value.part,
      shown: value.shown,
    });
  }
  for (const kind of ["band", "slide", "airband"] as const) {
    const of = runs.filter((run) => run.band?.kind === kind);
    const states = new Map<number, number>();
    const push = (step: number, note: number, value: number) =>
      events.push(
        kind === "band"
          ? { kind, time: step * STEP_SECONDS, note, state: value }
          : { kind, time: step * STEP_SECONDS, note, mode: value },
      );
    const marks = ordered(of, (run) => [
      ...run.band!.frames.map((frame) => ({ ...frame, ended: false })),
      ...run.band!.ends.map((step) => ({ step, phase: PHASE.end, state: BAND_ENDED, ended: true })),
    ]);
    for (const { value, order } of marks) {
      const record = recordOf.get(order)!;
      if (value.ended && (!states.has(record) || states.get(record) === BAND_ENDED)) continue;
      const previous = kind === "band" ? (states.get(record) ?? 0) : states.get(record);
      states.set(record, value.state);
      if (previous !== value.state) push(value.step, record, value.state);
    }
  }
  return events;
}
