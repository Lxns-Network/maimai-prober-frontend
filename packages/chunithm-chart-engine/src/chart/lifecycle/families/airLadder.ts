import { SPAWN_CONSTANTS } from "../../../notes/tables";
import { AUTOPLAY_GRADE, airChecker, stepFrames, type AirChecker } from "../autoplayJudge";
import type { LifecycleContext } from "../context";
import { ACTIVE_AFTER, PHASE, bandWriter, modelWriter, type ObjectRun } from "../emissions";
import type { NoteObject } from "../objects";

/** AIR checker row every AIR LADDER element judges with. */
const ELEMENT_ROW = 7;

/** Inputs an AIR LADDER reads: its chain of joints and its element samples. */
export interface AirLadderVectors {
  joints: readonly DataView[];
  samples: readonly DataView[];
}

const settles = (checker: AirChecker, delta: number) =>
  !(checker.early >= delta) && !(checker.centre > delta);

/**
 * Life of an AIR LADDER object. Each active step judges every element whose checker settles, then
 * shows each element until it is judged and frames the band; once every element is judged and the
 * last joint's time is reached, every model is released and the object is removed the next step.
 */
export function airLadderRun(
  object: NoteObject,
  vectors: AirLadderVectors,
  context: LifecycleContext,
): ObjectRun {
  const f = Math.fround;
  const K = SPAWN_CONSTANTS.framesPerMs;
  const last = vectors.joints[vectors.joints.length - 1];
  if (!last) throw new RangeError(`AIR LADDER record ${object.record} has no joints`);
  const endFrames = f(last.getFloat32(8, true) * K);
  const times = vectors.samples.map((sample) => f(sample.getFloat32(8, true) * K));
  const checker = airChecker(context.config, ELEMENT_ROW, context.offset);
  const judged = times.map(() => false);
  let remaining = times.length;

  const run: ObjectRun = {
    object,
    removal: -1,
    judges: [],
    models: [],
    band: { kind: "airband", frames: [], ends: [] },
  };
  const model = modelWriter(run.models);
  const frame = bandWriter(run.band!);
  const models = (
    step: number,
    phase: (typeof PHASE)["spawn" | "tick"],
    shown: (k: number) => 0 | 1,
  ) => times.forEach((_t, part) => model(step, phase, part, shown(part)));
  models(object.spawn, PHASE.spawn, () => 0);
  for (let k = object.spawn + ACTIVE_AFTER; ; k++) {
    const now = stepFrames(k);
    if (remaining)
      times.forEach((time, e) => {
        if (judged[e] || !settles(checker, f(now - time))) return;
        judged[e] = true;
        remaining--;
        run.judges.push({
          step: k,
          phase: PHASE.tick,
          result: AUTOPLAY_GRADE,
          judgePhase: 1,
          part: 1,
        });
      });
    if (!remaining && !(endFrames > now)) {
      models(k, PHASE.tick, () => 0);
      run.band!.ends.push(k);
      run.removal = k + 1;
      return run;
    }
    models(k, PHASE.tick, (e) => (judged[e] ? 0 : 1));
    frame(k, PHASE.tick, 0);
  }
}
