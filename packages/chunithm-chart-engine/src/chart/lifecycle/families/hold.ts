import { GROUND_MAIN_PART, GROUND_TAIL_PART, type JudgePhase } from "../../bake/events";
import { SPAWN_CONSTANTS } from "../../../notes/tables";
import { AUTOPLAY_GRADE, laneChecker, stepFrames } from "../autoplayJudge";
import type { LifecycleContext } from "../context";
import { ACTIVE_AFTER, PHASE, bandWriter, modelWriter, type ObjectRun } from "../emissions";
import type { NoteObject } from "../objects";

/** Head and tail state a long note sets once that end is done. */
const DONE = 4;
const CONFIG_CENTRE = 0x708;
const CONFIG_THRESHOLDS = [0x710, 0x714, 0x718, 0x71c];
const RECORD_TAIL_TIME = 0x38;
/** Judgment ticks are counted in this many frames per millisecond. */
const TICK_FRAMES_PER_MS = Math.fround(0.06);

/** Judge configuration row of a long note's head checker at a difficulty. */
export function longHeadRow(record: DataView, difficulty: number): number {
  return (record.getUint8(0x8c) !== 0 ? 2 : 0) + Number(difficulty >= 2);
}

/**
 * Life of a HOLD object. From its first active step the head checker commits the head, the tail
 * checker starts once the head time is reached and judges one due tick per step, and the object is
 * hidden and removed once both ends are done. Each active step frames the band and shows the head
 * until it is judged and the tail until it is done.
 */
export function holdRun(
  object: NoteObject,
  record: DataView,
  ticks: readonly DataView[],
  context: LifecycleContext,
): ObjectRun {
  const f = Math.fround;
  const { config, offset, threshold } = context;
  const noteFrames = f(record.getFloat32(8, true) * SPAWN_CONSTANTS.framesPerMs);
  const head = laneChecker(record, config, longHeadRow(record, context.difficulty), offset);
  const tailStart = f(noteFrames + offset);
  const centre = config.getFloat32(CONFIG_CENTRE, true);
  const holdEarly = f(centre + head.early);
  const holdEnd = f(
    f(
      f(record.getFloat32(RECORD_TAIL_TIME, true) * TICK_FRAMES_PER_MS) -
        f(record.getFloat32(8, true) * TICK_FRAMES_PER_MS),
    ) + centre,
  );
  const thresholds = CONFIG_THRESHOLDS.map((at) => config.getFloat32(at, true));
  /** One held tail check; -1 before the early bound, else the index of the gap's threshold. */
  const holdCheck = (delta: number): number => {
    if (holdEarly > delta) return -1;
    const at = Math.min(holdEnd, delta);
    const gap = f(at - Math.max(at, centre));
    const index = thresholds.findIndex((value) => value >= gap);
    return index === -1 ? thresholds.length : index;
  };

  const run: ObjectRun = {
    object,
    removal: -1,
    judges: [],
    models: [],
    band: { kind: "band", frames: [], ends: [] },
  };
  const model = modelWriter(run.models);
  const frame = bandWriter(run.band!);
  model(object.spawn, PHASE.spawn, GROUND_MAIN_PART, 0);
  model(object.spawn, PHASE.spawn, GROUND_TAIL_PART, 0);
  const judge = (step: number, judgePhase: JudgePhase) =>
    run.judges.push({ step, phase: PHASE.tick, result: AUTOPLAY_GRADE, judgePhase, part: 1 });
  const pending = [...ticks];
  let headState = 0;
  let tailState = 0;
  for (let k = object.spawn + ACTIVE_AFTER; ; k++) {
    const now = stepFrames(k);
    if (headState !== DONE) {
      const delta = f(now - noteFrames);
      const commits = !(head.early > delta) && (delta >= threshold || !(delta < head.late));
      if (commits) {
        judge(k, 0);
        headState = DONE;
      } else headState = 0;
    }
    if (tailState !== DONE) {
      if (head.early > now) tailState = 0;
      else {
        const started = tailStart <= now;
        const result = holdCheck(f(now - tailStart));
        if (started) {
          const tick = pending[0];
          if (tick && !(now < f(f(tick.getFloat32(8, true) * TICK_FRAMES_PER_MS) + offset))) {
            if (tick.getUint8(0x14)) judge(k, tick.getInt32(0x10, true) === 1 ? 2 : 1);
            pending.shift();
          }
          tailState = pending.length ? (result === 0 ? 2 : 3) : DONE;
        } else tailState = 0;
      }
    }
    if (headState === DONE && tailState === DONE) {
      model(k, PHASE.tick, GROUND_MAIN_PART, 0);
      model(k, PHASE.tick, GROUND_TAIL_PART, 0);
      run.band!.ends.push(k);
      run.removal = k + 1;
      return run;
    }
    model(k, PHASE.tick, GROUND_MAIN_PART, headState !== DONE ? 1 : 0);
    model(k, PHASE.tick, GROUND_TAIL_PART, tailState !== DONE ? 1 : 0);
    frame(
      k,
      PHASE.tick,
      tailState === 2 ? 1 : headState === DONE ? (tailState === 3 ? 1 : 0) + 1 : 0,
    );
  }
}
