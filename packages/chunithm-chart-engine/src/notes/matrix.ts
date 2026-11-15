/**
 * Note display matrices: row-major 3×4 float32, one per note, head, tail or joint.
 *
 * Four forms exist because the placements are not interchangeable — each keeps its own rounding
 * sequence, and the multiply-by-zero-then-add pairs carry operand signs into the translation column.
 * Reproducing them bit-for-bit is the point; see `.bench/chunithm-p3-oracle/` for the reference.
 */

import { NOTE_WIDTHS, modelForWidth, type ModelFamily } from "./tables";

const scratch = new DataView(new ArrayBuffer(4));

/** Float32 bit pattern of a value. */
export function bitsOf(value: number): number {
  scratch.setFloat32(0, value, true);
  return scratch.getUint32(0, true);
}

/** Reads a float32 back from its bit pattern. */
export function fromBits(bits: number): number {
  scratch.setUint32(0, bits >>> 0, true);
  return scratch.getFloat32(0, true);
}

/** Width in lane units for a table index, or zero when the index is outside the table. */
export function widthOf(index: number): number {
  return index >= 0 && index < NOTE_WIDTHS.length ? NOTE_WIDTHS[index] : 0;
}

/**
 * Table index for a raw width value: one-based, clamped to the sixteen measured widths. The shift
 * form keeps the int32 wraparound of the reference for out-of-range input.
 */
export function widthIndex(raw: number): number {
  const n = (raw - 1) | 0;
  return n < 0 ? 0 : n >= 15 ? 15 : n;
}

/**
 * Plain model matrix: the general form used by taps, character taps and mines, and the tail form of
 * a long note. The three `n * 0` products are not dead code — each contributes the sign of its
 * operand, so removing them changes the sign of a zero in the translation column.
 */
export function writeMatrix(
  output: Float32Array,
  offset: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const f32 = Math.fround;
  const x0 = f32(x * 0);
  const y0 = f32(y * 0);
  const z0 = f32(z * 0);
  output[offset + 0] = sx;
  output[offset + 1] = f32(sy * 0);
  output[offset + 2] = f32(sz * 0);
  output[offset + 3] = f32(f32(y0 + x) + z0);
  output[offset + 4] = f32(sx * 0);
  output[offset + 5] = sy;
  output[offset + 6] = f32(sz * 0);
  output[offset + 7] = f32(f32(x0 + y) + z0);
  output[offset + 8] = f32(sx * 0);
  output[offset + 9] = f32(sy * 0);
  output[offset + 10] = sz;
  output[offset + 11] = f32(f32(x0 + y0) + z);
}

/**
 * Head matrix of a long note: the position is accumulated against the identity with one zero
 * product per column, then each column is scaled in place.
 */
export function writePositionMatrix(
  output: Float32Array,
  offset: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const f32 = Math.fround;
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
  m[3] = f32(f32(f32(f32(m[0] * x) + f32(m[1] * y)) + f32(m[2] * z)) + m[3]);
  m[7] = f32(f32(f32(f32(m[4] * x) + f32(m[5] * y)) + f32(m[6] * z)) + m[7]);
  m[11] = f32(f32(f32(f32(m[8] * x) + f32(m[9] * y)) + f32(m[10] * z)) + m[11]);
  for (const [column, scale] of [
    [0, sx],
    [1, sy],
    [2, sz],
  ] as const)
    for (const row of [0, 4, 8]) m[row + column] = f32(m[row + column] * scale);
  for (let i = 0; i < 12; i++) output[offset + i] = m[i];
}

/**
 * Head matrix of a slide or of one slide node. Only x and z are placed, and the middle row's
 * translation stays zero — the second component of the position is the identity's own zero, so it
 * is not a passthrough of any input.
 */
export function writeSlideHeadMatrix(
  output: Float32Array,
  offset: number,
  x: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const f32 = Math.fround;
  const m3 = f32(f32(f32(f32(x * 1) + f32(0 * 0)) + f32(z * 0)) + 0);
  const m7 = f32(f32(f32(f32(x * 0) + f32(1 * 0)) + f32(z * 0)) + 0);
  const m11 = f32(f32(f32(f32(x * 0) + f32(0 * 0)) + f32(z * 1)) + 0);
  output[offset + 0] = f32(sx * 1);
  output[offset + 1] = f32(sy * 0);
  output[offset + 2] = f32(sz * 0);
  output[offset + 3] = m3;
  output[offset + 4] = f32(sx * 0);
  output[offset + 5] = f32(sy * 1);
  output[offset + 6] = f32(sz * 0);
  output[offset + 7] = m7;
  output[offset + 8] = f32(sx * 0);
  output[offset + 9] = f32(sy * 0);
  output[offset + 10] = f32(sz * 1);
  output[offset + 11] = m11;
}

/**
 * Joint matrix: a position-only transform. Each translation entry keeps a single zero product
 * rather than the full sum, so this is not {@link writeMatrix} with a zero y.
 */
export function writeJointMatrix(
  output: Float32Array,
  offset: number,
  x: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const f32 = Math.fround;
  const x0 = f32(x * 0);
  const z0 = f32(z * 0);
  output[offset + 0] = sx;
  output[offset + 1] = f32(sy * 0);
  output[offset + 2] = f32(sz * 0);
  output[offset + 3] = f32(x + z0);
  output[offset + 4] = f32(sx * 0);
  output[offset + 5] = sy;
  output[offset + 6] = f32(sz * 0);
  output[offset + 7] = f32(x0 + z0);
  output[offset + 8] = f32(sx * 0);
  output[offset + 9] = f32(sy * 0);
  output[offset + 10] = sz;
  output[offset + 11] = f32(z + x0);
}

/** Model index for a family and a raw width value, matching how each constructor selects its mesh. */
export function modelFor(family: ModelFamily, rawWidth: number): number {
  return modelForWidth(family, widthIndex(rawWidth));
}

/** Model index for taps, which pick a mesh variant from two object flags before indexing by width. */
export function tapModelFor(rawWidth: number, variant: number, alternate: boolean): number {
  if (variant === 0) return modelForWidth("tap", widthIndex(rawWidth));
  return modelForWidth(alternate ? "tapAlt1" : "tapAlt0", widthIndex(rawWidth));
}
