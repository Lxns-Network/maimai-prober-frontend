/**
 * The instance world matrix: the note's own transform composed with its mesh's.
 *
 * A packed mesh carries a 3×4 matrix of its own, and it is identity for only 113 of the 185 meshes.
 * Using the note transform alone would therefore place the other 72 wrongly rather than not at all,
 * which is the kind of defect no later stage can attribute back to this step.
 *
 * The model set carries a matrix too, but for every entry where it is a single matrix it is
 * byte-equal to its mesh's — 273 of 273 in the corpus, measured — so it is the same factor rather
 * than a second one, and multiplying by it again would square the transform.
 *
 * The multiplication keeps the reference's operand grouping: each of the four products in a row is
 * rounded on its own, and the two pairs are summed and rounded once each before being added, so this
 * is not the same as a flat dot product. The transform is affine — the implicit last row is
 * (0, 0, 0, 1) — so the fourth column is `a3 + a2*b11 + a1*b7 + a0*b3`: the left translation plus the
 * right's, not the left's alone.
 */

/** A row-major 3×4 affine transform. */
export type Affine = ArrayLike<number>;

/** Rounds to float32, rejecting anything that is not already an exact finite float32. */
const finiteF32 = (value: number, label: string, index: number): number => {
  if (!Number.isFinite(value)) throw new RangeError(`${label}[${index}] must be finite`);
  if (Math.fround(value) !== value)
    throw new RangeError(`${label}[${index}] must be an exact float32`);
  return value;
};

/** Rejects a result outside the verified finite-normal domain. */
const normal = (value: number): number => {
  if (!Number.isFinite(value) || (value !== 0 && Math.abs(value) < 2 ** -126))
    throw new RangeError("A product must be a finite normal float32 or zero");
  return value;
};

/** One rounded operation of the reference's sequence. */
const f = (value: number): number => normal(Math.fround(normal(value)));

/** Reads a 3×4 transform, rejecting anything that is not exactly twelve finite float32 values. */
export function affine(values: Affine, label: string): number[] {
  if (!values || values.length !== 12)
    throw new RangeError(`${label} must hold twelve values, got ${values?.length ?? 0}`);
  const out = new Array<number>(12);
  for (let i = 0; i < 12; i++) out[i] = finiteF32(values[i], label, i);
  return out;
}

function checkAffine(values: Affine, label: string): void {
  if (!values || values.length !== 12)
    throw new RangeError(`${label} must hold twelve values, got ${values?.length ?? 0}`);
  for (let i = 0; i < 12; i++) finiteF32(values[i], label, i);
}

/**
 * Multiplies two affine 3×4 transforms, keeping the reference's rounding sequence.
 *
 * Each row is `((a3*[1 if col 3 else 0]) + (a2*b[8+col])) + ((a1*b[4+col]) + (a0*b[col]))`: the
 * innermost pair is summed and rounded, the second pair likewise, then the two are added and rounded
 * again. Accumulating the row as one running sum differs in the last bit, and the difference
 * propagates into the clip position.
 * A supplied output must have twelve elements and must not overlap either input.
 */
export function multiplyAffine(
  left: Affine,
  right: Affine,
  out: Float32Array = new Float32Array(12),
): Float32Array {
  checkAffine(left, "The left transform");
  checkAffine(right, "The right transform");
  for (let at = 0; at < 12; at += 4)
    for (let col = 0; col < 4; col++)
      out[at + col] = f(
        f(f(left[at + 3] * (col === 3 ? 1 : 0)) + f(left[at + 2] * right[8 + col])) +
          f(f(left[at + 1] * right[4 + col]) + f(left[at] * right[col])),
      );
  return out;
}

/**
 * Composes a note's display transform with its mesh's own matrix.
 *
 * The note transform is the left operand and the mesh's the right, which is the reference's order.
 * A mesh that records no matrix multiplies by the identity. Composing the other way round transposes
 * the result relative to the reference.
 * A supplied output follows `multiplyAffine`'s size and non-overlap contract.
 */
export function composeWorldMatrix(
  note: Affine,
  meshMatrix: Affine | null,
  out?: Float32Array,
): Float32Array {
  return multiplyAffine(note, meshMatrix ?? IDENTITY, out);
}

/** The affine identity, used when a mesh records no matrix of its own. */
export const IDENTITY: readonly number[] = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]);
