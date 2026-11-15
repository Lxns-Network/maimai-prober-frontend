import { describe, expect, it } from "vitest";
import { IDENTITY, affine, composeWorldMatrix, multiplyAffine } from "./worldMatrix";
const flat = (m: ArrayLike<number>) => Array.from(m);
const bits = (v: number) => {
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, v, true);
  return b.getUint32(0, true);
};
describe("multiplyAffine", () => {
  it("is the identity when the right operand is", () => {
    const a = [2, 0, 0, 5, 0, 3, 0, 7, 0, 0, 4, 9];
    expect(flat(multiplyAffine(a, IDENTITY))).toEqual(a.map(Math.fround));
  });
  it("rounds each product on its own, as the reference's sequence does", () => {
    // Every product and every partial sum is rounded to float32 before the next operation. These
    // operands (found by `probe-rounding-order.mjs`) are the evidence that the distinction is real:
    // rounding each product gives 23.578720092773438, while accumulating the same row in float64 and
    // rounding once gives 23.578718185424805. An implementation that skipped the per-product
    // rounding would therefore land on a different last bit, which reaches the clip position.
    const a = [2.791168212890625, 1.8977943658828735, 2.62687611579895, 0, 0, 1, 0, 0, 0, 0, 1, 0];
    const b = [3.961275815963745, 0, 0, 0, 3.0165562629699707, 1, 0, 0, 2.587608814239502, 0, 1, 0];
    const f32 = Math.fround;
    const got = multiplyAffine(a, b);
    const expected = f32(
      f32(f32(a[3] * 0) + f32(a[2] * b[8])) + f32(f32(a[1] * b[4]) + f32(a[0] * b[0])),
    );
    expect(bits(got[0])).toBe(bits(expected));
    expect(expected).toBe(23.578720092773438);
    // The single-rounding value really is different, so the assertion above has teeth.
    const onceRounded = f32(a[3] * 0 + a[2] * b[8] + a[1] * b[4] + a[0] * b[0]);
    expect(bits(onceRounded)).not.toBe(bits(expected));
  });
  it("rejects an operand that is not twelve exact float32 values", () => {
    expect(() => affine([1, 2, 3], "x")).toThrow(/twelve values/);
    // Too many values must be rejected too: truncating would silently ignore an operand's tail and
    // compose the matrix from the wrong twelve numbers.
    expect(() => affine([...new Array<number>(12).fill(0), 1], "x")).toThrow(/twelve values/);
    expect(() => multiplyAffine([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 9], IDENTITY)).toThrow(
      /twelve values/,
    );
    expect(() => affine([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0.1], "x")).toThrow(/exact float32/);
    expect(() => affine([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, NaN], "x")).toThrow(/must be finite/);
  });
  it("adds the right operand's translation into the fourth column", () => {
    // The transform is affine, so the fourth column is `a3 + a2*b11 + a1*b7 + a0*b3`: the left
    // translation plus the rotated right one. Reading it as the left translation alone would drop
    // the mesh's own offset, which is exactly the non-identity case in the corpus.
    //
    // The left operand is a rotation with a scale, not a diagonal: with a diagonal left operand the
    // `a2*b11` and `a1*b7` terms are zero and the column would come out right even if they were
    // dropped. Every product in the column must be non-zero for this to have teeth.
    const a = [0, -2, 0, 10, 3, 0, 0, 20, 0, 0, 4, 30];
    const b = [1, 0, 0, 1, 0, 1, 0, 2, 0, 0, 1, 3];
    const got = flat(multiplyAffine(a, b));
    // row0: ((10*1) + (0*3)) + ((-2*1) + (0*0)) = 6
    // row1: ((20*1) + (0*3)) + ((0*1) + (3*1)) = 23
    // row2: ((30*1) + (4*3)) + ((0*1) + (0*0)) = 42
    expect(got.slice(3, 4)).toEqual([6]);
    expect(got.slice(7, 8)).toEqual([23]);
    expect(got.slice(11, 12)).toEqual([42]);
    // The identity on the left returns the right operand unchanged, pinning the whole product rather
    // than only its translation column.
    const rot = [0, -1, 0, 1, 1, 0, 0, 2, 0, 0, 1, 3];
    expect(flat(multiplyAffine(IDENTITY, rot))).toEqual(rot.map(Math.fround));
  });
  it("is not commutative, so operand order matters", () => {
    const a = [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0];
    const b = [2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 4, 0];
    expect(flat(multiplyAffine(a, b))).not.toEqual(flat(multiplyAffine(b, a)));
  });
});
describe("composeWorldMatrix", () => {
  it("returns the note transform unchanged when the mesh has no matrix", () => {
    const note = [1, 0, 0, 3, 0, 1, 0, 4, 0, 0, 1, 5];
    expect(flat(composeWorldMatrix(note, null))).toEqual(note.map(Math.fround));
  });
  it("applies the mesh matrix on the right", () => {
    const note = [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0];
    const mesh = [0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    expect(flat(composeWorldMatrix(note, mesh))).toEqual(flat(multiplyAffine(note, mesh)));
  });
});
