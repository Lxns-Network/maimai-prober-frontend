import { PLAIN_AIR_PART } from "../../bake/events";
import { SPAWN_CONSTANTS } from "../../../notes/tables";
import { AUTOPLAY_GRADE, airChecker, firstAirStep } from "../autoplayJudge";
import type { LifecycleContext } from "../context";
import { ACTIVE_AFTER, PHASE, type ObjectRun } from "../emissions";
import type { NoteObject } from "../objects";

const HOLD = 1;
const SLIDE = 2;
const FLICK = 6;

/** Judge configuration row of an AIR on a parent of `type` going in `direction`. */
export function airRow(type: number, direction: number): number {
  return (type === HOLD || type === SLIDE ? 0 : type === FLICK ? 4 : 2) + Number(direction > 2);
}

/** Time an AIR is judged at, in milliseconds: its parent's last joint, HOLD tail or head. */
export function airTimeMs(record: DataView, joints: readonly DataView[]): number {
  const type = record.getInt32(0x10, true);
  if (type === SLIDE) {
    const last = joints[joints.length - 1];
    if (!last) throw new RangeError("An AIR on a SLIDE needs the SLIDE's joints");
    return last.getFloat32(8, true);
  }
  return record.getFloat32(type === HOLD ? 0x38 : 8, true);
}

/**
 * Life of an AIR object on its parent note: hidden when built, shown from its first active step,
 * judged and released at the step its checker settles, and removed at the next step.
 */
export function airRun(
  object: NoteObject,
  record: DataView,
  joints: readonly DataView[],
  context: LifecycleContext,
): ObjectRun {
  const active = object.spawn + ACTIVE_AFTER;
  const noteFrames = Math.fround(airTimeMs(record, joints) * SPAWN_CONSTANTS.framesPerMs);
  const checker = airChecker(
    context.config,
    airRow(record.getInt32(0x10, true), record.getInt32(0x90, true)),
    context.offset,
  );
  const judged = firstAirStep(noteFrames, checker, active);
  const run: ObjectRun = {
    object,
    removal: judged + 1,
    judges: [{ step: judged, phase: PHASE.tick, result: AUTOPLAY_GRADE, judgePhase: 0, part: 2 }],
    models: [{ step: object.spawn, phase: PHASE.spawn, part: PLAIN_AIR_PART, shown: 0 }],
  };
  if (judged > active)
    run.models.push({ step: active, phase: PHASE.tick, part: PLAIN_AIR_PART, shown: 1 });
  run.models.push({ step: judged, phase: PHASE.tick, part: PLAIN_AIR_PART, shown: 0 });
  return run;
}
