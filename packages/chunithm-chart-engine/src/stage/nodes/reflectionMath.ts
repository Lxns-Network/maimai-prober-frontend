import { multiply, type Mat4 } from "../camera/math";
import type { StageCameraView } from "../view";
import { parallelDirection } from "./lights";

const f = Math.fround;

/** Plane published by a light world transform, without normalizing its direction. */
export function reflectionPlane(world: Float32Array): Float32Array {
  const [x, y, z] = parallelDirection(world);
  const dot = f(f(f(world[13] * y) + f(world[12] * x)) + f(world[14] * z));
  return Float32Array.of(x, y, z, -dot);
}

/** Row-major reflection matrix for a plane, using the native float32 operations. */
export function reflectionMatrix(plane: Float32Array): Mat4 {
  const [x, y, z, w] = plane;
  const x2 = f(x * -2);
  const y2 = f(y * -2);
  const z2 = f(z * -2);
  return Float32Array.of(
    f(1 - f(f(x + x) * x)),
    f(x2 * y),
    f(x2 * z),
    f(w * x2),
    f(y2 * x),
    f(1 - f(f(y + y) * y)),
    f(y2 * z),
    f(w * y2),
    f(z2 * x),
    f(z2 * y),
    f(1 - f(f(z + z) * z)),
    f(w * z2),
    0,
    0,
    0,
    1,
  );
}

/** Row-major projection and view of the scene as reflected through a plane. */
export function reflectedViewProjection(projection: Mat4, view: Mat4, plane: Float32Array): Mat4 {
  const env = { fpcw: 0x37f, mxcsr: 0x1f80 };
  return multiply(projection, multiply(view, reflectionMatrix(plane), env), env);
}

/** Keeps full-depth shader projection and ordering, with a separate shortened reflection frustum. */
export function reflectionRenderCamera(
  camera: StageCameraView,
  cullProjection: Mat4,
  plane: Float32Array,
): StageCameraView {
  return {
    ...camera,
    viewProjection: reflectedViewProjection(camera.projection, camera.view, plane),
    cullViewProjection: reflectedViewProjection(cullProjection, camera.view, plane),
  };
}
