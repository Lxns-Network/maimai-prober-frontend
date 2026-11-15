import type { StageMotionRecord } from "../graph";
import {
  sceneState,
  type MotionBehavior,
  type MotionInstance,
  type StageNode,
  type StageScene,
} from "../runtime";
import { inverseAffine, multiplyAffine, rotateCodes, setIdentity } from "../../math/matrix";
import { atan2Float32 } from "../camera/arctangent";
import { lookAt, upFromDirection, type Vec3 } from "../camera/math";

const f = Math.fround;
const EPSILON = f(0.0000001);
const FACING_LIMIT = f(0.01);

/** The scene camera: eye, look-at point, up vector and roll angle code. */
export interface StageCamera {
  readonly eye: Float32Array;
  readonly at: Float32Array;
  readonly up: Float32Array;
  roll: number;
  fovCode?: number;
  parallel?: boolean;
}

/** The camera a scene's motions face; the environment's initial camera until a camera node moves it. */
export function sceneCamera(scene: StageScene): StageCamera {
  return sceneState<StageCamera>(scene, "turnCamera.camera", () => ({
    eye: Float32Array.of(0, 0, 200),
    at: Float32Array.of(0, 0, 0),
    up: Float32Array.of(0, 1, 0),
    roll: 0,
  }));
}

/** The published display camera view in affine memory order, before render projection. */
export function displayCameraMatrix(scene: StageScene): Float32Array {
  const camera = sceneCamera(scene);
  const eye = Array.from(camera.eye) as Vec3;
  const at = Array.from(camera.at) as Vec3;
  const up = Array.from(camera.up) as Vec3;
  const effective =
    camera.roll === 0
      ? up
      : upFromDirection(eye, at, [f(up[0] * 0), up[1], f(up[2] * 0)], camera.roll, ENV);
  const view = lookAt(eye, at, effective, ENV);
  const matrix = new Float32Array(16);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) matrix[column * 4 + row] = view[row * 4 + column];
    matrix[12 + row] = -f(
      f(f(eye[0] * view[row * 4]) + f(eye[1] * view[row * 4 + 1])) + f(eye[2] * view[row * 4 + 2]),
    );
  }
  matrix[15] = 1;
  return matrix;
}

function fail(message: string): never {
  throw new RangeError(`Stage turn camera: ${message}`);
}

const inverse = new Float32Array(16);
const turn = new Float32Array(16);
const product = new Float32Array(16);
const halfTurn = Int32Array.of(0, 0x8000, 0);

/** Normalizes unless the squared length is near zero or one; the sum starts with the second component. */
function normalize(v: Float32Array): void {
  const squared = f(f(f(v[1] * v[1]) + f(v[0] * v[0])) + f(v[2] * v[2]));
  if (EPSILON > Math.abs(squared) || EPSILON > Math.abs(f(squared - 1))) return;
  const s = f(1 / f(Math.sqrt(squared)));
  v[0] = f(s * v[0]);
  v[1] = f(s * v[1]);
  v[2] = f(s * v[2]);
}

/** The rotation taking +Z onto `b`; false, leaving the identity, when `b` points almost straight back. */
function rotationFromZ(b: Float32Array, out: Float32Array): boolean {
  const a0 = 0;
  const a1 = 0;
  const a2 = 1;
  const cx = f(f(b[1] * a2) - f(b[2] * a1));
  const cy = f(f(a0 * b[2]) - f(b[0] * a2));
  const cz = f(f(b[0] * a1) - f(a0 * b[1]));
  const dot = f(f(f(b[0] * a0) + f(a1 * b[1])) + f(b[2] * a2));
  const root = f(Math.sqrt(f(f(dot + dot) + 2)));
  setIdentity(out);
  if (FACING_LIMIT > root) return false;
  const r = f(1 / root);
  const w = f(root * 0.5);
  const x = f(r * cx);
  const y = f(r * cy);
  const z = f(r * cz);
  const yy2 = f(f(y * y) + f(y * y));
  const zz2 = f(f(z * z) + f(z * z));
  const xx2 = f(f(x * x) + f(x * x));
  const xy = f(y * x);
  const wz = f(w * z);
  const zx = f(z * x);
  const wy = f(w * y);
  const zy = f(z * y);
  const wx = f(w * x);
  out[0] = f(1 - f(yy2 + zz2));
  out[1] = f(f(xy - wz) + f(xy - wz));
  out[4] = f(f(wz + wz) + f(xy + xy));
  out[2] = f(f(wy + wy) + f(zx + zx));
  out[8] = f(f(zx - wy) + f(zx - wy));
  out[10] = f(1 - f(xx2 + yy2));
  out[5] = f(1 - f(xx2 + zz2));
  out[6] = f(f(zy - wx) + f(zy - wx));
  out[9] = f(f(wx + wx) + f(zy + zy));
  return true;
}

const toward = new Float32Array(3);
const side = new Float32Array(3);
const cameraUp = new Float32Array(3);
const axisCodes = new Int32Array(3);
const ANGLE_CODES_PER_RADIAN = f(10430.378);
const ENV = { fpcw: 0x37f, mxcsr: 0x1f80 };

class TurnCamera implements MotionInstance {
  readonly behavior = turnCameraMotion;
  readonly mode: number;
  readonly distance: number;

  constructor(
    readonly scene: StageScene,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    const data = record.data ?? fail("motion without data");
    this.mode = g.u32(data);
    if (this.mode > 4) fail(`mode ${this.mode}`);
    this.distance = g.f32(data + 4);
  }

  update(node: StageNode, scratch: Float32Array): boolean {
    const camera = sceneCamera(this.scene);
    const target = node.world;
    const eye = camera.eye;
    const px = target[12];
    const py = target[13];
    const pz = target[14];
    if (this.mode !== 1) {
      const dx = f(eye[0] - px);
      const dy = f(eye[1] - py);
      const dz = f(eye[2] - pz);
      inverseAffine(target, inverse);
      for (let row = 0; row < 3; row++)
        toward[row] = f(
          f(f(inverse[4 + row] * dy) + f(inverse[row] * dx)) + f(inverse[8 + row] * dz),
        );
      normalize(toward);
      if (this.mode === 0) {
        if (!rotationFromZ(toward, turn)) rotateCodes(turn, halfTurn);
        multiplyAffine(scratch, turn, product);
        scratch.set(product);
        multiplyAffine(target, turn, product);
        target.set(product);
      } else {
        const axis = this.mode - 2;
        const angle =
          axis === 0
            ? f(atan2Float32(toward[1], toward[2]) * -ANGLE_CODES_PER_RADIAN)
            : axis === 1
              ? f(atan2Float32(toward[0], toward[2]) * ANGLE_CODES_PER_RADIAN)
              : f(atan2Float32(toward[1], toward[0]) * ANGLE_CODES_PER_RADIAN);
        axisCodes.fill(0);
        axisCodes[axis] = Math.trunc(angle);
        rotateCodes(target, axisCodes);
        rotateCodes(scratch, axisCodes);
      }
      this.offset(target, scratch, eye, px, py, pz);
      return true;
    }
    const position: Vec3 = [eye[0], eye[1], eye[2]];
    const at: Vec3 = [camera.at[0], camera.at[1], camera.at[2]];
    const sourceUp: Vec3 = [camera.up[0], camera.up[1], camera.up[2]];
    const upVector =
      camera.roll === 0
        ? sourceUp
        : upFromDirection(
            position,
            at,
            [f(sourceUp[0] * 0), sourceUp[1], f(sourceUp[2] * 0)],
            camera.roll,
            ENV,
          );
    cameraUp.set(upVector);
    const up = cameraUp;
    toward[0] = f(eye[0] - px);
    toward[1] = f(eye[1] - py);
    toward[2] = f(eye[2] - pz);
    normalize(toward);
    side[0] = f(f(up[1] * toward[2]) - f(up[2] * toward[1]));
    side[1] = f(f(up[2] * toward[0]) - f(up[0] * toward[2]));
    side[2] = f(f(up[0] * toward[1]) - f(up[1] * toward[0]));
    normalize(side);
    for (const m of [target, scratch]) {
      m[0] = side[0];
      m[1] = side[1];
      m[2] = side[2];
      m[4] = up[0];
      m[5] = up[1];
      m[6] = up[2];
      m[8] = toward[0];
      m[9] = toward[1];
      m[10] = toward[2];
      m[12] = px;
      m[13] = py;
      m[14] = pz;
      m[15] = 1;
    }
    this.offset(target, scratch, eye, px, py, pz);
    return true;
  }

  private offset(
    target: Float32Array,
    scratch: Float32Array,
    eye: Float32Array,
    x: number,
    y: number,
    z: number,
  ): void {
    if (Math.abs(this.distance) <= EPSILON) return;
    toward[0] = f(eye[0] - x);
    toward[1] = f(eye[1] - y);
    toward[2] = f(eye[2] - z);
    normalize(toward);
    for (const matrix of [target, scratch]) {
      matrix[12] = f(f(toward[0] * this.distance) + x);
      matrix[13] = f(f(toward[1] * this.distance) + y);
      matrix[14] = f(f(toward[2] * this.distance) + z);
      matrix[15] = 1;
    }
  }
}

export const turnCameraMotion: MotionBehavior = {
  type: 120,
  create: (scene, _node, record) => new TurnCamera(scene, record),
};
