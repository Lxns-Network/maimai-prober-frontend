/**
 * Frame evaluation: turning the active records into the instances the renderer submits.
 *
 * The split against construction is the reference's own. At construction a note freezes its
 * placement (position and scale, which never change) and its model; per frame only the depth is
 * recomputed, and the display matrix is the placement with that depth in the translation column.
 * Evaluating a record therefore needs no replay of its construction — it needs the record, the
 * model set's metadata, and the current frame time.
 *
 * One record can produce several instances: a model entry references one to five meshes, and each is
 * drawn with its own matrix, so the instance count is a property of the model rather than of the note
 * count. Instances are written into caller-owned storage and the count is returned, because the frame
 * path may not allocate.
 */

import type { AirPlan } from "./air";
import { computePlacement, placementWidth, type Placement } from "./placement";
import { composeWorldMatrix, IDENTITY, type Affine } from "./worldMatrix";
import { memberDistance, type InstanceGroup } from "./instanceGroups";
import {
  AIR_HOLD_PART,
  airHoldBodyMatrix,
  airHoldElementMatrix,
  airHoldFrame,
  airHoldHeadMatrix,
  airHoldPlainMatrix,
  airHoldTailMatrix,
  createAirHoldFrame,
  type AirHoldPlan,
} from "./airHoldParts";
import { ladderElementMatrix, type LadderElementPlan } from "./ladderElements";
import { writeMatrix } from "./matrix";
import type { ModelStates } from "./modelStates";
import {
  AIR_SLIDE_HEAD_PART,
  airSlideHeadMatrix,
  airSlideNodeMatrix,
  type AirSlidePlan,
} from "./airSlideParts";
import { depthAt, selectHitDepth } from "./space";
import {
  effectiveTime,
  extendedDepthArgument,
  windowPredicate,
  type NoteTimelineScore,
} from "./timing";
import {
  BAND_ENDED,
  GROUND_MAIN_PART,
  GROUND_TAIL_PART,
  MINE_PART,
  PLAIN_AIR_PART,
  slideJointPart,
} from "../chart/bake/events";
import { sortKey } from "./render/drawGroups";
import { NOTE_FIELDS, SPAWN_CONSTANTS } from "./tables";

/** Primary type of a MINE, whose model is drawn with its recorded motion frame. */
const MINE = 11;
/**
 * Primary types, FLICK and MINE, whose depth comes from an effective time kept in extended
 * precision.
 */
const EXTENDED_DEPTH_TYPES: ReadonlySet<number> = new Set([6, MINE]);

/** The model-set metadata one record's instances are built from. */
export interface ModelPlan {
  /** Model set id, as the pack names it. */
  id: number;
  /** Initial key of the model's draw order; the draw key keeps its bit 15. */
  initialKey: number;
  /** Layer byte the draw key packs into bits 8–14. */
  layer: number;
  /** Draw pass the model entry belongs to. */
  pass: number;
  /** Width priority operands, from the model set's own fixed pair. */
  widthBase: number;
  widthStepI32: number;
  /** Unit width the model set was authored at, or null when it declares none. */
  units: number | null;
  /**
   * Runtime model Z scale, the third scale operand of the placement.
   *
   * The reference takes it from the runtime rather than the record; the exported oracle drives it
   * with 1 and every sampled placement reports sz = 1, so the value is threaded through here instead
   * of being assumed at the write site.
   */
  modelScaleZ: number;
  /** One mesh name per mesh the model entry references, in draw order. */
  meshes: readonly string[];
  /**
   * The instanced group the model is drawn in, if any: its members are submitted after every other
   * part, batch by batch, each batch nearest first and one mesh after another.
   */
  instanceGroup?: InstanceGroup | null;
}

/** The mesh matrices, by mesh name; the composition needs the mesh's own transform. */
export type MeshMatrices = ReadonlyMap<string, Affine | null>;

/**
 * Which matrix the scene sorts a drawn part by. A part drawn as one instance of its model's shared
 * group sorts by the group's joint: the mesh's own matrix under an identity root, so every part
 * drawing that mesh sorts alike wherever it is placed. A part placed on its own sorts by its world.
 */
type SortJoint = "group" | "own";

/** One instance, pointing at the caller's storage rather than owning a matrix. */
export interface EvaluatedInstance {
  record: number;
  /** The u16 sort key from `sortKey(initialKey, layer, widthPriority)`. */
  key: number;
  /** Camera-space depth, for the in-group order. */
  depth: number;
  /** Model entry name, so the renderer can find the pass and the program. */
  model: string;
  /** Mesh name this instance draws with. */
  mesh: string;
  /** Twelve world-matrix floats, written into the caller's buffer. */
  world: Float32Array;
  /** Twelve floats of the joint the scene sorts this part by, written into the caller's buffer. */
  sortJoint: Float32Array;
  /** Animation frame the bake recorded for this part and step; absent when the model's own clock applies. */
  frame?: number;
}

/** Caller-owned storage the evaluation writes into. */
export interface EvaluateStore {
  /** Flat world matrices: twelve floats per instance slot. */
  readonly worlds: Float32Array;
  /** Flat sort joints: twelve floats per instance slot. */
  readonly sortJoints: Float32Array;
  /** The instance records, reused across frames. */
  readonly instances: EvaluatedInstance[];
  /** Instance capacity. */
  readonly capacity: number;
}

export function createEvaluateStore(capacity: number): EvaluateStore {
  if (!Number.isInteger(capacity) || capacity <= 0)
    throw new RangeError(`Evaluate capacity must be a positive integer, got ${capacity}`);
  const worlds = new Float32Array(capacity * 12);
  const sortJoints = new Float32Array(capacity * 12);
  const instances: EvaluatedInstance[] = new Array(capacity);
  for (let i = 0; i < capacity; i++)
    instances[i] = {
      record: -1,
      key: 0,
      depth: 0,
      model: "",
      mesh: "",
      world: worlds.subarray(i * 12, i * 12 + 12),
      sortJoint: sortJoints.subarray(i * 12, i * 12 + 12),
    };
  return { worlds, sortJoints, instances, capacity };
}

/** The tail of a hold: the second model it draws and the time and timeline key the tail is placed by. */
export interface TailPlan {
  /** The tail's model set; its units are not used, the head's decide the scale of both. */
  model: ModelPlan;
  /** Timeline key the tail's effective-time query uses. */
  timelineKey: number;
  /** Frames the tail's own time corresponds to. */
  timeFrames: number;
}

/** Frames before its own time at which a slide's head stops drawing: one grid step. */
export const SLIDE_HEAD_LEAD_FRAMES = 0.5;

/** One model a slide draws on a joint that closes a chain. */
export interface SlideJointPlan {
  model: ModelPlan;
  /** Lane position of the joint's end. */
  x: number;
  /** Scale on x: the joint's width over the joint model's unit width. */
  sx: number;
  /** Lane width of the joint's end, which the draw key's width priority is computed from. */
  width: number;
  /** Timeline key and own time (in frames) of the joint's end. */
  timelineKey: number;
  timeFrames: number;
  /** Position of the joint in the slide's joint list, which names its observed display part. */
  index: number;
}

/** What a slide draws besides its head: a marker on each chain-closing joint, until that joint is reached. */
export interface SlidePlan {
  /** The slide's own time in frames; the head stops drawing {@link SLIDE_HEAD_LEAD_FRAMES} before it. */
  headEndFrames: number;
  joints: readonly SlideJointPlan[];
}

/** The AIR note attached to a record: its model and the placement frozen at construction. */
export interface AirAttachment {
  /** The AIR model set, chosen by direction and width. */
  model: ModelPlan;
  /** Placement operands; the depth is the only part that changes per frame. */
  plan: AirPlan;
}

/** The markers of an AIR ladder, one entry per sample; a sample without a model set has none. */
export type LadderPlan = readonly (LadderElementPlan | null)[];

/** Per-record data the evaluation reads every frame. */
export interface RecordPlan {
  /** The record's view, for its type, lane and width. */
  readonly record: DataView;
  /** The model set this record draws with, or null for a family this evaluator does not cover. */
  readonly model: ModelPlan | null;
  /** Frozen placement operands. */
  readonly placement: Placement;
  /** Depth scale the record carries, used as the per-frame depth argument's multiplier. */
  readonly depthScale: number;
  /** Whether the record is currently subject to the judge line's depth offset. */
  readonly secondaryFlag: number;
  /** The tail model of a hold; absent for every other record. */
  readonly tail: TailPlan | null;
  /** The AIR note attached to the record, drawn independently of the record's own state. */
  readonly air: AirAttachment | null;
  /** The slide parts beyond the head; present only on a slide. */
  readonly slide: SlidePlan | null;
  /** The sample markers of an AIR ladder; present only on a ladder. */
  readonly ladder: LadderPlan | null;
  /** The head and node markers of an attached AIR slide. */
  readonly airSlide: AirSlidePlan | null;
  /** The parts of an attached AIR HOLD. */
  readonly airHold: AirHoldPlan | null;
}

/** Per-record first-result cutoffs for independently drawn components. */
export interface JudgeVisibility {
  /** First hidden time in seconds; Infinity keeps a part visible until record removal. */
  readonly head: Float64Array;
  readonly air: Float64Array;
}

/** The per-frame note state the depth model reads. */
export interface EvaluateInput {
  /** Note-state view: time at 0x300, speed at 0x308/0x354, depth scale at 0x358. */
  readonly state: DataView;
  /** Score whose timeline and scroll rows the depth model reads. */
  readonly score: NoteTimelineScore;
  /** The meshes' own matrices, by mesh name. */
  readonly meshMatrices: MeshMatrices;
  /** Records to evaluate, in the order the active set produced them. */
  readonly plans: readonly RecordPlan[];
  /** Record indices to evaluate this frame. */
  readonly records: Int32Array;
  /** How many of `records` are valid. */
  readonly count: number;
  /** Current frame time in frames, matching the state view's own time. */
  readonly nowFrames: number;
  /**
   * Band state of the holds by record and grid step. A hold draws its head only while its state is 0
   * and its tail until the band ends; without it every hold draws both.
   */
  readonly bandStates?: { stateAt(record: number, step: number): number };
  /** Result-derived cutoffs for each record's independently visible parts. */
  readonly visibility?: JudgeVisibility;
  /** Grid step the frame is for; read only together with `bandStates`. */
  readonly step?: number;
  /** Shown/hidden state of the model parts the bake observed; required for any record with a ladder plan. */
  readonly modelStates?: ModelStates;
  readonly strictClocks?: boolean;
  /** Animation frames the bake recorded for pooled model parts; replaces the window-only seed rule. */
  readonly motionFrames?: EvaluateMotionFrames;
  /**
   * Camera position the batches of instanced groups are ordered by. Without it the members of a
   * group keep record order among the other parts.
   */
  readonly cameraPosition?: ArrayLike<number>;
}

/** A member of an instanced group, held until the group is submitted after every record. */
interface GroupMember {
  sorting: SortJoint;
  note: Float32Array;
  key: number;
  z: number;
  frame: number | undefined;
  record: number;
  distance: number;
}

export interface EvaluateMotionFrames {
  /** Whether a model entry carries a clock-driven animation. */
  animated(model: string): boolean;
  has(record: number, part: number): boolean;
  at(record: number, part: number, model: number, step: number): number;
}

const holdFrame = createAirHoldFrame();
const holdContext = { states: null as ModelStates | null, record: 0, step: 0 };
const holdVisibility = {
  headDone: false,
  elementShown: (k: number): boolean =>
    holdContext.states!.shownAt(holdContext.record, k * 2, holdContext.step) ||
    holdContext.states!.shownAt(holdContext.record, k * 2 + 1, holdContext.step),
};

/**
 * Builds the per-record plan once, at load.
 *
 * The placement and the width priority are properties of the record rather than of the frame, so
 * computing them here keeps the frame path to the depth and the matrix.
 */
export function planRecord(
  record: DataView,
  model: ModelPlan | null,
  depthScale: number,
  secondaryFlag: number,
  tail: TailPlan | null = null,
  air: AirAttachment | null = null,
  slide: SlidePlan | null = null,
  ladder: LadderPlan | null = null,
  airSlide: AirSlidePlan | null = null,
  airHold: AirHoldPlan | null = null,
): RecordPlan {
  return {
    record,
    model,
    placement: computePlacement(record, model?.units ?? null),
    depthScale,
    secondaryFlag,
    tail,
    air,
    slide,
    ladder,
    airSlide,
    airHold,
  };
}

/**
 * The argument the depth model is queried with: `f32(te - now)`, the effective time less the frame's
 * own time.
 *
 * Both operands are float32 by the time they are subtracted, and the result is rounded to float32
 * before the query. The reference reaches the same value through `neg(f32(now - te))`; flipping the
 * sign is the same operation, so a reader comparing the two should not read the sign difference as
 * a disagreement. Named rather than inlined so the wiring is directly testable.
 */
export function depthArgument(te: number, nowFrames: number): number {
  return Math.fround(te - nowFrames);
}

/** Width priority: `clamp(fixed7 + (width-1) * fixed8, 0, 255)`, as the reference computes it. */
export function widthPriorityFor(width: number, widthBase: number, widthStepI32: number): number {
  const value = (widthBase + Math.imul((width - 1) | 0, widthStepI32)) | 0;
  return value < 0 ? 0 : value > 255 ? 255 : value;
}

/**
 * Evaluates the frame's records into instances.
 *
 * Returns the instance count. Each record contributes one instance per mesh its model entry
 * references, so the caller's capacity must cover the sum over the live records. Records whose model
 * is null (a family this evaluator does not cover) contribute nothing rather than a placeholder.
 */
export function evaluateInstances(input: EvaluateInput, store: EvaluateStore): number {
  const {
    state,
    score,
    meshMatrices,
    plans,
    records,
    count,
    nowFrames,
    bandStates,
    visibility,
    modelStates,
    motionFrames,
    cameraPosition,
  } = input;
  if (
    cameraPosition &&
    (cameraPosition.length !== 3 || !Array.from(cameraPosition).every(Number.isFinite))
  )
    throw new RangeError("The camera position must be three finite numbers");
  const now = Number.isFinite(nowFrames) ? nowFrames : state.getFloat32(NOTE_FIELDS.now, true);
  let written = 0;
  let recordIndex = -1;
  const groups = new Map<
    string,
    { group: InstanceGroup; meshes: readonly string[]; members: GroupMember[] }
  >();

  /** Writes the instance of one mesh, placed by `note` and sorted as `sorting` says. */
  const write = (
    sorting: SortJoint,
    modelName: string,
    mesh: string,
    note: Float32Array,
    key: number,
    z: number,
    frame: number | undefined,
    record: number,
  ): void => {
    if (written >= store.capacity)
      throw new RangeError(
        `Evaluation produced more than ${store.capacity} instances; the capacity is a load-time decision`,
      );
    const slot = store.instances[written];
    const meshMatrix = meshMatrices.get(mesh) ?? null;
    composeWorldMatrix(note, meshMatrix, slot.world);
    slot.sortJoint.set(sorting === "own" ? slot.world : (meshMatrix ?? IDENTITY));
    slot.record = record;
    slot.key = key;
    slot.depth = z;
    slot.model = modelName;
    slot.mesh = mesh;
    slot.frame = frame;
    written++;
  };

  /**
   * Writes one instance per mesh of `model`, all placed by `note` and sorted as `sorting` says. A
   * member of an instanced group is held back and written with its group once every record is done.
   */
  const emit = (
    sorting: SortJoint,
    model: ModelPlan,
    note: Float32Array,
    key: number,
    z: number,
    variant = "",
    part?: number,
  ): void => {
    const modelName = `note/model/${model.id}${variant}`;
    let frame: number | undefined;
    if (part !== undefined && motionFrames) {
      if (motionFrames.has(recordIndex, part))
        frame = motionFrames.at(recordIndex, part, model.id, input.step ?? 0);
      else if (input.strictClocks && motionFrames.animated(modelName))
        throw new RangeError(`Record ${recordIndex} part ${part} has no recorded animation clock`);
    }
    const group = model.instanceGroup;
    if (group && cameraPosition) {
      let held = groups.get(modelName);
      if (!held) groups.set(modelName, (held = { group, meshes: model.meshes, members: [] }));
      held.members.push({
        sorting,
        note: Float32Array.from(note),
        key,
        z,
        frame,
        record: recordIndex,
        distance: memberDistance(note, group, cameraPosition),
      });
      return;
    }
    for (const mesh of model.meshes)
      write(sorting, modelName, mesh, note, key, z, frame, recordIndex);
  };

  /** Draws the parts of an AIR HOLD that the bake observed shown, tinted by the observed body mode. */
  const emitAirHold = (
    hold: AirHoldPlan,
    record: number,
    step: number,
    states: ModelStates,
  ): void => {
    const shown = (part: number) => states.shownAt(record, part, step);
    const headShown = shown(AIR_HOLD_PART.head);
    const bodyShown = shown(AIR_HOLD_PART.body);
    const tailShown = shown(AIR_HOLD_PART.tail);
    const plainShown = shown(AIR_HOLD_PART.plain);
    let elementShown = false;
    for (const element of hold.elements)
      if (shown(element.k * 2) || shown(element.k * 2 + 1)) elementShown = true;
    if (!headShown && !bodyShown && !tailShown && !plainShown && !elementShown) return;
    holdContext.states = states;
    holdContext.record = record;
    holdContext.step = step;
    holdVisibility.headDone = bodyShown && !headShown;
    airHoldFrame(hold, state, score, now, holdVisibility, holdFrame);
    const keyOf = (model: ModelPlan) =>
      sortKey(
        model.initialKey,
        model.layer,
        widthPriorityFor(hold.width, model.widthBase, model.widthStepI32),
      );
    if (headShown) {
      const headTime = effectiveTime(state, score, hold.headKey, hold.headFrames);
      if (input.strictClocks && !motionFrames && !windowPredicate(state, score, -1, headTime, 0, 1))
        throw new RangeError(
          `Record ${record} AIR HOLD head needs clock history outside its synchronization window`,
        );
      airHoldHeadMatrix(hold, holdFrame, noteScratch);
      emit("own", hold.head, noteScratch, keyOf(hold.head), holdFrame.head, "", AIR_HOLD_PART.head);
    }
    if (plainShown) {
      airHoldPlainMatrix(hold, holdFrame, noteScratch);
      emit(
        "group",
        hold.plain,
        noteScratch,
        keyOf(hold.plain),
        holdFrame.head,
        "",
        AIR_HOLD_PART.plain,
      );
    }
    if (bodyShown || tailShown) {
      const mode = states.modeAt(record, step);
      if (mode > 2)
        throw new RangeError("AIR HOLD " + record + " body is shown without an observed tint");
      const variant = "~" + mode;
      if (bodyShown) {
        airHoldBodyMatrix(hold, holdFrame, noteScratch);
        emit(
          "own",
          hold.body,
          noteScratch,
          keyOf(hold.body),
          holdFrame.top,
          variant,
          AIR_HOLD_PART.body,
        );
      }
      if (tailShown) {
        airHoldTailMatrix(hold, holdFrame, noteScratch);
        emit(
          "own",
          hold.tail,
          noteScratch,
          keyOf(hold.tail),
          holdFrame.top,
          variant,
          AIR_HOLD_PART.tail,
        );
      }
    }
    for (const element of hold.elements)
      for (let part = 0; part < 2; part++) {
        if (!shown(element.k * 2 + part)) continue;
        airHoldElementMatrix(hold, holdFrame, element.k, noteScratch);
        emit(
          "own",
          element.models[part],
          noteScratch,
          keyOf(element.models[part]),
          holdFrame.elements[element.k],
          "",
          element.k * 2 + part,
        );
      }
  };

  for (let n = 0; n < count; n++) {
    recordIndex = records[n];
    selectHitDepth(state, recordIndex);
    const plan = plans[records[n]];
    if (plan?.ladder) {
      if (!modelStates) throw new RangeError("Ladder markers need the observed model states");
      plan.ladder.forEach((element, part) => {
        if (!element || !modelStates.shownAt(records[n], part, input.step ?? 0)) return;
        const z = ladderElementMatrix(element, state, score, now, noteScratch);
        const priority = Math.min(16, Math.max(1, Math.round(element.width)));
        emit(
          "own",
          element.model,
          noteScratch,
          sortKey(
            element.model.initialKey,
            element.model.layer,
            widthPriorityFor(priority, element.model.widthBase, element.model.widthStepI32),
          ),
          z,
        );
      });
      continue;
    }
    if (plan?.airSlide) {
      if (!modelStates) throw new RangeError("AIR slide markers need the observed model states");
      const { head, nodes } = plan.airSlide;
      const step = input.step ?? 0;
      if (modelStates.shownAt(records[n], AIR_SLIDE_HEAD_PART, step)) {
        const headTime = effectiveTime(state, score, head.timelineKey, head.timeFrames);
        if (
          input.strictClocks &&
          !motionFrames &&
          !windowPredicate(state, score, -1, headTime, 0, 1)
        )
          throw new RangeError(
            `Record ${records[n]} AIR slide head needs clock history outside its synchronization window`,
          );
        const z = airSlideHeadMatrix(head, state, score, noteScratch);
        emit(
          "own",
          head.model,
          noteScratch,
          sortKey(
            head.model.initialKey,
            head.model.layer,
            widthPriorityFor(head.width, head.model.widthBase, head.model.widthStepI32),
          ),
          z,
          "",
          AIR_SLIDE_HEAD_PART,
        );
      }
      for (const node of nodes)
        node.models.forEach((model, part) => {
          if (!model || !modelStates.shownAt(records[n], node.k * 2 + part, step)) return;
          const z = airSlideNodeMatrix(node, part as 0 | 1, state, score, now, noteScratch);
          emit(
            "own",
            model,
            noteScratch,
            sortKey(
              model.initialKey,
              model.layer,
              widthPriorityFor(node.width, model.widthBase, model.widthStepI32),
            ),
            z,
            "",
            node.k * 2 + part,
          );
        });
    }
    if (plan?.airHold) {
      if (!modelStates) throw new RangeError("AIR HOLD parts need the observed model states");
      if (!modelStates.has(records[n]))
        throw new RangeError(`AIR HOLD ${records[n]} has no model observations`);
      emitAirHold(plan.airHold, records[n], input.step ?? 0, modelStates);
    }
    if (!plan || !plan.model) continue;
    const { model, placement, record, tail, air, slide } = plan;
    const bandState = tail && bandStates ? bandStates.stateAt(records[n], input.step ?? 0) : 0;
    const width = placementWidth(record);
    const seconds = now / 60;
    const headVisible = !visibility || seconds < visibility.head[records[n]];
    const currentStep = input.step ?? 0;
    // A record whose main model the bake observed draws each ground part exactly while the bake saw
    // it shown; one never observed keeps the timing rules below.
    const groundObserved = !!modelStates?.has(records[n], GROUND_MAIN_PART);
    if (modelStates && input.strictClocks && !groundObserved)
      throw new RangeError(`Record ${records[n]} has no observed display state for its models`);
    const groundShown = (part: number) => modelStates!.shownAt(records[n], part, currentStep);

    if (slide) {
      // The head and the joint markers draw until the part is judged, which the reference does when
      // the clock reaches the marker's own time and one grid step before the head's.
      if (
        groundObserved
          ? groundShown(GROUND_MAIN_PART)
          : headVisible && now + SLIDE_HEAD_LEAD_FRAMES < slide.headEndFrames
      ) {
        const te = effectiveTime(state, score, placement.timelineKey, placement.timeFrames);
        const z = depthAt(state, depthArgument(te, now), 1, 1, score.scroll);
        writeMatrix(
          noteScratch,
          0,
          placement.x,
          placement.y,
          z,
          placement.sx,
          placement.sy,
          model.modelScaleZ,
        );
        emit(
          "group",
          model,
          noteScratch,
          sortKey(
            model.initialKey,
            model.layer,
            widthPriorityFor(width, model.widthBase, model.widthStepI32),
          ),
          z,
        );
      }
      for (const joint of slide.joints) {
        if (groundObserved ? !groundShown(slideJointPart(joint.index)) : now >= joint.timeFrames)
          continue;
        const te = effectiveTime(state, score, joint.timelineKey, joint.timeFrames);
        const z = depthAt(state, depthArgument(te, now), 1, 1, score.scroll);
        writeMatrix(noteScratch, 0, joint.x, 0, z, joint.sx, 1, joint.model.modelScaleZ);
        emit(
          "group",
          joint.model,
          noteScratch,
          sortKey(
            joint.model.initialKey,
            joint.model.layer,
            widthPriorityFor(joint.width, joint.model.widthBase, joint.model.widthStepI32),
          ),
          z,
        );
      }
    } else if (groundObserved ? groundShown(GROUND_MAIN_PART) : headVisible && bandState === 0) {
      const type = record.getInt32(0x10, true);
      const z = recordDepth(state, score, placement, now, type);
      // The placement operands and the depth are the same for every mesh of this model; only the
      // mesh matrix differs, so the matrix is rebuilt per mesh rather than per record.
      writeMatrix(
        noteScratch,
        0,
        placement.x,
        placement.y,
        z,
        placement.sx,
        placement.sy,
        model.modelScaleZ,
      );
      emit(
        "group",
        model,
        noteScratch,
        sortKey(
          model.initialKey,
          model.layer,
          widthPriorityFor(width, model.widthBase, model.widthStepI32),
        ),
        z,
        "",
        type === MINE ? MINE_PART : undefined,
      );
    }

    if (tail && (groundObserved ? groundShown(GROUND_TAIL_PART) : bandState !== BAND_ENDED)) {
      const te = effectiveTime(state, score, tail.timelineKey, tail.timeFrames);
      const z = depthAt(state, depthArgument(te, now), 1, 1, score.scroll);
      // The tail shares the head's x and scale: the reference scales both by the head model's units.
      writeMatrix(
        noteScratch,
        0,
        placement.x,
        placement.y,
        z,
        placement.sx,
        placement.sy,
        tail.model.modelScaleZ,
      );
      emit(
        "group",
        tail.model,
        noteScratch,
        sortKey(
          tail.model.initialKey,
          tail.model.layer,
          widthPriorityFor(width, tail.model.widthBase, tail.model.widthStepI32),
        ),
        z,
      );
    }

    const airObserved = air && modelStates?.has(records[n]);
    if (air && input.strictClocks && !airObserved)
      throw new RangeError(`Record ${records[n]} AIR has no observed display state`);
    if (
      air &&
      (!visibility || seconds < visibility.air[records[n]]) &&
      (!airObserved || modelStates!.shownAt(records[n], PLAIN_AIR_PART, input.step ?? 0))
    ) {
      const { plan: placed } = air;
      const te = effectiveTime(state, score, placed.timelineKey, placed.timeFrames);
      if (input.strictClocks && !motionFrames && !windowPredicate(state, score, -1, te, 0, 1))
        throw new RangeError(
          `Record ${records[n]} AIR needs clock history outside its synchronization window`,
        );
      const z = depthAt(state, depthArgument(te, now), 1, 1, score.scroll);
      writeMatrix(
        noteScratch,
        0,
        placed.position[0],
        placed.position[1],
        z,
        placed.scale[0],
        placed.scale[1],
        placed.scale[2],
      );
      emit(
        "own",
        air.model,
        noteScratch,
        sortKey(
          air.model.initialKey,
          air.model.layer,
          widthPriorityFor(placed.width, air.model.widthBase, air.model.widthStepI32),
        ),
        z,
        "",
        PLAIN_AIR_PART,
      );
    }
  }
  for (const [modelName, { group, meshes, members }] of groups)
    for (let start = 0; start < members.length; start += group.capacity) {
      const batch = members
        .slice(start, start + group.capacity)
        .sort((a, b) => a.distance - b.distance);
      for (const mesh of meshes)
        for (const member of batch)
          write(
            member.sorting,
            modelName,
            mesh,
            member.note,
            member.key,
            member.z,
            member.frame,
            member.record,
          );
    }
  return written;
}

const noteScratch = new Float32Array(12);

/**
 * The depth the reference computes for a plain record of a primary type at a frame time; exposed for
 * the oracle test.
 */
export function recordDepth(
  state: DataView,
  score: NoteTimelineScore,
  placement: Placement,
  nowFrames: number,
  primaryType: number,
): number {
  const { timelineKey, timeFrames } = placement;
  const argument = EXTENDED_DEPTH_TYPES.has(primaryType)
    ? extendedDepthArgument(state, score, timelineKey, timeFrames)
    : depthArgument(effectiveTime(state, score, timelineKey, timeFrames), nowFrames);
  return depthAt(state, argument, 1, 1, score.scroll);
}

export { SPAWN_CONSTANTS };
