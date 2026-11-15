/**
 * AIR ladder element models: the marker drawn at each sample of a ladder until that sample is judged.
 *
 * A sample freezes its model, lane, height and region key at construction; per frame only the depth
 * changes. Whether a marker is currently shown is a lifecycle fact the bake observes, so it is read
 * from the model states rather than recomputed.
 */

import type { ModelPlan } from "./evaluate";
import { writeMatrix } from "./matrix";
import { placementScale } from "./placement";
import { depthAt } from "./space";
import { exact, mul, round, sub, toF32 } from "./stripFloat";
import { effectiveTime, type NoteTimelineScore } from "./timing";

/** Model sets of the first sample and of every later sample, by width index. */
const FIRST: readonly number[] = [
  407, 406, 405, 404, 403, 402, 401, 400, 399, 398, 397, 396, 395, 394, 393, 392,
];
const REST: readonly number[] = [
  389, 388, 387, 386, 385, 384, 383, 382, 381, 380, 379, 378, 377, 376, 375, 374,
];
/** The marker model tables, exposed so they can be compared against their source. */
export const LADDER_MODEL_TABLES = Object.freeze({ first: FIRST, rest: REST });
const f = Math.fround;
const FRAMES_PER_MS = 0.05999999865889549;
const BEATS_PER_GROUP = 4;
const POSITION_EPSILON = 0.0052083334885537624;
const LANE_TOLERANCE = 0.000009999999747378752;
const WIDTH_BIAS = 0.9990000128746033;
const HEIGHT_BASE = 1;
const HEIGHT_SCALE = 3.8934998512268066;
const HEIGHT_OFFSET = 0.14999961853027344;
const LANE_OFFSET = exact(8);
const LANE_SCALE = exact(4);

export interface LadderElementPlan {
  model: ModelPlan;
  x: number;
  y: number;
  sx: number;
  /** Lane width of the sample, which the draw key's width priority is computed from. */
  width: number;
  timelineKey: number;
  timeFrames: number;
}

export function ladderWidthIndex(width: number): number {
  const n = (Math.trunc(f(width + WIDTH_BIAS)) - 1) | 0;
  return n < 0 ? 0 : n >= 15 ? 15 : n;
}

const beat = (view: DataView, at: number) =>
  f(f(view.getFloat32(at, true) * BEATS_PER_GROUP) + view.getFloat32(at + 4, true));

/** The region key a sample is retimed by; lane and width are the sample's own float values. */
export function ladderRegionKey(
  regions: readonly DataView[],
  position: DataView,
  lane: number,
  width: number,
  widthOf: (index: number) => number,
): number {
  const at = f(beat(position, 0) + POSITION_EPSILON);
  let key = 0;
  for (const r of regions) {
    const k = r.getInt32(0x70, true);
    const x = f(r.getInt32(0x28, true));
    const w = widthOf(r.getInt32(0x2c, true));
    if (!(key < k)) continue;
    if (!(at >= beat(r, 0))) continue;
    if (at >= beat(r, 0x30)) continue;
    if (-LANE_TOLERANCE > f(lane - x)) continue;
    if (!(f(f(lane + width) - f((r.getInt32(0x28, true) + w) | 0)) > LANE_TOLERANCE)) key = k;
  }
  return key;
}

export const effectLane = (lane: number): number =>
  toF32(round(mul(round(sub(exact(lane), LANE_OFFSET), 64), LANE_SCALE), 64));
export const heightY = (h: number): number =>
  f(f(f(h - HEIGHT_BASE) * HEIGHT_SCALE) + HEIGHT_OFFSET);

/** Plans each sample's marker; a sample whose model set is the empty id has none. */
export function planLadderElements(
  samples: readonly DataView[],
  context: {
    regions: readonly DataView[];
    model: (id: number) => ModelPlan;
    widthOf: (index: number) => number;
  },
): (LadderElementPlan | null)[] {
  return samples.map((sample, k) => {
    const lane = sample.getFloat32(0x10, true);
    const width = sample.getFloat32(0x18, true);
    const id = (k === 0 ? FIRST : REST)[ladderWidthIndex(width)];
    if (id === 0) return null;
    const model = context.model(id);
    return {
      model,
      x: effectLane(f(f(width * 0.5) + lane)),
      y: heightY(sample.getFloat32(0x14, true)),
      sx: placementScale(width, model.units),
      width,
      timelineKey: ladderRegionKey(context.regions, sample, lane, width, context.widthOf),
      timeFrames: f(f(sample.getFloat32(8, true)) * FRAMES_PER_MS),
    };
  });
}

/** Writes one marker's matrix at the manager's current time. */
export function ladderElementMatrix(
  element: LadderElementPlan,
  state: DataView,
  score: NoteTimelineScore,
  nowFrames: number,
  out: Float32Array,
): number {
  const te = effectiveTime(state, score, element.timelineKey, element.timeFrames);
  const z = depthAt(state, f(te - nowFrames), 1, 1, score.scroll);
  writeMatrix(out, 0, element.x, element.y, z, element.sx, 1, 1);
  return z;
}
