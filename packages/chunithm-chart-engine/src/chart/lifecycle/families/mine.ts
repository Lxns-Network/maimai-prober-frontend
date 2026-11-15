import { GROUND_MAIN_PART } from "../../bake/events";
import { SPAWN_CONSTANTS } from "../../../notes/tables";
import { AUTOPLAY_GRADE, firstStepFrom, stepFrames } from "../autoplayJudge";
import type { LifecycleContext } from "../context";
import { ACTIVE_AFTER, PHASE, type ObjectRun } from "../emissions";
import type { NoteObject } from "../objects";

/** Judge configuration offset of the MINE pass delay, in frames. */
const CONFIG_MINE_DELAY = 0x720;

/**
 * Life of a MINE object: shown when built, judged and hidden at the step its delayed frame delta
 * reaches the threshold, and removed at the next step.
 */
export function mineRun(
  object: NoteObject,
  record: DataView,
  context: LifecycleContext,
): ObjectRun {
  const active = object.spawn + ACTIVE_AFTER;
  const f = Math.fround;
  const noteFrames = f(record.getFloat32(8, true) * SPAWN_CONSTANTS.framesPerMs);
  const delay = context.config.getFloat32(CONFIG_MINE_DELAY, true);
  const { offset, threshold } = context;
  const judged = firstStepFrom(
    active,
    Math.floor(2 * (noteFrames + delay + threshold)) - 2,
    (k) => {
      const delta = f(f(f(stepFrames(k) - noteFrames) - delay) - offset);
      return f(f(delta - threshold) + offset) >= 0;
    },
  );
  return {
    object,
    removal: judged + 1,
    judges: [{ step: judged, phase: PHASE.tick, result: AUTOPLAY_GRADE, judgePhase: 0, part: 1 }],
    models: [
      { step: object.spawn, phase: PHASE.spawn, part: GROUND_MAIN_PART, shown: 1 },
      { step: judged, phase: PHASE.tick, part: GROUND_MAIN_PART, shown: 0 },
    ],
  };
}
