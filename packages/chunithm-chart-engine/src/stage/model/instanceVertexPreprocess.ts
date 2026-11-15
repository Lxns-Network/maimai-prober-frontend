import { composeAffine, type StageShapeSkin } from "./skin";

const f = Math.fround;

/** Joint matrices installed on an instance draw before its vertices are preprocessed. */
export function instancePreprocessMatrices(
  skin: StageShapeSkin,
  initialWorlds: readonly Float32Array[],
): Float32Array[] {
  return skin.bones.map((bone, index) =>
    composeAffine(initialWorlds[bone], skin.binds[index], new Float32Array(12)),
  );
}

/** Preprocess instance vertices with the draw's bind matrices and owner bone mapping. */
export function preprocessInstanceVertices(
  vertices: Uint8Array,
  stride: number,
  positionOffset: number,
  weightOffset: number,
  matrices: readonly ArrayLike<number>[],
  mapping: readonly number[],
  root: ArrayLike<number>,
  secondaryWeightOffset: number | null = null,
): { vertices: Uint8Array; blendingEnabled: boolean } {
  const out = Uint8Array.from(vertices);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  const count = out.length / stride;
  let secondWeights = 0;
  for (let index = 0; index < count; index++)
    if (out[index * stride + weightOffset + 2]) secondWeights++;
  const blendingEnabled = f(secondWeights / count) > f(0.05);
  const transform = (matrix: ArrayLike<number>, position: readonly number[], row: number) =>
    f(
      f(
        f(f(matrix[row + 1] * position[1]) + f(matrix[row] * position[0])) +
          f(matrix[row + 2] * position[2]),
      ) + matrix[row + 3],
    );
  const weightOffsets =
    secondaryWeightOffset === null ? [weightOffset] : [weightOffset, secondaryWeightOffset];
  for (let index = 0; index < count; index++) {
    const base = index * stride;
    const at = base + positionOffset;
    const weights = base + weightOffset;
    const original = [
      view.getFloat32(at, true),
      view.getFloat32(at + 4, true),
      view.getFloat32(at + 8, true),
    ];
    const position = [0, 0, 0];
    for (const offset of weightOffsets) {
      for (let influence = 0; influence < 2; influence++) {
        const weight = out[base + offset + influence * 2];
        const bone = out[base + offset + influence * 2 + 1];
        for (let row = 0; row < 3; row++) {
          const value =
            bone < matrices.length ? transform(matrices[bone], original, row * 4) : original[row];
          position[row] = f(position[row] + f(f(value * weight) * f(1 / 255)));
        }
      }
    }
    if (mapping.length) {
      let high = 0;
      for (let influence = 0; influence < 2; influence++) {
        const atIndex = weights + influence * 2 + 1;
        const target = out[atIndex] < mapping.length ? mapping[out[atIndex]] | 0 : 0;
        out[atIndex] = target % 255;
        high |= Math.trunc(target / 255) << (4 * influence);
      }
      if (!blendingEnabled) out[weights] = 255;
      out[weights + 2] = high;
    }
    for (let row = 0; row < 3; row++)
      view.setFloat32(at + row * 4, transform(root, position, row * 4), true);
  }
  return { vertices: out, blendingEnabled };
}
