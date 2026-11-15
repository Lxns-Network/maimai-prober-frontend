import { GROUND_MAIN_PART, slideJointPart, type JudgePhase } from "../../bake/events";
import { SPAWN_CONSTANTS } from "../../../notes/tables";
import { AUTOPLAY_GRADE, laneChecker, stepFrames } from "../autoplayJudge";
import type { LifecycleContext } from "../context";
import { ACTIVE_AFTER, PHASE, bandWriter, modelWriter, type ObjectRun } from "../emissions";
import type { NoteObject } from "../objects";
import { longHeadRow } from "./hold";

/** Head and tail state a long note sets once that end is done. */
const DONE = 4;
const CONFIG_CENTRE = 0x708;
const CONFIG_THRESHOLDS = [0x710, 0x714, 0x718, 0x71c];
/** Judge configuration rows of the slide windows, one per joint width. */
const CONFIG_SLIDE_WINDOWS = 0x730;
const CONFIG_SLIDE_ROW_BYTES = 20;
const RECORD_TAIL_TIME = 0x38;
const TICK_FRAMES_PER_MS = Math.fround(0.06);
/** Results a joint mark below this count hide the joint. */
const JUDGE_RESULT_COUNT = 5;
const UNMARKED = 255;

/** Judgment phase of a SLIDE tick's kind. */
function tickPhase(kind: number): JudgePhase {
  if (kind === 2 || kind === 3) return 1;
  if (kind === 4) return 2;
  throw new RangeError(`SLIDE tick kind ${kind}`);
}

/**
 * Life of a SLIDE object. The head is judged like a HOLD's; once the tail opens, one due tick is
 * judged per step and each joint is marked, and so hidden, at the first step its end is reached.
 * Each active step shows the head until it is judged and every joint model until it is marked, and
 * frames the slide band; both ends done hides everything and the object is removed the next step.
 */
export function slideRun(
  object: NoteObject,
  record: DataView,
  ticks: readonly DataView[],
  joints: readonly DataView[],
  context: LifecycleContext,
): ObjectRun {
  if (!joints.length) throw new RangeError(`SLIDE record ${object.record} has no joints`);
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
  const holdCheck = (delta: number): number => {
    if (holdEarly > delta) return -1;
    const at = Math.min(holdEnd, delta);
    const gap = f(at - Math.max(at, centre));
    const index = thresholds.findIndex((value) => value >= gap);
    return index === -1 ? thresholds.length : index;
  };
  const firstWidth = record.getInt32(0x2c, true) + 1;
  const gate = f(
    f(
      config.getFloat32(
        CONFIG_SLIDE_WINDOWS + CONFIG_SLIDE_ROW_BYTES * (16 - firstWidth) + 4,
        true,
      ) + offset,
    ) + noteFrames,
  );
  const ends = joints.map((joint) =>
    f(f(joint.getFloat32(8, true) * SPAWN_CONSTANTS.framesPerMs) + offset),
  );
  const modelled = joints.map((joint, k) => k === joints.length - 1 || joint.getUint8(0x14) !== 0);
  const marks = joints.map(() => UNMARKED);

  const run: ObjectRun = {
    object,
    removal: -1,
    judges: [],
    models: [],
    band: { kind: "slide", frames: [], ends: [] },
  };
  const model = modelWriter(run.models);
  const frame = bandWriter(run.band!);
  model(object.spawn, PHASE.spawn, GROUND_MAIN_PART, 0);
  const judge = (step: number, judgePhase: JudgePhase) =>
    run.judges.push({ step, phase: PHASE.tick, result: AUTOPLAY_GRADE, judgePhase, part: 1 });
  const pending = [...ticks];
  let headState = 0;
  let tailState = 0;
  for (let k = object.spawn + ACTIVE_AFTER; ; k++) {
    const now = stepFrames(k);
    if (headState !== DONE) {
      const delta = f(now - noteFrames);
      if (!(head.early > delta) && (delta >= threshold || !(delta < head.late))) {
        judge(k, 0);
        headState = DONE;
      } else headState = 0;
    }
    if (tailState !== DONE) {
      if (gate > now) tailState = 0;
      else {
        const held = holdCheck(f(now - tailStart)) === 0;
        if (now < tailStart) tailState = 0;
        else {
          let last = 0;
          const tick = pending[0];
          if (tick && !(now < f(f(tick.getFloat32(8, true) * TICK_FRAMES_PER_MS) + offset))) {
            last = AUTOPLAY_GRADE;
            if (tick.getUint8(0x14)) judge(k, tickPhase(tick.getInt32(0x10, true)));
            pending.shift();
          }
          marks.forEach((mark, j) => {
            if (mark < JUDGE_RESULT_COUNT || ends[j] > now) return;
            marks[j] = modelled[j] ? last : DONE;
          });
          tailState = pending.length ? (held ? 2 : 3) : DONE;
        }
      }
    }
    if (headState === DONE && tailState === DONE) {
      model(k, PHASE.tick, GROUND_MAIN_PART, 0);
      modelled.forEach((has, j) => {
        if (has) model(k, PHASE.tick, slideJointPart(j), 0);
      });
      run.band!.ends.push(k);
      run.removal = k + 1;
      return run;
    }
    model(k, PHASE.tick, GROUND_MAIN_PART, headState !== DONE ? 1 : 0);
    modelled.forEach((has, j) => {
      if (has) model(k, PHASE.tick, slideJointPart(j), marks[j] < JUDGE_RESULT_COUNT ? 0 : 1);
    });
    frame(
      k,
      PHASE.tick,
      tailState === 2 ? 1 : headState === DONE ? (tailState === 3 ? 1 : 0) + 1 : 0,
    );
  }
}
