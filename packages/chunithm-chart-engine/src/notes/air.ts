/**
 * AIR note display matrices.
 *
 * An AIR note is a secondary record attached to a tap, hold or slide; it carries its own direction,
 * colour and lane, and its model is chosen from direction and width. The display transform depends
 * only on the current time, the speed and the plan frozen at initialisation, so it is a pure function
 * of `t` and needs no replay.
 *
 * The animation/UV clock that AIR models also drive is NOT pure — it accumulates a per-frame step —
 * and is deliberately absent here.
 */

import { writeMatrix } from "./matrix";
import { lanePosition, depthAt } from "./space";
import { effectiveTime, windowPredicate, type NoteTimelineScore } from "./timing";

/** Per-direction animation scale factors, indexed by the direction code. */
const SIDES: readonly number[] = Object.freeze([1, 1, 1, 0, 0, 0]);
/** Frames-to-milliseconds factor used for the record's own time. */
const FRAMES_PER_MS = 0.05999999865889549;
/** Scale applied to the animation factor for down-direction notes. */
const DOWN_ANIMATION_SCALE = 0.4000000059604645;
/** Depth the AIR model starts at, as a float32 bit pattern. */
const INITIAL_DEPTH_BITS = 3323740160;
/** Y scale for every AIR model, as a float32 bit pattern. */
const Y_SCALE_BITS = 1065353216;

/** Model index per direction and width index, flattened as `direction * 16 + widthIndex`. */
const AIR_MODELS: readonly number[] = Object.freeze([
  161, 160, 159, 158, 157, 156, 155, 154, 153, 152, 151, 150, 149, 148, 147, 146, 177, 176, 175,
  174, 173, 172, 171, 170, 169, 168, 167, 166, 165, 164, 163, 162, 177, 176, 175, 174, 173, 172,
  171, 170, 169, 168, 167, 166, 165, 164, 163, 162, 193, 192, 191, 190, 189, 188, 187, 186, 185,
  184, 183, 182, 181, 180, 179, 178, 209, 208, 207, 206, 205, 204, 203, 202, 201, 200, 199, 198,
  197, 196, 195, 194, 209, 208, 207, 206, 205, 204, 203, 202, 201, 200, 199, 198, 197, 196, 195,
  194,
]);

/** Record type to the field the note's own time comes from: 0 = +0x8, 1 = +0x38, 2 = last joint. */
const RECORD_BRANCH: readonly number[] = Object.freeze([0, 1, 2, 3, 0, 3, 0, 3, 3, 3, 3, 0]);

export interface AirPlan {
  modelId: number;
  direction: number;
  /** 1 when the note shows its alternate colour. */
  colourFlag: number;
  lane: number;
  width: number;
  /** The record's own time, in frames. */
  timeFrames: number;
  /** Timeline key the effective-time query uses. */
  timelineKey: number;
  /** Placement operands, fixed at initialisation. */
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
}

export interface AirDisplay {
  modelId: number;
  /** Twelve float32 words, row-major 3×4. */
  matrix3x4: Float32Array;
  /** Per-frame animation scale for the caller to advance its clock by, or null outside the window. */
  animationScale: number | null;
}

export interface AirPrepareInput {
  /** Model units for the chosen model id. */
  modelUnits: (modelId: number) => number;
  /** Runtime model Z scale. */
  modelScaleZ: number;
  /** Joints of a slide parent, when the AIR is attached to one. */
  joints40?: readonly DataView[] | null;
}

export interface AirDisplayInput {
  /** Note-state view: time at 0x300, the note-derived timeline frame at 0x308, speed at 0x354. */
  nm: DataView;
  /** Bound score whose timeline and scroll rows the predicates read. */
  score: NoteTimelineScore;
  /** View timing: the speed-flag byte and the two per-direction factors. */
  viewTiming: { b04: number; f14: number; f18: number; f1c: number };
}

const scratch = new DataView(new ArrayBuffer(4));
const fromBits = (bits: number): number => {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
};

/** Width in lane units for a model index, or zero when the index is outside the table. */
const widthOf = (index: number): number => (index >= 0 && index < 16 ? index + 1 : 0);

/** Table index for a raw width value: one-based, clamped to the sixteen measured widths. */
const clampWidth = (raw: number): number => {
  const n = (raw - 1) | 0;
  return n < 0 ? 0 : n >= 15 ? 15 : n;
};

function readAirRecord(record: DataView, joints40?: readonly DataView[] | null) {
  if (record.byteLength < 0x164 || record.getInt32(0x14, true) !== 3)
    throw new RangeError("An AIR sub-record is required");
  const type = record.getInt32(0x10, true);
  const branch = RECORD_BRANCH[type];
  if (branch === undefined || branch === 3) throw new RangeError("Unsupported AIR parent type");
  const direction = record.getInt32(0x90, true);
  const colour = record.getInt32(0x94, true);
  if (direction < 0 || direction >= SIDES.length)
    throw new RangeError("AIR direction out of range");
  if (colour < 0 || colour > 2) throw new RangeError("AIR colour out of range");

  let lane = record.getInt32(0x28, true);
  let width = widthOf(record.getInt32(0x2c, true));
  let ms: number;
  if (branch === 2) {
    const joints = joints40;
    const last = joints?.[joints.length - 1];
    if (!last || last.byteLength < 0x24) throw new RangeError("Slide parent has no final joint");
    ms = last.getFloat32(8, true);
    lane = last.getInt32(0x10, true);
    width = widthOf(last.getInt32(0x20, true));
  } else ms = record.getFloat32(branch === 1 ? 0x38 : 8, true);
  if (width < 1 || width > 16 || lane < -16 || lane + width > 32)
    throw new RangeError("AIR lane out of range");

  return {
    branch,
    direction,
    colour,
    lane,
    width,
    ms,
    modelId: AIR_MODELS[direction * 16 + clampWidth(width)],
  };
}

/** Selects the AIR model after validating its record and, for a slide parent, its final joint. */
export function airModelFor(record: DataView, joints40?: readonly DataView[] | null): number {
  return readAirRecord(record, joints40).modelId;
}

/**
 * Freezes the placement for one AIR sub-record. The record must be an AIR child (secondary type 3)
 * with a supported primary type.
 */
export function airPrepare(record: DataView, input: AirPrepareInput): AirPlan {
  const f32 = Math.fround;
  const { branch, direction, colour, lane, width, ms, modelId } = readAirRecord(
    record,
    input.joints40,
  );
  const units = input.modelUnits(modelId);
  if (!Number.isInteger(units)) throw new RangeError("Model units must be an int32");
  const x = units > 0 ? f32(f32(width) / f32(units)) : 1;

  return Object.freeze({
    modelId,
    direction,
    colourFlag: colour === 2 || (colour === 0 && SIDES[direction] === 0) ? 1 : 0,
    lane,
    width,
    timeFrames: f32(ms * FRAMES_PER_MS),
    timelineKey: record.getInt32(branch === 0 ? 0x70 : 0x74, true),
    position: Object.freeze([
      lanePosition(lane, f32(width)),
      0,
      fromBits(INITIAL_DEPTH_BITS),
    ] as const),
    // Directions 2 and 4 mirror the model horizontally.
    scale: Object.freeze([
      f32((direction === 2 || direction === 4 ? -1 : 1) * x),
      fromBits(Y_SCALE_BITS),
      f32(input.modelScaleZ),
    ] as const),
  });
}

/**
 * Writes the display matrix for one AIR plan at the manager's current time. Returns null for the
 * animation scale when the note is outside its window, matching the reference's gate.
 */
export function airDisplay(plan: AirPlan, input: AirDisplayInput): AirDisplay {
  const f32 = Math.fround;
  const { nm, score, viewTiming } = input;
  if (nm.byteLength < 0x3a8) throw new RangeError("Note-state view is too short");
  if (!Number.isInteger(viewTiming.b04) || viewTiming.b04 < 0 || viewTiming.b04 > 255)
    throw new RangeError("AIR speed flag must be a uint8");

  const now = nm.getFloat32(0x300, true);
  const te = effectiveTime(nm, score, plan.timelineKey, plan.timeFrames);
  const speed = nm.getFloat32(0x308, true);
  const down = SIDES[plan.direction] === 0;
  const base = down ? f32(speed * DOWN_ANIMATION_SCALE) : speed;
  const factor = viewTiming.b04 === 0 ? 1 : f32(down ? viewTiming.f1c : viewTiming.f18);
  const scaled = f32(factor * base);
  const update = windowPredicate(nm, score, -1, te, 0, 1);
  const z = depthAt(nm, f32(te - now), 1, 1, score.scroll);

  const output = new Float32Array(12);
  writeMatrix(
    output,
    0,
    f32(plan.position[0]),
    f32(plan.position[1]),
    z,
    f32(plan.scale[0]),
    f32(plan.scale[1]),
    f32(plan.scale[2]),
  );
  return { modelId: plan.modelId, matrix3x4: output, animationScale: update ? scaled : null };
}
