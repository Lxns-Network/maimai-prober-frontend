import type { Timeline } from "../chart/timeline/reader";

/** The timeline's recorded lifecycle belongs to one display speed row. */
export class BakedSpeedMismatchError extends RangeError {
  constructor(
    readonly baked: number,
    readonly requested: number,
  ) {
    super(
      `The timeline's recorded lifecycle belongs to display speed row ${baked}, not ${requested}`,
    );
    this.name = "BakedSpeedMismatchError";
  }
}

const SPEED_BOUND_SEGMENTS = ["slide", "airband", "airmodel", "motion"] as const;

/**
 * @throws BakedSpeedMismatchError when the timeline carries lifecycle rows recorded at another
 * display speed than `speedRow`.
 */
export function assertBakedSpeed(timeline: Timeline, speedRow: number): void {
  const baked = timeline.meta.defaultSpeedRow;
  if (baked === speedRow) return;
  if (SPEED_BOUND_SEGMENTS.some((kind) => timeline.count(kind) > 0))
    throw new BakedSpeedMismatchError(baked, speedRow);
}
