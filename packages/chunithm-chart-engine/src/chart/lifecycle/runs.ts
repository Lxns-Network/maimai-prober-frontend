import type { NoteScore } from "../../notes/score";
import type { LifecycleContext } from "./context";
import type { ObjectRun } from "./emissions";
import type { NoteObject } from "./objects";
import { airRun } from "./families/air";
import { airHoldRun } from "./families/airHold";
import { airLadderRun } from "./families/airLadder";
import { airSlideRun } from "./families/airSlide";
import { flickRun } from "./families/flick";
import { holdRun } from "./families/hold";
import { mineRun } from "./families/mine";
import { slideRun } from "./families/slide";
import { tapRun } from "./families/tap";

/** Thrown for a note object whose class has no lifecycle. */
export class UnsupportedNoteClassError extends RangeError {
  constructor(
    readonly className: string,
    readonly record: number,
  ) {
    super(`Record ${record} builds a ${className}, which has no lifecycle`);
    this.name = "UnsupportedNoteClassError";
  }
}

/** The run of one note object. */
export function objectRun(
  object: NoteObject,
  score: NoteScore,
  context: LifecycleContext,
): ObjectRun {
  const index = object.record;
  const record = score.records[index];
  const joints = score.slideJoints?.get(index) ?? [];
  switch (object.className) {
    case "TapNote":
    case "CharaTapNote":
      return tapRun(object, record, context);
    case "FlickNote":
      return flickRun(object, record, context);
    case "MineNote":
      return mineRun(object, record, context);
    case "HoldNote":
      return holdRun(object, record, score.ticks?.get(index) ?? [], context);
    case "SlideNote":
      return slideRun(object, record, score.ticks?.get(index) ?? [], joints, context);
    case "AirNote":
      return airRun(object, record, joints, context);
    case "AirHoldNote":
      return airHoldRun(
        object,
        record,
        {
          ticks: score.secondaryTicks?.get(index) ?? [],
          elements: score.airHolds?.get(index) ?? [],
          joints,
        },
        context,
      );
    case "AirSlideNote":
      return airSlideRun(
        object,
        record,
        {
          ticks: score.secondaryTicks?.get(index) ?? [],
          elements: score.airSlides?.get(index) ?? [],
          joints,
        },
        context,
      );
    case "AirLadderNote": {
      const ladder = score.ladders?.get(index);
      if (!ladder) throw new RangeError(`AIR LADDER record ${index} has no joints`);
      return airLadderRun(object, ladder, context);
    }
    default:
      throw new UnsupportedNoteClassError(object.className, index);
  }
}

/** The runs of every note object, in object order. */
export function lifecycleRuns(
  score: NoteScore,
  objects: readonly NoteObject[],
  context: LifecycleContext,
): ObjectRun[] {
  return objects.map((object) => objectRun(object, score, context));
}
