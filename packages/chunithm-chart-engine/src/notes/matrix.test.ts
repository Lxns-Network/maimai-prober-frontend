import { describe, expect, it } from "vitest";
import {
  bitsOf,
  modelFor,
  tapModelFor,
  widthIndex,
  writeJointMatrix,
  writeMatrix,
  writePositionMatrix,
  writeSlideHeadMatrix,
} from "./matrix";

const f32 = Math.fround;
const rows = (m: Float32Array) => [0, 4, 8].map((r) => [m[r], m[r + 1], m[r + 2], m[r + 3]]);

/** Signed-zero-safe comparison: -0 and 0 are different matrices here. */
const sameBits = (got: Float32Array, want: readonly number[]) =>
  want.every((w, i) => Object.is(bitsOf(got[i]), bitsOf(w)));

describe("writeMatrix", () => {
  it("keeps the multiply-by-zero-then-add sequence, including y", () => {
    const out = new Float32Array(12);
    writeMatrix(out, 0, -38, 7, -100, 2, 1, 1.3);
    expect(Object.is(out[3], f32(f32(f32(0 * 0) + -38) + f32(-100 * 0)))).toBe(true);
    expect(Object.is(out[7], f32(f32(f32(-38 * 0) + 7) + f32(-100 * 0)))).toBe(true);
    expect(Object.is(out[11], f32(f32(f32(-38 * 0) + f32(7 * 0)) + -100))).toBe(true);
  });

  it("routes y through the middle row only", () => {
    const withY = new Float32Array(12);
    const withoutY = new Float32Array(12);
    writeMatrix(withY, 0, 3, 7, -100, 1, 1, 1);
    writeMatrix(withoutY, 0, 3, 0, -100, 1, 1, 1);
    expect(withY[7]).toBe(7);
    expect(withoutY[7]).toBe(0);
    // Only the middle row's translation may differ.
    expect([withY[3], withY[11]]).toEqual([withoutY[3], withoutY[11]]);
  });

  it("scales only the diagonal", () => {
    const out = new Float32Array(12);
    writeMatrix(out, 0, 1, 2, 3, 2, 4, 8);
    expect([out[0], out[5], out[10]]).toEqual([2, 4, 8]);
    for (const i of [1, 2, 4, 6, 8, 9]) expect(Object.is(out[i], 0)).toBe(true);
  });
});

describe("degenerate coordinates", () => {
  it("places zero at the origin in every form", () => {
    const plain = new Float32Array(12);
    writeMatrix(plain, 0, 0, 0, 0, 1, 1, 1);
    expect([plain[3], plain[7], plain[11]].every((v) => Object.is(v, 0))).toBe(true);

    const position = new Float32Array(12);
    writePositionMatrix(position, 0, 0, 0, 0, 1, 1, 1);
    expect([position[3], position[7], position[11]].every((v) => Object.is(v, 0))).toBe(true);

    const slideHead = new Float32Array(12);
    writeSlideHeadMatrix(slideHead, 0, 0, 0, 1, 1, 1);
    expect([slideHead[3], slideHead[7], slideHead[11]].every((v) => Object.is(v, 0))).toBe(true);

    const joint = new Float32Array(12);
    writeJointMatrix(joint, 0, 0, 0, 1, 1, 1);
    expect([joint[3], joint[7], joint[11]].every((v) => Object.is(v, 0))).toBe(true);
  });

  it("preserves the sign of a negative zero operand in the translation", () => {
    const out = new Float32Array(12);
    writeMatrix(out, 0, -0, 0, 0, 1, 1, 1);
    // -0 + 0 is +0, so a lone negative zero on x must not survive as -0.
    expect(Object.is(out[3], 0)).toBe(true);
    expect(Object.is(out[7], f32(f32(f32(0) + 0) + 0))).toBe(true);
  });

  it("is a no-op against the identity for zero position and unit scale", () => {
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    for (const write of [
      (o: Float32Array) => writeMatrix(o, 0, 0, 0, 0, 1, 1, 1),
      (o: Float32Array) => writePositionMatrix(o, 0, 0, 0, 0, 1, 1, 1),
      (o: Float32Array) => writeJointMatrix(o, 0, 0, 0, 1, 1, 1),
    ]) {
      const out = new Float32Array(12);
      write(out);
      expect(sameBits(out, identity)).toBe(true);
    }
  });
});

describe("writeSlideHeadMatrix", () => {
  it("keeps the middle row's translation at zero", () => {
    const out = new Float32Array(12);
    writeSlideHeadMatrix(out, 0, 5, 9, 3, 4, 5);
    expect(out[3]).toBe(5);
    expect(Object.is(out[7], 0)).toBe(true);
    expect(out[11]).toBe(9);
  });
});

describe("writeJointMatrix", () => {
  it("keeps the middle row free of any zero product", () => {
    const out = new Float32Array(12);
    writeJointMatrix(out, 0, 5, 9, 3, 4, 5);
    expect(rows(out)[1][3]).toBe(Object.is(out[7], -0) ? out[7] : 0);
    expect(out[7]).toBe(f32(f32(5 * 0) + f32(9 * 0)));
  });
});

describe("width and model selection", () => {
  it("maps a raw width to a one-based clamped table index", () => {
    expect([0, 1, 2, 16, 17, 999].map(widthIndex)).toEqual([0, 0, 1, 15, 15, 15]);
    expect(widthIndex(-3)).toBe(0);
  });

  it("selects a distinct mesh per family and width", () => {
    // The table runs from the narrowest width to the widest, so width 1 takes the first entry.
    expect(modelFor("tap", 1)).toBe(81);
    expect(modelFor("tap", 16)).toBe(66);
    expect(modelFor("mine", 1)).toBe(145);
    expect(modelFor("flick", 1)).toBe(129);
    expect(new Set([modelFor("tap", 4), modelFor("mine", 4), modelFor("flick", 4)]).size).toBe(3);
  });

  it("picks the tap variant from the two object flags", () => {
    expect(tapModelFor(4, 0, false)).toBe(modelFor("tap", 4));
    expect(tapModelFor(4, 1, false)).toBe(modelFor("tapAlt0", 4));
    expect(tapModelFor(4, 1, true)).toBe(modelFor("tapAlt1", 4));
    expect(tapModelFor(1, 1, true)).toBe(113);
  });
});
