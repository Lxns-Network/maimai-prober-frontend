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
  result = new Float32Array(16),
): ShadowCullBox {
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
  const hx = f(size[0] * 0.5),
    hy = f(size[1] * 0.5),
    hz = f(size[2] * 0.5);
  const x = f(f(f(world[1] * hy) + f(world[0] * hx)) + f(world[2] * hz));
  const y = f(f(f(world[5] * hy) + f(world[4] * hx)) + f(world[6] * hz));
  const z = f(f(f(world[9] * hy) + f(world[8] * hx)) + f(world[10] * hz));
  const radius = f(Math.sqrt(f(f(f(x * x) + f(y * y)) + f(z * z))));
  // Native caches this radius before scaling the box extents.
  result[12] = f(hx * scale);
  result[13] = f(hy * scale);
  result[14] = f(hz * scale);
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
  const hx = f(f(f(box[4] * b) + f(box[0] * a)) + f(box[8] * c)) < 0 ? -box[12] : box[12];
  const hy = f(f(f(box[5] * b) + f(box[1] * a)) + f(box[9] * c)) < 0 ? -box[13] : box[13];
  const hz = f(f(f(box[6] * b) + f(box[2] * a)) + f(box[10] * c)) < 0 ? -box[14] : box[14];
  const x = f(f(f(box[3] + f(box[0] * hx)) + f(box[1] * hy)) + f(box[2] * hz));
  const y = f(f(f(box[7] + f(box[4] * hx)) + f(box[5] * hy)) + f(box[6] * hz));
  const z = f(f(f(box[11] + f(box[8] * hx)) + f(box[9] * hy)) + f(box[10] * hz));
  const distance = f(f(f(f(a * x) + f(b * y)) + f(c * z)) + d);
  const normalSquared = f(f(f(f(a * a) + f(b * b)) + f(c * c)) + f(d * d));
  const cornerSquared = f(f(f(y * y) + f(x * x)) + f(z * z));
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
  if (intersects) for (const plane of planes) if (!planeBox(plane, box)) return false;
  return true;
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
