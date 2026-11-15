/**
 * The per-record plans the frame evaluation reads: which model each record draws with and, for a
 * hold, which model its tail draws with and where the tail is placed.
 */

import type { Pack } from "../assets/packFormat";
import { airModelFor, airPrepare } from "./air";
import { planBand, regionKeyAt, regionRecords } from "./bandFrame";
import {
  planRecord,
  type AirAttachment,
  type LadderPlan,
  type MeshMatrices,
  type ModelPlan,
  type RecordPlan,
  type SlideJointPlan,
  type SlidePlan,
} from "./evaluate";
import { planAirHold } from "./airHoldParts";
import { planAirSlide } from "./airSlideParts";
import { planLadderElements } from "./ladderElements";
import { widthIndex } from "./matrix";
import { attachedAir, modelFlagsOf } from "./modelFlags";
import {
  flatModelFor,
  FRAMES_PER_MS,
  holdTailModelFor,
  placementScale,
  placementWidth,
  slideHeadModelFor,
  slideJointModelFor,
} from "./placement";
import type { NoteScore } from "./score";
import { lanePosition } from "./space";
import { NOTE_WIDTHS } from "./tables";
import type { Affine } from "./worldMatrix";
import type { InstanceGroup } from "./instanceGroups";

/** Depth scale the reference runs the note layer with. */
export const DEPTH_SCALE = 1.5;
/** Runtime scale of every note model along its depth axis, as a float32. */
export const MODEL_SCALE_Z = 1.2999999523162842;
/** Primary type of a hold. */
const HOLD = 1;
/** Primary type of an AIR ladder. */
const LADDER = 9;
/** Primary type of a slide. */
const SLIDE = 2;
const AIR_SOLID = 10;
const AIR_HOLD_SECONDARY = 5;
/** Fields of a slide record and of one of its joints. */
const RECORD_SLIDE_KIND = 0x98;
const JOINT_TIME = 8;
const JOINT_LANE = 0x10;
const JOINT_WIDTH_INDEX = 0x20;
const JOINT_CLOSES_CHAIN = 0x14;
/** Secondary type of a plain AIR attached to a record. */
const AIR_SECONDARY = 3;
/** Primary types whose attached AIR takes its own time and lane from the record itself. */
const AIR_PARENTS: ReadonlySet<number> = new Set([0, 1, 2, 4, 6, 11]);

/** Tint modes an AIR HOLD body is drawn in; each has its own variant of the body and tail models. */
const AIR_HOLD_MODES = [0, 1, 2] as const;
const MODEL_NAME = /^note[/]model[/][0-9]+$/;

type ModelMeta = Record<string, unknown>;

/** The instanced group a model entry records, or null when it records none. */
function instanceGroupOf(id: number, recorded: unknown): InstanceGroup | null {
  if (recorded === undefined) return null;
  const group = recorded as { sphere?: unknown; capacity?: unknown } | null;
  const sphere = group?.sphere;
  const capacity = group?.capacity;
  if (
    !Array.isArray(sphere) ||
    sphere.length !== 4 ||
    !sphere.every(
      (value) =>
        typeof value === "number" && Number.isFinite(value) && Math.fround(value) === value,
    ) ||
    typeof capacity !== "number" ||
    !Number.isInteger(capacity) ||
    capacity <= 0
  )
    throw new RangeError(
      `Model note/model/${id} records a malformed instance group; rebuild the pack`,
    );
  return { sphere: [sphere[0], sphere[1], sphere[2], sphere[3]], capacity };
}

/** A model entry's metadata as the plan the evaluation reads. */
function modelPlan(id: number, meta: ModelMeta): ModelPlan {
  const initialKey = meta.initialKey;
  if (
    typeof initialKey !== "number" ||
    !Number.isInteger(initialKey) ||
    initialKey < 0 ||
    initialKey > 0xffff
  )
    throw new RangeError(`Model note/model/${id} records no initial sort key; rebuild the pack`);
  return {
    id,
    initialKey,
    layer: (meta.layer as number | undefined) ?? 0,
    pass: (meta.pass as number | undefined) ?? 0,
    widthBase: (meta.widthBase as number | undefined) ?? 0,
    widthStepI32: (meta.widthStepI32 as number | undefined) ?? 0,
    units: (meta.units as number | null | undefined) ?? null,
    modelScaleZ: MODEL_SCALE_Z,
    meshes: meta.meshes as readonly string[],
    instanceGroup: instanceGroupOf(id, meta.instanceGroup),
  };
}

/**
 * Builds a plan for every record of `score`. Required models and attached vectors must exist;
 * a drawable family without an implementation is rejected.
 */
export function buildRecordPlans(
  pack: Pack,
  score: NoteScore,
): { plans: RecordPlan[]; meshMatrices: MeshMatrices; requiredModels: ReadonlySet<string> } {
  const requiredModels = new Set<string>();
  const models = new Map<number, ModelMeta>();
  const meshMatrices = new Map<string, Affine | null>();
  for (const [name, entry] of pack.entries) {
    const meta = entry.meta as ModelMeta;
    if (MODEL_NAME.test(name)) models.set(Number(name.split("/")[2]), meta);
    else if (entry.kind === "mesh")
      meshMatrices.set(name, (meta.worldMatrix3x4 ?? null) as Affine | null);
  }
  const flags = modelFlagsOf(score.records);
  const regions = regionRecords(score);

  const requiredModel = (id: number, index: number, part: string): ModelMeta => {
    requiredModels.add(`note/model/${id}`);
    const meta = models.get(id);
    if (!meta) throw new RangeError(`record ${index} ${part} model ${id} is missing`);
    return meta;
  };
  const airOf = (record: DataView, index: number): AirAttachment | null => {
    if (
      record.getInt32(0x14, true) !== AIR_SECONDARY ||
      !AIR_PARENTS.has(record.getInt32(0x10, true))
    )
      return null;
    const joints40 = score.slideJoints?.get(index);
    const id = airModelFor(record, joints40);
    const meta = requiredModel(id, index, "AIR");
    const plan = airPrepare(record, {
      modelUnits: () => meta.units as number,
      modelScaleZ: MODEL_SCALE_Z,
      joints40,
    });
    return { model: modelPlan(id, meta), plan };
  };

  /** The slide's own parts: the models on its chain-closing joints, each placed at that joint's end. */
  const slideOf = (record: DataView, index: number): SlidePlan | null => {
    const joints = score.slideJoints?.get(index) ?? [];
    const kind = record.getInt32(RECORD_SLIDE_KIND, true);
    const parts: SlideJointPlan[] = [];
    joints.forEach((joint, k) => {
      const last = k === joints.length - 1;
      if (!last && joint.getUint8(JOINT_CLOSES_CHAIN) === 0) return;
      const widthIndexRaw = joint.getInt32(JOINT_WIDTH_INDEX, true);
      const width =
        widthIndexRaw >= 0 && widthIndexRaw < NOTE_WIDTHS.length ? NOTE_WIDTHS[widthIndexRaw] : 0;
      const lane = joint.getInt32(JOINT_LANE, true);
      const id = slideJointModelFor(kind, last && attachedAir(record), widthIndex(width));
      const meta = requiredModel(id, index, `SLIDE joint ${k}`);
      const model = modelPlan(id, meta);
      parts.push({
        model,
        x: lanePosition(lane, Math.fround(width)),
        sx: placementScale(width, model.units),
        width,
        timelineKey: regionKeyAt(regions, joint, lane, width),
        timeFrames: Math.fround(Math.fround(joint.getFloat32(JOINT_TIME, true)) * FRAMES_PER_MS),
        index: k,
      });
    });
    return {
      headEndFrames: Math.fround(Math.fround(record.getFloat32(8, true)) * FRAMES_PER_MS),
      joints: parts,
    };
  };

  const ladderOf = (index: number): LadderPlan => {
    const ladder = score.ladders?.get(index);
    if (!ladder) throw new RangeError(`AIR ladder record ${index} has no samples vector`);
    return planLadderElements(ladder.samples, {
      regions,
      widthOf: (i) => NOTE_WIDTHS[i] ?? 0,
      model: (id) => modelPlan(id, requiredModel(id, index, "AIR ladder marker")),
    });
  };

  const plans = score.records.map((record, index) => {
    const type = record.getInt32(0x10, true);
    const secondary = record.getInt32(0x14, true);
    if (![0, 1, 2, 4, 6, 9, 10, 11, 12].includes(type))
      throw new RangeError(`record ${index} has unsupported primary type ${type}`);
    if (![-1, 0, 3, 5, 8].includes(secondary))
      throw new RangeError(`record ${index} has unsupported secondary type ${secondary}`);
    if (secondary === 8 && !score.airSlides?.has(index))
      throw new RangeError(`record ${index} AIR slide element vector is missing`);
    if (type === AIR_SOLID)
      throw new RangeError(`record ${index} AIR solid rendering is not supported`);
    if (record.getInt32(0x14, true) === AIR_HOLD_SECONDARY && !score.airHolds?.has(index))
      throw new RangeError(`record ${index} AIR HOLD element vector is missing`);
    if (type === LADDER)
      return planRecord(record, null, DEPTH_SCALE, 0, null, null, null, ladderOf(index));
    const width = widthIndex(placementWidth(record));
    const air = airOf(record, index);
    if (type === SLIDE) {
      const id = slideHeadModelFor(
        record.getInt32(RECORD_SLIDE_KIND, true),
        flags.variant[index],
        flags.alternate[index] !== 0,
        width,
      );
      const meta = requiredModel(id, index, "SLIDE head");
      return planRecord(
        record,
        modelPlan(id, meta),
        DEPTH_SCALE,
        0,
        null,
        air,
        slideOf(record, index),
      );
    }
    const headId = flatModelFor(type, flags.variant[index], flags.alternate[index] !== 0, width);
    if (headId === null) return planRecord(record, null, DEPTH_SCALE, 0);
    const head = modelPlan(headId, requiredModel(headId, index, "head"));
    if (type !== HOLD) return planRecord(record, head, DEPTH_SCALE, 0, null, air);

    const tailId = holdTailModelFor(attachedAir(record), width);
    const tailMeta = requiredModel(tailId, index, "HOLD tail");
    const band = planBand(record, regions);
    return planRecord(
      record,
      head,
      DEPTH_SCALE,
      0,
      {
        model: modelPlan(tailId, tailMeta),
        timelineKey: band.tailKey,
        timeFrames: band.tailFrames,
      },
      air,
    );
  });
  for (const index of score.airSlides?.keys() ?? [])
    plans[index] = {
      ...plans[index],
      airSlide: planAirSlide(score.records[index], index, score, regions, {
        model: (id) => modelPlan(id, requiredModel(id, index, "AIR slide marker")),
      }),
    };
  for (const index of score.airHolds?.keys() ?? []) {
    const airHold = planAirHold(score.records[index], index, score, regions, {
      model: (id) => modelPlan(id, requiredModel(id, index, "AIR HOLD part")),
    });
    for (const id of [airHold.body.id, airHold.tail.id])
      for (const mode of AIR_HOLD_MODES) {
        requiredModels.add("note/model/" + id + "~" + mode);
        if (!pack.entries.has("note/model/" + id + "~" + mode))
          throw new RangeError(
            "record " + index + " AIR HOLD tint variant " + id + "~" + mode + " is missing",
          );
      }
    plans[index] = { ...plans[index], airHold };
  }
  return { plans, meshMatrices, requiredModels };
}
