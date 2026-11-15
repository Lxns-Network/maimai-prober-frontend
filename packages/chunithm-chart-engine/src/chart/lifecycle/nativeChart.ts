import type { BakeEvent } from "../bake/events";
import type { BoundScore } from "../bind/bindScore";
import { noteScoreOf, type NoteScore } from "../../notes/score";
import { endPosition, isLongNote } from "../../notes/timing";
import { lifecycleContext } from "./context";
import { assembleEvents, type ObjectRun } from "./emissions";
import { motionTracks, type MotionTracks } from "./motion";
import { noteObjects } from "./objects";
import { lifecycleRuns } from "./runs";
import { spawnSteps } from "./spawnStep";
import { cueEvents } from "../sweep/cues";
import { effectSweep, type EffectSweep } from "../sweep/effects";
import { scoreEvents } from "../sweep/score";

const STEP_HZ = 120;
/** Seconds the grid runs past the last record's end. */
const TAIL_SECONDS = 2;

/** The steps each note object exists, one entry per object: built at its spawn step, gone at its removal step. */
export interface ObjectLifetimes {
  records: Uint32Array;
  spawns: Int32Array;
  removals: Int32Array;
}

/** Everything the note lifecycles produce for one chart at one display speed. */
export interface NativeChart {
  /** The score the lifecycles read, as the note layer reads it. */
  score: NoteScore;
  /** Grid steps the chart runs for. */
  steps: number;
  /** Judgments, scores, cues, effects, part visibility and band states; each kind in step order. */
  events: BakeEvent[];
  motion: MotionTracks;
  lifetimes: ObjectLifetimes;
  /** Effect instances, their random streams and the starting state of each random draw. */
  effects: EffectSweep;
  runs: ObjectRun[];
}

/** Grid steps from the start to two seconds past the latest head or long-note end of any record. */
export function chartSteps(records: readonly DataView[]): number {
  let end = 0;
  for (const record of records) {
    let last = record.getFloat32(8, true);
    for (const side of [0, 1])
      if (isLongNote(record, side))
        last = Math.max(last, endPosition(record, side).getFloat32(8, true));
    if (!Number.isFinite(last)) throw new RangeError("A record has no finite end");
    end = Math.max(end, last);
  }
  return Math.round((end / 1000 + TAIL_SECONDS) * STEP_HZ);
}

/** Runs every note lifecycle of a bound chart at a display speed row. */
export function nativeChart(bound: BoundScore, speedRow: number): NativeChart {
  const score = noteScoreOf(bound);
  const steps = chartSteps(score.records);
  const objects = noteObjects(score.records, spawnSteps(score, speedRow, steps));
  const context = lifecycleContext(bound);
  const runs = lifecycleRuns(score, objects, context);
  const events = assembleEvents(runs).filter((event) => Math.round(event.time * STEP_HZ) < steps);
  const effects = effectSweep({ score, runs, events, steps });
  return {
    score,
    steps,
    events: [
      ...events,
      ...scoreEvents(score, events),
      ...cueEvents({ score, runs, context, steps }),
      ...effects.rows,
    ],
    effects,
    runs,
    motion: motionTracks({ score, speedRow, steps, runs }),
    lifetimes: {
      records: Uint32Array.from(runs, (run) => run.object.record),
      spawns: Int32Array.from(runs, (run) => run.object.spawn),
      removals: Int32Array.from(runs, (run) => run.removal),
    },
  };
}
