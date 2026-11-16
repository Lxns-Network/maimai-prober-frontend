import { composeAffine, invertAffine, type StageShapeSkin } from "./skin";

const f = Math.fround;
const INITIAL_MAX = 1.1754943508222875e-38;

/** The draw-local bounds published when at least one skin target is resolved. */
export interface StageSkinBounds {
  readonly center: Float32Array;
  readonly size: Float32Array;
  readonly sphere: Float32Array;
}

/** Expands the source box using bone positions. Work buffers may be reused; returned bounds remain independent. */
export function skinBounds(
  skin: StageShapeSkin,
  worlds: readonly Float32Array[],
  meshWorld: Float32Array,
  sourceCenter: ArrayLike<number>,
  sourceSize: ArrayLike<number>,
  inverse = invertAffine(meshWorld),
  relative = new Float32Array(12),
  scratch = new Float64Array(9),
): StageSkinBounds | null {
  if (!skin.bones.length) return null;
  scratch[0] = scratch[1] = scratch[2] = 3.4028234663852886e38;
  // The native max accumulator starts at FLT_MIN, not at a negative value.
  scratch[3] = scratch[4] = scratch[5] = INITIAL_MAX;
  for (const bone of skin.bones) {
    composeAffine(inverse, worlds[bone], relative);
    for (let axis = 0; axis < 3; axis++) {
      const value = relative[axis * 4 + 3];
      scratch[axis] = Math.min(value, scratch[axis]);
      scratch[axis + 3] = Math.max(value, scratch[axis + 3]);
    }
  }
  const center = new Float32Array(3);
  const size = new Float32Array(3);
  for (let axis = 0; axis < 3; axis++) {
    const extent = f(sourceSize[axis] * 0.5);
    const lo = Math.min(f(sourceCenter[axis] - extent), scratch[axis]);
    const hi = Math.max(f(extent + sourceCenter[axis]), scratch[axis + 3]);
    scratch[axis + 6] = f(f(hi - lo) * 0.5);
    center[axis] = f(f(hi + lo) * 0.5);
    size[axis] = f(scratch[axis + 6] * 2);
  }
  const radius = f(
    Math.sqrt(
      f(f(f(scratch[6] * scratch[6]) + f(scratch[7] * scratch[7])) + f(scratch[8] * scratch[8])),
    ),
  );
  return { center, size, sphere: Float32Array.of(center[0], center[1], center[2], radius) };
}

/** Transforms the sphere's center by the draw joint; native retains its local radius. */
export function skinWorldSphere(sphere: ArrayLike<number>, world: ArrayLike<number>): Float32Array {
  const result = new Float32Array(4);
  for (let axis = 0; axis < 3; axis++) {
    const row = axis * 4;
    result[axis] = f(
      f(
        f(f(world[row + 1] * sphere[1]) + f(world[row] * sphere[0])) +
          f(world[row + 2] * sphere[2]),
      ) + world[row + 3],
    );
  }
  result[3] = sphere[3];
  return result;
}
