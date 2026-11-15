import type { Vec3 } from "../camera/math";

const f = Math.fround;
const EPSILON = 1.1920928955078125e-7;
const PLANE_TOLERANCE = 1.1920928955078125e-5;

/** Native oriented box: a row-major 3x4 transform, half extents, and cached radius. */
export type ShadowCullBox = Float32Array;

/** Builds the kind-0 draw box from its source box and matrix provider. */
export function shadowCullBox(
  center: ArrayLike<number>,
  size: ArrayLike<number>,
  world: ArrayLike<number>,
  scale: number,
): ShadowCullBox {
  const result = new Float32Array(16);
  result.set(world);
  for (let axis = 0; axis < 3; axis++) {
    const row = axis * 4;
    result[row + 3] = f(
      f(
        f(f(world[row + 1] * center[1]) + f(world[row] * center[0])) +
          f(world[row + 2] * center[2]),
      ) + world[row + 3],
    );
  }
  const half = [f(size[0] * 0.5), f(size[1] * 0.5), f(size[2] * 0.5)];
  const transformed = [0, 1, 2].map((axis) => {
    const row = axis * 4;
    return f(
      f(f(world[row + 1] * half[1]) + f(world[row] * half[0])) + f(world[row + 2] * half[2]),
    );
  });
  const radius = f(
    Math.sqrt(
      f(
        f(f(transformed[0] * transformed[0]) + f(transformed[1] * transformed[1])) +
          f(transformed[2] * transformed[2]),
      ),
    ),
  );
  // Native caches this radius before scaling the box extents.
  for (let axis = 0; axis < 3; axis++) result[12 + axis] = f(half[axis] * scale);
  result[15] = radius;
  return result;
}

function planeSphere(plane: readonly number[], box: ShadowCullBox): 0 | 1 | 2 {
  const [a, b, c, d] = plane;
  const x = box[3],
    y = box[7],
    z = box[11],
    r = box[15];
  const distance = f(f(f(f(b * y) + f(a * x)) + f(c * z)) + d);
  const normalSquared = f(f(f(f(a * a) + f(b * b)) + f(c * c)) + f(d * d));
  const centerSquared = f(f(f(x * x) + f(y * y)) + f(z * z));
  const tolerance = -f(f(f(r * r) + f(centerSquared + normalSquared)) * PLANE_TOLERANCE);
  if (distance > tolerance) return 2;
  return f(r + distance) > tolerance ? 1 : 0;
}

function planeBox(plane: readonly number[], box: ShadowCullBox): boolean {
  const [a, b, c, d] = plane;
  const half = [box[12], box[13], box[14]];
  for (let axis = 0; axis < 3; axis++) {
    const dot = f(f(f(box[4 + axis] * b) + f(box[axis] * a)) + f(box[8 + axis] * c));
    if (dot < 0) half[axis] = -half[axis];
  }
  const corner = [0, 1, 2].map((axis) => {
    const row = axis * 4;
    return f(
      f(f(box[row + 3] + f(box[row] * half[0])) + f(box[row + 1] * half[1])) +
        f(box[row + 2] * half[2]),
    );
  });
  const distance = f(f(f(f(a * corner[0]) + f(b * corner[1])) + f(c * corner[2])) + d);
  const normalSquared = f(f(f(f(a * a) + f(b * b)) + f(c * c)) + f(d * d));
  const cornerSquared = f(
    f(f(corner[1] * corner[1]) + f(corner[0] * corner[0])) + f(corner[2] * corner[2]),
  );
  return distance > -f(f(normalSquared + cornerSquared) * PLANE_TOLERANCE);
}

/** Tests the native broad-phase sphere and, if needed, the oriented box against a plane set. */
export function shadowBoxVisible(
  box: ShadowCullBox,
  planes: readonly (readonly number[])[],
): boolean {
  if (!planes.length) return false;
  let intersects = false;
  for (const plane of planes) {
    const result = planeSphere(plane, box);
    if (result === 0) return false;
    intersects ||= result === 1;
  }
  return !intersects || planes.every((plane) => planeBox(plane, box));
}

/** Applies the kind-0 draw's native bounding-box and distance-band tests. */
export function shadowCullMesh(
  sphere: readonly number[],
  center: Vec3,
  size: Vec3,
  world: ArrayLike<number>,
  camera: Vec3,
  planes: readonly (readonly number[])[],
  thresholds: readonly number[],
  lodMask: number,
  scale: number,
  cullDisabled: boolean,
): boolean {
  if (!cullDisabled) {
    const box = shadowCullBox(center, size, world, scale);
    if (box[15] > EPSILON && !shadowBoxVisible(box, planes)) return false;
  }
  const x = f(camera[0] - sphere[0]);
  const y = f(camera[1] - sphere[1]);
  const z = f(camera[2] - sphere[2]);
  const distance = f(f(Math.sqrt(f(f(f(x * x) + f(y * y)) + f(z * z)))) - sphere[3]);
  let band = 0;
  while (band < 4 && !(thresholds[band] > distance)) band++;
  return (lodMask & (1 << band)) !== 0;
}
