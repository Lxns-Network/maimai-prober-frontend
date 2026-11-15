/**
 * AIR HOLD parts: the head marker, the plain model, the body, the tail body and the element markers.
 *
 * An AIR HOLD hangs off a tap, hold, slide, character tap or mine record. Construction freezes every
 * placement; per frame only the depths change. Which parts are shown, and the body tint, are
 * lifecycle facts the bake observes, so they are read from the timeline rather than recomputed.
 */

import { AIR_PARENT_KIND, effectiveMinusNow } from "./airSlideParts";
import { regionKeyAt } from "./bandFrame";
import type { ModelPlan } from "./evaluate";
import { widthIndex } from "./matrix";
import { placementScale } from "./placement";
import type { NoteScore } from "./score";
import { depthAt, lanePosition } from "./space";
import { NOTE_WIDTHS } from "./tables";
import { effectiveTime, type NoteTimelineScore } from "./timing";

const f = Math.fround;
const FRAMES_PER_MS = 0.05999999865889549;
export const AIR_HOLD_ELEMENT_Y = 15.723999977111816;
const BODY_OFFSET = 9.999999747378752e-5;
const HEIGHT_FACTOR = 0.25;

/** Part codes in the model states; elements use `node * 2 + sub`. */
export const AIR_HOLD_PART = Object.freeze({
  head: 0xfffe,
  body: 0xfffd,
  tail: 0xfffc,
  plain: 0xfffb,
});

const byWidth = (first: number): readonly number[] =>
  Object.freeze(Array.from({ length: 16 }, (_, index) => first - index));
const HEAD = byWidth(161);
const BODY = byWidth(323);
const ELEMENT_FIRST = byWidth(357);
const ELEMENT_SECOND = byWidth(373);
const PLAIN_MODEL = 306;
const TAIL_MODEL = 307;

const widthOf = (index: number) => (index >= 0 && index < 16 ? NOTE_WIDTHS[index] : 0);
const frames = (ms: number) => f(f(ms) * FRAMES_PER_MS);

export interface AirHoldElementPlan {
  k: number;
  models: readonly [ModelPlan, ModelPlan];
  timelineKey: number;
  timeFrames: number;
}

export interface AirHoldPlan {
  head: ModelPlan;
  plain: ModelPlan;
  body: ModelPlan;
  tail: ModelPlan;
  x: number;
  sx: number;
  width: number;
  headKey: number;
  headFrames: number;
  tailKey: number;
  tailFrames: number;
  elements: readonly AirHoldElementPlan[];
}

/** Freezes the placements of the AIR HOLD attached to `record`. */
export function planAirHold(
  record: DataView,
  index: number,
  score: NoteScore,
  regions: readonly DataView[],
  context: { model: (id: number) => ModelPlan },
): AirHoldPlan {
  const type = record.getInt32(0x10, true);
  const kind = type >= 0 && type < AIR_PARENT_KIND.length ? AIR_PARENT_KIND[type] : 3;
  let lane = record.getInt32(0x28, true);
  let width = widthOf(record.getInt32(0x2c, true));
  let headTime: number;
  let headKey: number;
  if (kind === 0) {
    headTime = record.getFloat32(8, true);
    headKey = record.getInt32(0x70, true);
  } else if (kind === 1) {
    headTime = record.getFloat32(0x38, true);
    headKey = record.getInt32(0x74, true);
  } else if (kind === 2) {
    const chain = score.slideJoints?.get(index);
    if (!chain?.length) throw new RangeError("AIR HOLD record " + index + " has no parent joints");
    const last = chain[chain.length - 1];
    headTime = last.getFloat32(8, true);
    lane = last.getInt32(0x10, true);
    width = widthOf(last.getInt32(0x20, true));
    headKey = record.getInt32(0x74, true);
  } else
    throw new RangeError("AIR HOLD record " + index + " sits on unsupported parent type " + type);

  const slot = widthIndex(width);
  const head = context.model(HEAD[slot]);
  const tailPosition = new DataView(record.buffer, record.byteOffset + 0x18, 12);
  const tailFrames = frames(record.getFloat32(0x20, true));
  const tailKey = regionKeyAt(regions, tailPosition, lane, width);
  const joints = score.airHolds?.get(index);
  if (!joints) throw new RangeError("AIR HOLD record " + index + " has no element vector");
  const count = joints.length + (record.getUint8(0x24) !== 0 ? 1 : 0);
  const pair = [context.model(ELEMENT_FIRST[slot]), context.model(ELEMENT_SECOND[slot])] as const;
  const elements: AirHoldElementPlan[] = [];
  for (let k = 0; k < count; k++) {
    const joint = k < joints.length ? joints[k] : null;
    elements.push({
      k,
      models: pair,
      timelineKey: joint ? regionKeyAt(regions, joint, lane, width) : tailKey,
      timeFrames: joint ? frames(joint.getFloat32(8, true)) : tailFrames,
    });
  }
  return {
    head,
    plain: context.model(PLAIN_MODEL),
    body: context.model(BODY[slot]),
    tail: context.model(TAIL_MODEL),
    x: lanePosition(lane, f(width)),
    sx: placementScale(width, head.units),
    width,
    headKey,
    headFrames: frames(headTime),
    tailKey,
    tailFrames,
    elements,
  };
}

/** The depths of one frame: the head, the far edge and height of the body, and each element. */
export interface AirHoldFrame {
  head: number;
  top: number;
  height: number;
  elements: Float64Array;
}

export function createAirHoldFrame(): AirHoldFrame {
  return { head: 0, top: 0, height: 0, elements: new Float64Array(0) };
}

/** The observed lifecycle state the depths depend on. */
export interface AirHoldVisibility {
  /** Whether the head has been judged while the body is still shown. */
  headDone: boolean;
  elementShown(k: number): boolean;
}

/** Computes the depths of one frame at the time `nowFrames`, which the state must also hold. */
export function airHoldFrame(
  plan: AirHoldPlan,
  state: DataView,
  score: NoteTimelineScore,
  nowFrames: number,
  visibility: AirHoldVisibility,
  out: AirHoldFrame,
): void {
  if (out.elements.length < plan.elements.length)
    out.elements = new Float64Array(plan.elements.length);
  out.head = depthAt(
    state,
    effectiveMinusNow(state, score, plan.headKey, plan.headFrames),
    1,
    1,
    score.scroll,
  );
  const depthOf = (key: number, time: number) =>
    depthAt(state, f(effectiveTime(state, score, key, time) - nowFrames), 1, 1, score.scroll);
  const first = depthOf(plan.headKey, plan.headFrames);
  let low = first;
  let high = first;
  let ahead = f(plan.tailFrames - nowFrames) > 0;
  const include = (value: number) => {
    if (!(value > low)) low = value;
    if (!(high > value)) high = value;
  };
  include(depthOf(plan.tailKey, plan.tailFrames));
  for (const element of plan.elements) {
    if (!visibility.elementShown(element.k)) {
      out.elements[element.k] = NaN;
      continue;
    }
    if (f(element.timeFrames - nowFrames) > 0) ahead = true;
    const depth = depthOf(element.timelineKey, element.timeFrames);
    out.elements[element.k] = depth;
    include(depth);
  }
  if (ahead && visibility.headDone) include(depthAt(state, 0, 1, 1, score.scroll));
  out.top = high;
  out.height = f(f(high - low) * HEIGHT_FACTOR);
}

export function airHoldHeadMatrix(plan: AirHoldPlan, frame: AirHoldFrame, out: Float32Array): void {
  out.set([plan.sx, 0, 0, plan.x, 0, 1, 0, 0, 0, 0, 1, frame.head]);
}

export function airHoldPlainMatrix(
  plan: AirHoldPlan,
  frame: AirHoldFrame,
  out: Float32Array,
): void {
  out.set([1, 0, 0, plan.x, 0, 1, 0, 0, 0, 0, 1, frame.head]);
}

export function airHoldElementMatrix(
  plan: AirHoldPlan,
  frame: AirHoldFrame,
  k: number,
  out: Float32Array,
): void {
  const depth = frame.elements[k];
  const x0 = f(plan.x * 0);
  const z0 = f(depth * 0);
  out.set([
    plan.sx,
    0,
    0,
    f(z0 + plan.x),
    0,
    1,
    0,
    f(f(x0 + AIR_HOLD_ELEMENT_Y) + z0),
    0,
    0,
    1,
    f(x0 + depth),
  ]);
}

export function airHoldBodyMatrix(plan: AirHoldPlan, frame: AirHoldFrame, out: Float32Array): void {
  out.set([plan.sx, 0, 0, f(plan.x + BODY_OFFSET), 0, 1, 0, 0, 0, 0, frame.height, frame.top]);
}

export function airHoldTailMatrix(plan: AirHoldPlan, frame: AirHoldFrame, out: Float32Array): void {
  out.set([1, 0, 0, f(plan.x + BODY_OFFSET), 0, 1, 0, 0, 0, 0, frame.height, frame.top]);
}
