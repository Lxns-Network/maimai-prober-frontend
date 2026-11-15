import { GROUND_MAIN_PART } from "../../bake/events";
import { SPAWN_CONSTANTS } from "../../../notes/tables";
import { AUTOPLAY_GRADE, firstCommitStep, laneChecker } from "../autoplayJudge";
import type { LifecycleContext } from "../context";
import { ACTIVE_AFTER, PHASE, type ObjectRun } from "../emissions";
import type { NoteObject } from "../objects";

/** Judge configuration row of a TAP or CHR at a difficulty. */
function configRow(className: string, difficulty: number): number {
  return (className === "CharaTapNote" ? 2 : 0) + Number(difficulty >= 2);
}

/**
 * Life of a TAP or CHR object: hidden when built, shown from its first active step, judged and
 * hidden at the step its checker commits, and removed at the next step.
 */
export function tapRun(object: NoteObject, record: DataView, context: LifecycleContext): ObjectRun {
  const built = object.spawn;
  const active = built + ACTIVE_AFTER;
  const noteFrames = Math.fround(record.getFloat32(8, true) * SPAWN_CONSTANTS.framesPerMs);
  const checker = laneChecker(
    record,
    context.config,
    configRow(object.className, context.difficulty),
    context.offset,
  );
  const judged = firstCommitStep(noteFrames, checker, context.threshold, active);
  const run: ObjectRun = {
    object,
    removal: judged + 1,
    judges: [{ step: judged, phase: PHASE.tick, result: AUTOPLAY_GRADE, judgePhase: 0, part: 1 }],
    models: [{ step: built, phase: PHASE.spawn, part: GROUND_MAIN_PART, shown: 0 }],
  };
  if (judged > active)
    run.models.push({ step: active, phase: PHASE.tick, part: GROUND_MAIN_PART, shown: 1 });
  run.models.push({ step: judged, phase: PHASE.tick, part: GROUND_MAIN_PART, shown: 0 });
  return run;
}
