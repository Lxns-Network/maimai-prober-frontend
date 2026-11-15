import * as X87 from "../camera/extended";
import { invert } from "../camera/inverse";
import {
  DEGREES_TO_RADIANS,
  FAR_MINIMUM_GAP,
  normalizedLookAt,
  sceneLookAt,
  multiply,
  perspective,
  type Mat4,
  type Vec3,
} from "../camera/math";

const ENV = { fpcw: 0x37f, mxcsr: 0x1f80 };
const TEXTURE_TRANSFORM = Float32Array.of(0.5, 0, 0, 0.5, 0, -0.5, 0, 0.5, 0, 0, 1, 0, 0, 0, 0, 1);
const f = Math.fround;
const EPSILON = 1.1920928955078125e-7;
const CORNERS: Vec3[] = [
  [1, 1, 0],
  [1, 1, 1],
  [1, -1, 0],
  [1, -1, 1],
  [-1, 1, 0],
  [-1, 1, 1],
  [-1, -1, 0],
  [-1, -1, 1],
];
const FRUSTUM_CORNERS: Vec3[] = [
  [-1, -1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [1, 1, 0],
  [-1, -1, 1],
  [-1, 1, 1],
  [1, -1, 1],
  [1, 1, 1],
];
const FRUSTUM_FACES = [
  [0, 1, 3, 2],
  [4, 6, 7, 5],
  [0, 4, 5, 1],
  [2, 3, 7, 6],
  [0, 2, 6, 4],
  [1, 5, 7, 3],
];

function transform(m: Mat4, v: [number, number, number, number]): [number, number, number, number] {
  const out = [] as number[];
  for (let i = 0; i < 4; i++) {
    const offset = 4 * i;
    const x = f(m[offset] * v[0]);
    const y = f(m[offset + 1] * v[1]);
    const z = f(m[offset + 2] * v[2]);
    const w = f(m[offset + 3] * v[3]);
    out.push(f(f(f(y + x) + z) + w));
  }
  const inverse = f(1 / out[3]);
  return [f(out[0] * inverse), f(out[1] * inverse), f(out[2] * inverse), f(out[3] * inverse)];
}

function normalize(v: Vec3): Vec3 {
  const length = f(Math.sqrt(f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2]))));
  if (length <= EPSILON) return v;
  const scale = f(1 / length);
  return [f(v[0] * scale), f(v[1] * scale), f(v[2] * scale)];
}

function normalizeOr(v: Vec3, fallback: Vec3): Vec3 {
  const length = f(Math.sqrt(f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2]))));
  if (length <= EPSILON) return fallback;
  const scale = f(1 / length);
  return [f(v[0] * scale), f(v[1] * scale), f(v[2] * scale)];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    f(f(a[1] * b[2]) - f(a[2] * b[1])),
    f(f(a[2] * b[0]) - f(a[0] * b[2])),
    f(f(a[0] * b[1]) - f(a[1] * b[0])),
  ];
}

function dot(a: Vec3, b: Vec3): number {
  return f(f(f(a[1] * b[1]) + f(a[0] * b[0])) + f(a[2] * b[2]));
}

/** Builds the native six frustum faces and the extruded near-plane center. */
export function shadowFrustumPoints(
  sourceView: Mat4,
  fovDegrees: number,
  aspect: number,
  depth0: number,
  depth1: number,
  direction: Vec3,
  length: number,
): Vec3[] {
  const low = Math.min(depth0, depth1);
  const high = Math.max(depth0, depth1);
  const near = Math.max(low, FAR_MINIMUM_GAP);
  const far = Math.max(f(low + FAR_MINIMUM_GAP), high);
  const projection = perspective(f(fovDegrees * DEGREES_TO_RADIANS), aspect, near, far, ENV);
  const inverse = multiply(invert(sourceView), invert(projection), ENV);
  const corners = FRUSTUM_CORNERS.map(
    (point) => transform(inverse, [...point, 1]).slice(0, 3) as Vec3,
  );
  const points = FRUSTUM_FACES.flatMap((face) => face.map((index) => corners[index]));
  const center = [0, 1, 2].map((axis) => {
    const sum = f(f(f(points[0][axis] + points[1][axis]) + points[2][axis]) + points[3][axis]);
    return f(f(direction[axis] * length) + f(sum * 0.25));
  }) as Vec3;
  return [...points, center];
}

/** Aggregates caster spheres; the native routine treats the first entry as a point. */
export function shadowCasterBounds(
  spheres: readonly (readonly [number, number, number, number])[],
  matrix: Mat4 | null,
): { min: Vec3; max: Vec3 } | null {
  if (!spheres.length) return null;
  const point = (sphere: readonly number[], first: boolean): Vec3 => {
    if (!matrix) return [sphere[0], sphere[1], sphere[2]];
    return [0, 1, 2].map((axis) => {
      const at = axis * 4;
      const x = f(matrix[at] * sphere[0]);
      const y = f(matrix[at + 1] * sphere[1]);
      const z = f(matrix[at + 2] * sphere[2]);
      const translation = first ? f(matrix[at + 3] * sphere[3]) : matrix[at + 3];
      return f(f(f(y + x) + z) + translation);
    }) as Vec3;
  };
  const min = point(spheres[0], true);
  const max = min.slice() as Vec3;
  for (let index = 1; index < spheres.length; index++) {
    const sphere = spheres[index];
    const center = point(sphere, false);
    for (let axis = 0; axis < 3; axis++) {
      const low = f(center[axis] - sphere[3]);
      const high = f(center[axis] + sphere[3]);
      if (min[axis] > low) min[axis] = low;
      if (high > max[axis]) max[axis] = high;
    }
  }
  return { min, max };
}

/** Projects the native frustum point list; the first point skips the perspective divide. */
export function shadowPointBounds(
  points: readonly Vec3[],
  matrix: Mat4,
): { min: Vec3; max: Vec3 } | null {
  if (!points.length) return null;
  const project = (point: Vec3, first: boolean): Vec3 => {
    const components = [0, 1, 2, 3].map((axis) => {
      const row = axis * 4;
      return f(
        f(
          f(f(matrix[row + 1] * point[1]) + f(matrix[row] * point[0])) +
            f(matrix[row + 2] * point[2]),
        ) + matrix[row + 3],
      );
    });
    if (first) return components.slice(0, 3) as Vec3;
    const inverse = f(1 / components[3]);
    return components.slice(0, 3).map((value) => f(value * inverse)) as Vec3;
  };
  const min = project(points[0], true);
  const max = min.slice() as Vec3;
  for (let index = 1; index < points.length; index++) {
    const point = project(points[index], false);
    for (let axis = 0; axis < 3; axis++) {
      if (point[axis] < min[axis]) min[axis] = point[axis];
      if (point[axis] > max[axis]) max[axis] = point[axis];
    }
  }
  return { min, max };
}

/** Initial LSPSM camera pose before the native camera refresh. */
export function shadowInitialPose(
  points: readonly Vec3[],
  casterSpheres: readonly (readonly [number, number, number, number])[],
  sourcePosition: Vec3,
  sourceTarget: Vec3,
  sourceUp: Vec3,
  direction: Vec3,
  length: number,
): { position: Vec3; target: Vec3; up: Vec3; ortho: [number, number, number, number] } {
  let forward = normalizeOr(
    sourceTarget.map((value, axis) => f(value - sourcePosition[axis])) as Vec3,
    [0, 0, 1],
  );
  const upScale = f(
    1 / f(Math.sqrt(f(f(f(sourceUp[0] ** 2) + f(sourceUp[1] ** 2)) + f(sourceUp[2] ** 2)))),
  );
  const cameraUp = sourceUp.map((value) => f(value * upScale)) as Vec3;
  if (Math.abs(dot(forward, direction)) > f(0.99)) forward = cameraUp;
  if (Math.abs(dot(forward, direction)) > f(0.99)) forward = [0, -1, 0];
  if (Math.abs(dot(forward, direction)) > f(0.99)) forward = [0, 0, 1];
  const right = normalizeOr(cross(direction, forward), [1, 0, 0]);
  const up = normalizeOr(cross(right, direction), [0, 1, 0]);
  const lightView = normalizedLookAt([0, 0, 0], direction, up, ENV);
  const bounds = shadowPointBounds(points, lightView);
  if (!bounds) throw new RangeError("LSPSM requires frustum points");
  const casterBounds = shadowCasterBounds(casterSpheres, lightView);
  let { min, max } = bounds;
  if (
    casterBounds &&
    min.every((value, axis) => casterBounds.max[axis] > value) &&
    max.every((value, axis) => value > casterBounds.min[axis])
  ) {
    min = min.map((value, axis) => Math.max(value, casterBounds.min[axis])) as Vec3;
    max = max.map((value, axis) => Math.min(value, casterBounds.max[axis])) as Vec3;
  }
  const inverseView = invert(lightView);
  const apply = (matrix: Mat4, v: Vec3): Vec3 =>
    [0, 1, 2].map((axis) => {
      const row = axis * 4;
      return f(
        f(f(f(matrix[row + 1] * v[1]) + f(matrix[row] * v[0])) + f(matrix[row + 2] * v[2])) +
          matrix[row + 3],
      );
    }) as Vec3;
  const lowWorld = apply(inverseView, min);
  const highWorld = apply(inverseView, max);
  const target = lowWorld.map((value, axis) =>
    f(f(f(highWorld[axis] - value) * f(0.5)) + value),
  ) as Vec3;
  const center = apply(lightView, target);
  const origin = apply(inverseView, [center[0], center[1], f(min[2] - length)]);
  const delta = target.map((value, axis) => f(value - origin[axis])) as Vec3;
  const deltaLength = f(Math.sqrt(f(f(f(delta[0] ** 2) + f(delta[1] ** 2)) + f(delta[2] ** 2))));
  const unit = deltaLength <= EPSILON ? delta : delta.map((value) => f(value * f(1 / deltaLength)));
  const position = origin.map((value, axis) =>
    f(value + f(f(unit[axis] * length) * f(0.5))),
  ) as Vec3;
  const half = min.map((value, axis) => f(max[axis] - f(f(f(max[axis] - value) * f(0.5)) + value)));
  return {
    position,
    target,
    up,
    ortho: [f(half[0] * 2), f(half[1] * 2), 0, f(f(half[2] * 2) + length)],
  };
}

/** The second native overlap test uses the opposite endpoint ordering. */
export function shadowLspsmBounds(
  points: { min: Vec3; max: Vec3 },
  casters: { min: Vec3; max: Vec3 } | null,
): { min: Vec3; max: Vec3 } {
  if (
    !casters ||
    !points.max.every((value, axis) => casters.min[axis] > value) ||
    !points.min.every((value, axis) => value > casters.max[axis])
  )
    return points;
  return {
    min: points.min.map((value, axis) => Math.min(value, casters.max[axis])) as Vec3,
    max: points.max.map((value, axis) => Math.max(value, casters.min[axis])) as Vec3,
  };
}

/** Native LSPSM clip matrix after perspective warping. */
export function shadowFitProjection(min: Vec3, max: Vec3): Mat4 {
  const x = f(1 / f(max[0] - min[0]));
  const y = f(1 / f(max[1] - min[1]));
  const z = f(1 / f(max[2] - min[2]));
  return Float32Array.of(
    f(x + x),
    0,
    0,
    -f(f(min[0] + max[0]) * x),
    0,
    f(y + y),
    0,
    -f(f(min[1] + max[1]) * y),
    0,
    0,
    z,
    -f(z * min[2]),
    0,
    0,
    0,
    1,
  );
}

/** Warped LSPSM camera; a near-parallel light keeps the initial camera instead. */
export function shadowWarpCamera(
  sourcePosition: Vec3,
  sourceTarget: Vec3,
  lightDirection: Vec3,
  lightUp: Vec3,
  lightMin: Vec3,
  lightMax: Vec3,
  extraNear: number,
  extraFar: number,
): { view: Mat4; projection: Mat4; near: number } | null {
  const cameraDirection = normalize(
    sourceTarget.map((value, axis) => f(value - sourcePosition[axis])) as Vec3,
  );
  const light = lightDirection.map((value) => -value) as Vec3;
  const dot = f(
    f(f(cameraDirection[1] * light[1]) + f(cameraDirection[2] * light[2])) +
      f(cameraDirection[0] * light[0]),
  );
  if (Math.abs(dot) > f(0.97)) return null;
  const span = Math.abs(f(lightMax[1] - lightMin[1]));
  const cutoff = f(0.4);
  let extent = f(100000);
  if (dot < cutoff) extent = f(f(f(cutoff - dot) * f(1000000)) + extent);
  let offset = f(0.5);
  if (dot < 0) offset = f(f(f(1 - dot) * cutoff) + f(0.1));
  extent = Math.max(extent, span);
  const nearOffset = f(f(extraNear + offset) - 1);
  const depth = f(f(extent + extraFar) - 1);
  const sine = f(Math.sqrt(f(1 - f(dot * dot))));
  const inverseSine = f(1 / sine);
  const scaledOffset = f(inverseSine * nearOffset);
  const near = f(
    f(f(Math.sqrt(f(f(f(sine * depth) + scaledOffset) * scaledOffset))) + scaledOffset) *
      inverseSine,
  );
  const far = f(near + depth);
  const shift = f(near + nearOffset);
  const eye = sourcePosition.map((value, axis) => f(value - f(lightUp[axis] * shift))) as Vec3;
  const target = eye.map((value, axis) => f(value + light[axis])) as Vec3;
  const view = normalizedLookAt(eye, target, lightUp, ENV);
  const projection = Float32Array.of(
    1,
    0,
    0,
    0,
    0,
    f(far / f(far - near)),
    0,
    f(f(far * near) / f(near - far)),
    0,
    0,
    -1,
    0,
    0,
    1,
    0,
    0,
  );
  return { view, projection, near };
}

/** Fits a completed LSPSM warp to the frustum. */
export function shadowFitWarp(
  points: readonly Vec3[],
  lightView: Mat4,
  warpProjection: Mat4,
): { view: Mat4; projection: Mat4 } {
  const warpViewProjection = multiply(warpProjection, lightView, ENV);
  const bounds = shadowPointBounds(points, warpViewProjection);
  if (!bounds) throw new RangeError("LSPSM requires frustum points");
  const projection = multiply(shadowFitProjection(bounds.min, bounds.max), warpProjection, ENV);
  return { view: lightView, projection };
}

/** Updates the LSPSM projection after the initial native camera has been refreshed. */
export function shadowLspsmCamera(
  points: readonly Vec3[],
  casterSpheres: readonly (readonly [number, number, number, number])[],
  initialView: Mat4,
  sourcePosition: Vec3,
  sourceTarget: Vec3,
  lightDirection: Vec3,
  lightUp: Vec3,
  extraNear: number,
  extraFar: number,
): { view: Mat4; projection: Mat4 } | null {
  const pointsBounds = shadowPointBounds(points, initialView);
  if (!pointsBounds) throw new RangeError("LSPSM requires frustum points");
  const bounds = shadowLspsmBounds(pointsBounds, shadowCasterBounds(casterSpheres, initialView));
  const warp = shadowWarpCamera(
    sourcePosition,
    sourceTarget,
    lightDirection,
    lightUp,
    bounds.min,
    bounds.max,
    extraNear,
    extraFar,
  );
  return warp && shadowFitWarp(points, warp.view, warp.projection);
}

/** Sphere of the eight D3D clip corners transformed by the native inverse view-projection. */
export function shadowFrustumSphere(inverseViewProjection: Mat4): {
  points: Vec3[];
  center: Vec3;
  radius: number;
} {
  const points = CORNERS.map(
    (point) => transform(inverseViewProjection, [...point, 1]).slice(0, 3) as Vec3,
  );
  const center: Vec3 = [0, 0, 0];
  for (const point of points)
    for (let axis = 0; axis < 3; axis++) center[axis] = f(center[axis] + point[axis]);
  const inverseCount = f(1 / points.length);
  for (let axis = 0; axis < 3; axis++) center[axis] = f(center[axis] * inverseCount);
  let radius = 0;
  for (const point of points) {
    const x = f(center[0] - point[0]);
    const y = f(center[1] - point[1]);
    const z = f(center[2] - point[2]);
    radius = Math.max(radius, f(Math.sqrt(f(f(f(x * x) + f(y * y)) + f(z * z)))));
  }
  return { points, center, radius };
}

/** Uniform cascade retains its previous radius within the depth-span threshold. */
export function shadowCachedRadius(
  radius: number,
  previous: number,
  near: number,
  far: number,
): number {
  const difference = f(previous - radius);
  const magnitude = difference < 0 ? -difference : difference;
  return magnitude <= f(f(far - near) * f(0.1)) ? previous : radius;
}

/** Pose and orthographic parameters before texel alignment. */
export function shadowUniformPose(center: Vec3, radius: number, direction: Vec3, length: number) {
  const normal = normalize(direction);
  const offset = f(0.02);
  const light = normalize([f(normal[0] + offset), f(normal[1] + offset), f(normal[2] + offset)]);
  const distance = f(radius + length);
  const position = center.map((value, axis) => f(f(light[axis] * distance) + value)) as Vec3;
  const target = position.map((value, axis) => f(value - light[axis])) as Vec3;
  const width = f(radius * 2);
  const far = f(f(length + length) + f(radius * 4));
  return {
    direction: light,
    position,
    target,
    up: [0, 0, 1] as Vec3,
    ortho: [width, width, 0, far],
  };
}

/** Applies the native ceil-to-texel adjustment using its already computed inverse matrix. */
export function shadowAlignUniformPose(
  position: Vec3,
  direction: Vec3,
  viewProjection: Mat4,
  inverseViewProjection: Mat4,
  width: number,
  height: number,
): { position: Vec3; target: Vec3 } {
  const projected = transform(viewProjection, [0, 0, 0, 1]);
  const size = [f(f(width) * 0.5), f(f(height) * 0.5)];
  const bits = X87.precisionBits(ENV.fpcw);
  const aligned = [0, 1].map((axis) => {
    const pixel = f(projected[axis] * size[axis]);
    return X87.toFloat32(
      X87.divide(X87.fromNumber(Math.ceil(pixel)), X87.fromNumber(size[axis]), bits),
    );
  });
  const origin = transform(inverseViewProjection, [
    aligned[0],
    aligned[1],
    projected[2],
    projected[3],
  ]);
  const shifted = position.map((value, axis) => f(value - origin[axis])) as Vec3;
  return {
    position: shifted,
    target: shifted.map((value, axis) => f(value - direction[axis])) as Vec3,
  };
}

/** Builds the view from the pose emitted by the uniform shadow-camera update. */
export function shadowUniformView(position: Vec3, target: Vec3): Mat4 {
  return sceneLookAt(position, target, [0, 0, 1], ENV);
}

/** Orthographic projection emitted by the uniform shadow camera. */
export function shadowUniformProjection(
  width: number,
  height: number,
  near: number,
  far: number,
): Mat4 {
  const left = f(width * -0.5);
  const right = f(width * 0.5);
  const bottom = f(height * -0.5);
  const top = f(height * 0.5);
  const x = f(1 / f(right - left));
  const y = f(1 / f(top - bottom));
  const z = f(1 / f(far - near));
  return Float32Array.of(
    f(x + x),
    0,
    0,
    -f(f(left + right) * x),
    0,
    f(y + y),
    0,
    -f(f(bottom + top) * y),
    0,
    0,
    -z,
    -f(z * near),
    0,
    0,
    0,
    1,
  );
}

/** Rebuilds the orthographic camera-property projection used for scene clipping. */
export function shadowCullProjection(
  width: number,
  height: number,
  near: number,
  far: number,
): Mat4 {
  near = f(near);
  far = f(far);
  return shadowUniformProjection(width, height, near, Math.max(far, f(near + FAR_MINIMUM_GAP)));
}

/** Replaces only source depth terms for one uniform cascade; callers retain `radius` across frames. */
export function shadowUniformCamera(
  sourceView: Mat4,
  projectionInput: Mat4,
  parallel: boolean,
  near: number,
  far: number,
  direction: Vec3,
  length: number,
  width: number,
  height: number,
  previousRadius: number,
): { view: Mat4; projection: Mat4; cullProjection: Mat4; sourceProjection: Mat4; radius: number } {
  const sourceProjection = projectionInput.slice();
  const farClip = Math.max(far, f(near + FAR_MINIMUM_GAP));
  if (parallel) {
    const depth = shadowCullProjection(1, 1, near, farClip);
    sourceProjection[10] = depth[10];
    sourceProjection[11] = depth[11];
  } else {
    const depth = f(1 / f(near - farClip));
    sourceProjection[10] = f(depth * farClip);
    sourceProjection[11] = f(f(near * farClip) * depth);
  }
  const sphere = shadowFrustumSphere(invert(multiply(sourceProjection, sourceView, ENV)));
  const radius = shadowCachedRadius(sphere.radius, previousRadius, near, far);
  const pose = shadowUniformPose(sphere.center, radius, direction, length);
  const projection = shadowUniformProjection(
    pose.ortho[0],
    pose.ortho[1],
    pose.ortho[2],
    pose.ortho[3],
  );
  const viewProjection = multiply(projection, shadowUniformView(pose.position, pose.target), ENV);
  const aligned = shadowAlignUniformPose(
    pose.position,
    pose.direction,
    viewProjection,
    invert(viewProjection),
    width,
    height,
  );
  return {
    view: shadowUniformView(aligned.position, aligned.target),
    projection,
    cullProjection: shadowCullProjection(
      pose.ortho[0],
      pose.ortho[1],
      pose.ortho[2],
      pose.ortho[3],
    ),
    sourceProjection,
    radius,
  };
}

/** Row-major light view-projection transformed to shadow-texture coordinates. */
export function shadowTextureMatrix(view: Mat4, projection: Mat4): Mat4 {
  return multiply(multiply(TEXTURE_TRANSFORM, projection, ENV), view, ENV);
}
