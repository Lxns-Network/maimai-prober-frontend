import type { JudgePhase } from "../../bake/events";
import { SPAWN_CONSTANTS } from "../../../notes/tables";
import { AUTOPLAY_GRADE, airChecker, stepFrames, type AirChecker } from "../autoplayJudge";
import type { LifecycleContext } from "../context";
import { ACTIVE_AFTER, PHASE, bandWriter, modelWriter, type ObjectRun } from "../emissions";
import type { NoteObject } from "../objects";
import { airRow } from "./air";
import type { AirHoldVectors } from "./airHold";

/** Head and node state an AIR SLIDE sets once that part is done. */
const DONE = 5;
const CONFIG_HOLD_CENTRE = 0x87c;
const CONFIG_HOLD_THRESHOLDS = [0x888, 0x88c, 0x890, 0x894];
/** AIR checker row every AIR SLIDE element judges with. */
const ELEMENT_ROW = 6;
const RECORD_END_TIME = 0x20;
const RECORD_HOLD_TAIL_TIME = 0x38;
const HOLD = 1;
const SLIDE = 2;

/** Part code of an AIR SLIDE's head handle in `airmodel` events. */
export const AIR_SLIDE_HEAD_PART = 0xffff;
const elementPart = (element: number, model: number) => element * 2 + model;

const settles = (checker: AirChecker, delta: number) =>
  !(checker.early >= delta) && !(checker.centre > delta);

/**
 * Life of an AIR SLIDE object. Its head settles like an AIR; once the slide opens, one due tick and
 * one settled element are judged per step. Each active step shows the head until it is judged and
 * every judged-kind element's two models until that element is judged, and frames the band with
 * the hold check's tint; both done releases every model and the object is removed the next step.
 */
export function airSlideRun(
  object: NoteObject,
  record: DataView,
  vectors: AirHoldVectors,
  context: LifecycleContext,
): ObjectRun {
  const f = Math.fround;
  const K = SPAWN_CONSTANTS.framesPerMs;
  const { config, offset } = context;
  const type = record.getInt32(0x10, true);
  let noteMs: number;
  if (type === SLIDE) {
    const last = vectors.joints[vectors.joints.length - 1];
    if (!last) throw new RangeError("An AIR SLIDE on a SLIDE needs the SLIDE's joints");
    noteMs = last.getFloat32(8, true);
  } else if (type === HOLD) noteMs = record.getFloat32(RECORD_HOLD_TAIL_TIME, true);
  else if (type === 0 || type === 4 || type === 6 || type === 11)
    noteMs = record.getFloat32(8, true);
  else throw new RangeError(`AIR SLIDE on a parent of type ${type}`);
  if (!vectors.elements.length)
    throw new RangeError(`AIR SLIDE record ${object.record} has no joints`);
  const noteFrames = f(noteMs * K);
  const head = airChecker(config, airRow(type, record.getInt32(0x90, true)), offset);
  const centre = config.getFloat32(CONFIG_HOLD_CENTRE, true);
  const holdEarly = f(centre + head.early);
  const holdEnd = f(
    f(
      f(record.getFloat32(RECORD_END_TIME, true) * K) -
        f(record.getFloat32(RECORD_HOLD_TAIL_TIME, true) * K),
    ) + centre,
  );
  const thresholds = CONFIG_HOLD_THRESHOLDS.map((at) => config.getFloat32(at, true));
  const holdCheck = (x: number): number => {
    if (holdEarly > x) return -1;
    const at = Math.min(holdEnd, x);
    const gap = f(at - Math.max(at, centre));
    const index = thresholds.findIndex((value) => value >= gap);
    return index === -1 ? thresholds.length : index;
  };
  const judged = vectors.elements.flatMap((joint, k) => (joint.getUint8(0x14) ? [k] : []));
  const elementTimes = judged.map((k) => f(vectors.elements[k].getFloat32(8, true) * K));
  const elementChecker = airChecker(config, ELEMENT_ROW, offset);
  const done = judged.map(() => false);

  const run: ObjectRun = {
    object,
    removal: -1,
    judges: [],
    models: [],
    band: { kind: "airband", frames: [], ends: [] },
  };
  const model = modelWriter(run.models);
  const frame = bandWriter(run.band!);
  const all = (step: number, phase: (typeof PHASE)["spawn" | "tick"]) => {
    model(step, phase, AIR_SLIDE_HEAD_PART, 0);
    for (const k of judged) {
      model(step, phase, elementPart(k, 0), 0);
      model(step, phase, elementPart(k, 1), 0);
    }
  };
  all(object.spawn, PHASE.spawn);
  const judge = (step: number, judgePhase: JudgePhase, element?: true) =>
    run.judges.push({
      step,
      phase: PHASE.tick,
      result: AUTOPLAY_GRADE,
      judgePhase,
      part: 2,
      ...(element && { element }),
    });
  const pending = [...vectors.ticks];
  let element = 0;
  let headState = 0;
  let nodeState = 0;
  for (let k = object.spawn + ACTIVE_AFTER; ; k++) {
    const now = stepFrames(k);
    if (headState !== DONE && settles(head, f(now - noteFrames))) {
      judge(k, 0);
      headState = DONE;
    }
    if (nodeState !== DONE) {
      const t = f(now - centre);
      if (f(noteFrames + head.early) > t) nodeState = 0;
      else {
        const level = holdCheck(f(t - noteFrames));
        if (noteFrames > t) nodeState = 0;
        else {
          nodeState = level === 0 ? 3 : 4;
          const tick = pending[0];
          if (tick && t >= f(f(tick.getFloat32(8, true) * K) + offset)) {
            if (tick.getUint8(0x14)) judge(k, 1);
            pending.shift();
          }
          if (element < judged.length && settles(elementChecker, f(now - elementTimes[element]))) {
            const last = vectors.elements.length - 1;
            judge(k, judged[element] === last ? 2 : 1, true);
            done[element++] = true;
          }
          if (!pending.length && element === judged.length) {
            nodeState = DONE;
            run.soundStop = k;
          }
        }
      }
    }
    if (headState === DONE && nodeState === DONE) {
      all(k, PHASE.tick);
      run.band!.ends.push(k);
      run.removal = k + 1;
      return run;
    }
    model(k, PHASE.tick, AIR_SLIDE_HEAD_PART, headState !== DONE ? 1 : 0);
    judged.forEach((e, i) => {
      model(k, PHASE.tick, elementPart(e, 0), done[i] ? 0 : 1);
      model(k, PHASE.tick, elementPart(e, 1), done[i] ? 0 : 1);
    });
    frame(k, PHASE.tick, nodeState === 3 ? 1 : nodeState === 4 ? 2 : 0);
  }
}
