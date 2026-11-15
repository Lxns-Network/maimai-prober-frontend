import { GROUND_MAIN_PART } from "../../bake/events";
import { SPAWN_CONSTANTS } from "../../../notes/tables";
import { AUTOPLAY_GRADE, firstStepFrom, stepFrames } from "../autoplayJudge";
import type { LifecycleContext } from "../context";
import { ACTIVE_AFTER, PHASE, type ObjectRun } from "../emissions";
import type { NoteObject } from "../objects";

/**
 * Life of a FLICK object: shown from its first active step, judged and hidden at the step its
 * frame delta reaches the threshold, and removed at the next step.
 */
export function flickRun(
  object: NoteObject,
  record: DataView,
  context: LifecycleContext,
): ObjectRun {
  const active = object.spawn + ACTIVE_AFTER;
  const noteFrames = Math.fround(record.getFloat32(8, true) * SPAWN_CONSTANTS.framesPerMs);
  const judged = firstStepFrom(
    active,
    Math.floor(2 * (noteFrames + context.threshold)) - 2,
    (k) => Math.fround(stepFrames(k) - noteFrames) >= context.threshold,
  );
  const run: ObjectRun = {
    object,
    removal: judged + 1,
    judges: [{ step: judged, phase: PHASE.tick, result: AUTOPLAY_GRADE, judgePhase: 0, part: 1 }],
    models: [],
  };
  if (judged > active)
    run.models.push({ step: active, phase: PHASE.tick, part: GROUND_MAIN_PART, shown: 1 });
  run.models.push({ step: judged, phase: PHASE.tick, part: GROUND_MAIN_PART, shown: 0 });
  return run;
}
