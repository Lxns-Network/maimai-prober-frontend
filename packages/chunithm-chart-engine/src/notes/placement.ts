/**
 * Placement: the frozen per-note operands the display matrices are built from.
 *
 * When a note is constructed the reference writes its position and scale once — they do not depend
 * on the frame — and only the depth is recomputed per frame. Splitting it that way is what lets the
 * runtime evaluate a record without replaying its construction: the placement is a function of the
 * record and the model set, and the depth is a function of `t`.
 *
 * The scale on the x axis is the note's width over the model's own unit width, which is what makes
 * one mesh serve every width in a family. A model set that declares no units uses a scale of one,
 * matching the reference's guard.
 *
 * The y component of the position is written as a literal zero, not read from the record: the
 * reference's placement writes the middle translation component from a constant, so a chart can
 * never produce a non-zero y here.
 */

import { lanePosition } from "./space";
import {
  DEPTH_INIT_BITS,
  modelForWidth,
  NOTE_WIDTHS,
  ONE_BITS,
  slideModelFor,
  type ModelFamily,
} from "./tables";
import { fromBits, modelFor, widthIndex } from "./matrix";

/** The operands one note's display matrix is built from. */
export interface Placement {
  x: number;
  /** Always zero; the reference writes the middle component from a constant. */
  y: number;
  /** Scale on x: the note's width over the model's unit width. */
  sx: number;
  /** Scale on y; always one for a flat note. */
  sy: number;
  /** Frames the record's own time corresponds to. */
  timeFrames: number;
  /** Timeline key the effective-time query uses. */
  timelineKey: number;
}

/** Model metadata the placement needs: the unit width of the set the mesh came from. */
export interface PlacementModel {
  /** The model set's unit width, or null when it declares none. */
  units: number | null;
}

/** Reads the width in lane units from a record's width index. */
export function placementWidth(record: DataView): number {
  const index = record.getInt32(0x2c, true);
  return index >= 0 && index < NOTE_WIDTHS.length ? NOTE_WIDTHS[index] : 0;
}

/**
 * The x scale for a width and a model set.
 *
 * The reference divides the width by the model's units in float32 and falls back to one when the
 * set declares no units or a non-positive width; both are reproduced here because a different scale
 * moves the geometry by a visible amount.
 */
export function placementScale(width: number, units: number | null): number {
  const f32 = Math.fround;
  if (units === null || !(units > 0)) return 1;
  return f32(f32(width) / f32(units));
}

/**
 * Freezes the placement for one flat note.
 *
 * The timeline key is the record's head key, and the record's own time is its head time scaled to
 * frames — the same two values the reference passes to the effective-time query each frame.
 */
export function computePlacement(record: DataView, units: number | null): Placement {
  const width = placementWidth(record);
  const lane = record.getInt32(0x28, true);
  return {
    x: lanePosition(lane, Math.fround(width)),
    y: 0,
    sx: placementScale(width, units),
    sy: 1,
    timeFrames: Math.fround(Math.fround(record.getFloat32(8, true)) * FRAMES_PER_MS),
    timelineKey: record.getInt32(0x70, true),
  };
}

/** The initial depth a note starts at, as a float32 bit pattern. */
export const INITIAL_DEPTH = fromBits(DEPTH_INIT_BITS);
/** Frames per millisecond, as the reference stores it. */
export const FRAMES_PER_MS = 0.05999999865889549;
/** Scale carried in the y slot of a flat note's transform. */
export const FLAT_Y_SCALE = fromBits(ONE_BITS);

/**
 * The model family a record's primary type selects, or null when it is not a flat one.
 *
 * The primary type is the whole selector: 0 and 4 share the tap family (a character tap is a tap
 * with the variant flag set and two extra meshes), 1 is the head of a hold, 6 is flick and 11 is
 * mine. The record's
 * *secondary* type deliberately does not appear here: it describes a second object the reference
 * constructs alongside this one, and the primary is drawn with its own model either way, so taking
 * the secondary as a veto would drop every note that carries an attached AIR.
 *
 * `variant` and `alternate` are the two flags the reference's own base init computes into the
 * object, not fields of the record; `widthIndexValue` is the reference's index over the decoded
 * lane width.
 */
export function flatModelFor(
  primaryType: number,
  variant: number,
  alternate: boolean,
  widthIndexValue: number,
): number | null {
  const family = FLAT_FAMILIES[primaryType];
  if (family === undefined) return null;
  // The tap family and a hold's head branch: their two alternates are separate mesh sets, chosen by
  // the object's variant and alternate flags.
  if ((family === "tap" || family === "holdHead") && variant !== 0)
    return modelForWidth(alternate ? "tapAlt1" : "tapAlt0", widthIndexValue);
  return modelForWidth(family, widthIndexValue);
}

/**
 * The model a hold's tail draws with: the AIR-attached tail when the record carries an attached AIR
 * (see {@link attachedAir}), the plain tail otherwise.
 */
export function holdTailModelFor(attached: boolean, widthIndexValue: number): number {
  return modelForWidth(attached ? "holdTailAir" : "holdTail", widthIndexValue);
}

/**
 * The model a slide's head draws with: the variant tap sets when the record's variant flag is set,
 * otherwise the slide's own head for its kind.
 */
export function slideHeadModelFor(
  kind: number,
  variant: number,
  alternate: boolean,
  widthIndexValue: number,
): number {
  if (variant !== 0) return modelForWidth(alternate ? "tapAlt1" : "tapAlt0", widthIndexValue);
  return slideModelFor(kind, "head", widthIndexValue);
}

/** The model on a slide's chain-closing joint; `last` and an attached AIR select the AIR variant. */
export function slideJointModelFor(
  kind: number,
  airVariant: boolean,
  widthIndexValue: number,
): number {
  return slideModelFor(kind, airVariant ? "jointAir" : "joint", widthIndexValue);
}

/** Primary type to flat mesh family; a type absent here has no flat model. */
const FLAT_FAMILIES: Readonly<Record<number, ModelFamily>> = Object.freeze({
  0: "tap",
  1: "holdHead",
  4: "tap",
  6: "flick",
  11: "mine",
});

export { modelFor, widthIndex };
export type { ModelFamily };
