/**
 * AIR slide parts: the head marker, the node markers and the three-layer band of an AIR slide.
 *
 * An AIR slide hangs off a tap, hold, slide, character tap or mine record and follows its own chain
 * of joints. Construction freezes every placement; per frame only the depths change. Which parts are
 * currently shown, and the band mode, are lifecycle facts the bake observes, so they are read from
 * the timeline rather than recomputed.
 */

import type { Pack } from "../assets/packFormat";
import type { Timeline } from "../chart/timeline/reader";
import type { AirPoint } from "./airBand";
import { createAirBandAssembler, type AirBandPlan } from "./airBandAssembler";
import { regionKeyAt, regionRecords } from "./bandFrame";
import { bandOrderOf } from "./bandOrder";
import type { ModelPlan } from "./evaluate";
import { widthIndex, writeMatrix } from "./matrix";
import { placementScale } from "./placement";
import type { NoteScore } from "./score";
import { depthAt, lanePosition } from "./space";
import { add, exact, mul, round, sub, toF32 } from "./stripFloat";
import { NOTE_WIDTHS } from "./tables";
import { effectiveTime, timelineIntegral, toMs, type NoteTimelineScore } from "./timing";

const f = Math.fround;
const FRAMES_PER_MS = 0.05999999865889549;
const HEIGHT_STEP = 0.10000000149011612;
const NODE_TAIL_SCALE = 0.06359704583883286;
const HEAD_HEIGHT_SCALE = 0.06420958042144775;
const HEIGHT_BASE = 1;
const HEIGHT_SCALE = 3.8934998512268066;
const HEIGHT_OFFSET = 0.14999961853027344;
/** Part index of the head in the model states. */
export const AIR_SLIDE_HEAD_PART = 0xffff;

/** Head model set by width index and colour variant, three entries per width. */
const HEAD: readonly number[] = [
  161, 225, 161, 160, 224, 160, 159, 223, 159, 158, 222, 158, 157, 221, 157, 156, 220, 156, 155,
  219, 155, 154, 218, 154, 153, 217, 153, 152, 216, 152, 151, 215, 151, 150, 214, 150, 149, 213,
  149, 148, 212, 148, 147, 211, 147, 146, 210, 146,
];
const NODE_FIRST: readonly number[] = [
  357, 356, 355, 354, 353, 352, 351, 350, 349, 348, 347, 346, 345, 344, 343, 342,
];
const NODE_SECOND: readonly number[] = [
  373, 372, 371, 370, 369, 368, 367, 366, 365, 364, 363, 362, 361, 360, 359, 358,
];
/** Band resource per layer, three colour variants per layer. */
const BAND_RESOURCES: readonly number[] = [7, 9, 11, 4, 4, 4, 8, 10, 12];
const BAND_PRIMITIVES = [3, 3, 2] as const;
/** The model and resource tables, exposed so they can be compared against their source. */
export const AIR_SLIDE_MODEL_TABLES = Object.freeze({
  head: HEAD,
  nodeFirst: NODE_FIRST,
  nodeSecond: NODE_SECOND,
  bandResources: BAND_RESOURCES,
});
/** What each parent primitive type contributes: 0 head position, 1 hold tail, 2 slide last joint, 3 none. */
export const AIR_PARENT_KIND: readonly number[] = [0, 1, 2, 3, 0, 3, 0, 3, 3, 3, 3, 0];

const colourOf = (w: number) => (w <= 1 ? 0 : Math.min(w, 16) - 1);
const widthOf = (index: number) => (index >= 0 && index < 16 ? NOTE_WIDTHS[index] : 0);
const frames = (ms: number) => f(f(ms) * FRAMES_PER_MS);
const heightY = (h: number) => f(f(f(h - HEIGHT_BASE) * HEIGHT_SCALE) + HEIGHT_OFFSET);
const headHeight = (h: number) =>
  toF32(
    round(
      mul(
        round(mul(round(add(exact(h), exact(-HEIGHT_BASE)), 64), exact(HEIGHT_SCALE)), 64),
        exact(HEAD_HEIGHT_SCALE),
      ),
      64,
    ),
  );

/** Effective time less the current time, evaluated in extended precision. */
export function effectiveMinusNow(
  state: DataView,
  score: NoteTimelineScore,
  key: number,
  time: number,
): number {
  const now = state.getFloat32(0x300, true);
  const integral = timelineIntegral(score, key, toMs(now), toMs(f(time)));
  const product = integral * FRAMES_PER_MS;
  const magnitude = Math.abs(now);
  if (
    Number.isFinite(now) &&
    (product === 0 ||
      now === 0 ||
      (product > 0 === now > 0 &&
        Math.abs(product) >= magnitude * 0.5 &&
        Math.abs(product) <= magnitude * 2))
  ) {
    const difference = product - now;
    const value = f(difference);
    if (
      !Number.isFinite(value) ||
      (difference !== 0 && (value === 0 || Math.abs(value) < 2 ** -126))
    )
      throw new RangeError("f32 subnormal/overflow result outside the supported domain");
    return value === 0 ? 0 : value;
  }
  const effective = round(mul(exact(integral), exact(FRAMES_PER_MS)), 64);
  return toF32(round(sub(effective, exact(now)), 64));
}

export interface AirSlideHeadPlan {
  model: ModelPlan;
  x: number;
  sx: number;
  sy: number;
  width: number;
  timelineKey: number;
  timeFrames: number;
}

export interface AirSlideNodePlan {
  /** Index of the joint segment this node closes. */
  k: number;
  models: readonly [ModelPlan | null, ModelPlan | null];
  x: number;
  y: number;
  sx: number;
  /** Y scale of the second model. */
  syTail: number;
  width: number;
  timelineKey: number;
  timeFrames: number;
}

export interface AirSlidePlan {
  head: AirSlideHeadPlan;
  nodes: AirSlideNodePlan[];
  band: {
    points: AirPoint[];
    times: number[];
    keys: number[];
    resources: readonly [number, number, number];
    width: number;
  };
}

/** The placements and band points of an AIR slide, before any model is chosen for them. */
interface AirSlideWalk {
  head: Omit<AirSlideHeadPlan, "model" | "sx"> & { variant: number };
  nodes: (Omit<AirSlideNodePlan, "models" | "sx"> & { widthIndex: number })[];
  band: AirSlidePlan["band"];
}

function walkAirSlide(
  record: DataView,
  index: number,
  score: NoteScore,
  regions: readonly DataView[],
): AirSlideWalk {
  const type = record.getInt32(0x10, true);
  const kind = type >= 0 && type < AIR_PARENT_KIND.length ? AIR_PARENT_KIND[type] : 3;
  const joints = score.airSlides?.get(index);
  if (!joints?.length) throw new RangeError(`AIR slide record ${index} has no joints`);
  let position: DataView;
  let lane = record.getInt32(0x28, true);
  let width = widthOf(record.getInt32(0x2c, true));
  let key90: number;
  if (kind === 0) {
    position = record;
    key90 = record.getInt32(0x70, true);
  } else if (kind === 1) {
    position = new DataView(record.buffer, record.byteOffset + 0x30, 12);
    key90 = record.getInt32(0x74, true);
  } else if (kind === 2) {
    const chain = score.slideJoints?.get(index);
    if (!chain?.length) throw new RangeError(`AIR slide record ${index} has no parent joints`);
    position = chain[chain.length - 1];
    lane = position.getInt32(0x10, true);
    width = widthOf(position.getInt32(0x20, true));
    key90 = record.getInt32(0x74, true);
  } else throw new RangeError(`AIR slide record ${index} sits on unsupported parent type ${type}`);

  const headTime = frames(position.getFloat32(8, true));
  const colourRaw = record.getInt32(0x94, true);
  if (colourRaw === 2)
    throw new RangeError(`AIR slide record ${index} colour PNK is not supported`);
  const variant = colourRaw === 0 ? 2 : 0;
  const hh = f(f(record.getInt32(0x9c, true)) * HEIGHT_STEP);
  const head: AirSlideWalk["head"] = {
    variant,
    x: lanePosition(lane, f(width)),
    sy: headHeight(hh),
    width,
    timelineKey: key90,
    timeFrames: headTime,
  };

  const nodes: AirSlideWalk["nodes"] = [];
  const points: AirPoint[] = [];
  const times = [headTime];
  const keys = [key90];
  let lanePrev = lane;
  let widthPrev = colourOf(width);
  let heightPrev = hh;
  const point = (laneValue: number, w: number, height: number, flag: number): AirPoint => ({
    width: f(w),
    lane: f(f(laneValue) + f(f(w) * 0.5)),
    height,
    flag,
  });
  joints.forEach((joint, k) => {
    const widthIdx = joint.getInt32(0x20, true);
    const laneNext = joint.getInt32(0x10, true);
    const widthNext = widthOf(widthIdx);
    const heightNext = f(f(joint.getInt32(0x18, true)) * HEIGHT_STEP);
    const timeNext = frames(joint.getFloat32(8, true));
    const keyNext = regionKeyAt(regions, joint, laneNext, widthNext);
    points.push(point(lanePrev, widthOf(widthPrev), heightPrev, 0));
    times.push(timeNext);
    keys.push(keyNext);
    if (joint.getUint8(0x14)) {
      const y = heightY(heightNext);
      nodes.push({
        k,
        widthIndex: widthIndex(widthNext),
        x: lanePosition(laneNext, f(widthNext)),
        y,
        syTail: f(y * NODE_TAIL_SCALE),
        width: widthNext,
        timelineKey: keyNext,
        timeFrames: timeNext,
      });
    }
    lanePrev = laneNext;
    widthPrev = widthIdx;
    heightPrev = heightNext;
  });
  points.push(point(lanePrev, widthOf(widthPrev), heightPrev, 1));
  const resources = [0, 3, 6].map((i) => BAND_RESOURCES[variant + i]) as [number, number, number];
  return { head, nodes, band: { points, times, keys, resources, width } };
}

/** Freezes the placements and band points of the AIR slide attached to `record`. */
export function planAirSlide(
  record: DataView,
  index: number,
  score: NoteScore,
  regions: readonly DataView[],
  context: { model: (id: number) => ModelPlan },
): AirSlidePlan {
  const { head, nodes, band } = walkAirSlide(record, index, score, regions);
  const headModel = context.model(HEAD[3 * widthIndex(head.width) + head.variant]);
  return {
    head: {
      model: headModel,
      x: head.x,
      sx: placementScale(head.width, headModel.units),
      sy: head.sy,
      width: head.width,
      timelineKey: head.timelineKey,
      timeFrames: head.timeFrames,
    },
    nodes: nodes.map((node) => {
      const first = context.model(NODE_FIRST[node.widthIndex]);
      return {
        k: node.k,
        models: [first, context.model(NODE_SECOND[node.widthIndex])],
        x: node.x,
        y: node.y,
        sx: placementScale(node.width, first.units),
        syTail: node.syTail,
        width: node.width,
        timelineKey: node.timelineKey,
        timeFrames: node.timeFrames,
      };
    }),
    band,
  };
}

/** Writes the head matrix at the manager time; returns the depth. */
export function airSlideHeadMatrix(
  head: AirSlideHeadPlan,
  state: DataView,
  score: NoteTimelineScore,
  out: Float32Array,
): number {
  const z = depthAt(
    state,
    effectiveMinusNow(state, score, head.timelineKey, head.timeFrames),
    1,
    1,
    score.scroll,
  );
  writeMatrix(out, 0, head.x, 0, z, head.sx, head.sy, 1);
  return z;
}

/** Writes one node model matrix at the manager time; returns the depth. */
export function airSlideNodeMatrix(
  node: AirSlideNodePlan,
  part: 0 | 1,
  state: DataView,
  score: NoteTimelineScore,
  nowFrames: number,
  out: Float32Array,
): number {
  const te = effectiveTime(state, score, node.timelineKey, node.timeFrames);
  const z = depthAt(state, f(te - nowFrames), 1, 1, score.scroll);
  writeMatrix(out, 0, node.x, node.y, z, node.sx, part === 0 ? 1 : node.syTail, 1);
  return z;
}

/** Band plans of every AIR slide. */
export function airSlideBandPlans(score: NoteScore, pack: Pack): Map<number, AirBandPlan> {
  const plans = new Map<number, AirBandPlan>();
  const regions = regionRecords(score);
  for (const index of score.airSlides?.keys() ?? []) {
    const { band } = walkAirSlide(score.records[index], index, score, regions);
    const profiles = band.resources.map(
      (resource, layer) => `note/band/slide/${BAND_PRIMITIVES[layer]}/${resource}`,
    ) as [string, string, string];
    const orders = profiles.map((name) => bandOrderOf(pack, name, "AIR slide"));
    const layers = orders.map((order) => order.layer) as [number, number, number];
    const initialKeys = orders.map((order) => order.initialKey) as [number, number, number];
    plans.set(index, {
      times: band.times,
      keys: band.keys,
      elements: band.points,
      narrow: 0,
      generator: {
        i10: band.resources[0],
        i1c: band.resources[1],
        i28: band.resources[2],
        vMin: 0,
        vMax: 1,
        head: 1,
      },
      profiles,
      layers,
      initialKeys,
      priority: (16 - band.width) & 255,
    });
  }
  return plans;
}

/** Appends AIR slide bands to the shared buffer without clearing other families. */
export function createAirSlideBandAssembler(input: {
  score: NoteScore;
  manager: DataView;
  pack: Pack;
  timeline: Timeline;
}) {
  return createAirBandAssembler({
    score: input.score,
    manager: input.manager,
    timeline: input.timeline,
    plans: airSlideBandPlans(input.score, input.pack),
  });
}
