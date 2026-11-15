import { composeAffine, invertAffine, type StageShapeSkin } from "./skin";

const f = Math.fround;
const INITIAL_MAX = 1.1754943508222875e-38;

/** The draw-local bounds published when at least one skin target is resolved. */
export interface StageSkinBounds {
  readonly center: Float32Array;
  readonly size: Float32Array;
  readonly sphere: Float32Array;
}

/** Expands a shape's source box to the positions of its bound skin providers. */
export function skinBounds(
  skin: StageShapeSkin,
  worlds: readonly Float32Array[],
  meshWorld: Float32Array,
  sourceCenter: ArrayLike<number>,
  sourceSize: ArrayLike<number>,
): StageSkinBounds | null {
  if (!skin.bones.length) return null;
  const inverse = invertAffine(meshWorld);
  const relative = new Float32Array(12);
  const min = [3.4028234663852886e38, 3.4028234663852886e38, 3.4028234663852886e38];
  // The native max accumulator starts at FLT_MIN, not at a negative value.
  const max = [INITIAL_MAX, INITIAL_MAX, INITIAL_MAX];
  for (const bone of skin.bones) {
    composeAffine(inverse, worlds[bone], relative);
    for (let axis = 0; axis < 3; axis++) {
      const value = relative[axis * 4 + 3];
      min[axis] = Math.min(value, min[axis]);
      max[axis] = Math.max(value, max[axis]);
    }
  }
  const center = new Float32Array(3);
  const size = new Float32Array(3);
  const half = new Float32Array(3);
  for (let axis = 0; axis < 3; axis++) {
    const extent = f(sourceSize[axis] * 0.5);
    const lo = Math.min(f(sourceCenter[axis] - extent), min[axis]);
    const hi = Math.max(f(extent + sourceCenter[axis]), max[axis]);
    half[axis] = f(f(hi - lo) * 0.5);
    center[axis] = f(f(hi + lo) * 0.5);
    size[axis] = f(half[axis] * 2);
  }
  const radius = f(
    Math.sqrt(f(f(f(half[0] * half[0]) + f(half[1] * half[1])) + f(half[2] * half[2]))),
  );
  return { center, size, sphere: Float32Array.of(...center, radius) };
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
