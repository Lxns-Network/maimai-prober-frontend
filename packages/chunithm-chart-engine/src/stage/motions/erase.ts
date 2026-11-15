import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { inverseAffine, multiplyAffine, setIdentity } from "../../math/matrix";

const f = Math.fround;
const EPSILON = f(1.1920929e-7);

function fail(message: string): never {
  throw new RangeError(`Stage erase: ${message}`);
}

const product = new Float32Array(16);

class EraseMotion implements MotionInstance {
  readonly behavior = eraseMotion;
  readonly rotation: boolean;
  readonly axes: readonly boolean[];

  constructor(
    scene: StageScene,
    readonly record: StageMotionRecord,
  ) {
    const data = record.data ?? fail("motion without data");
    const g = scene.graph;
    this.rotation = g.u32(data) !== 0;
    this.axes = [1, 2, 3].map((k) => g.u32(data + k * 4) !== 0);
  }

  update(node: StageNode, scratch: Float32Array): boolean {
    const target = node.world;
    let produced = false;
    if (this.rotation) {
      for (let i = 0; i < 12; i++) scratch[i] = target[i];
      produced = true;
      const x = target[12];
      const y = target[13];
      const z = target[14];
      setIdentity(target);
      target[12] = x;
      target[13] = y;
      target[14] = z;
    }
    if (this.axes.some(Boolean)) {
      for (let k = 0; k < 3; k++) {
        const old = target[12 + k];
        const value = this.axes[k] ? 0 : old;
        target[12 + k] = value;
        scratch[12 + k] = f(value - old);
      }
      target[15] = 1;
      scratch[15] = 1;
      produced = true;
    }
    return produced;
  }
}

export const eraseMotion: MotionBehavior = {
  type: 105,
  create: (scene, _node, record) => new EraseMotion(scene, record),
};

const transposed = new Float32Array(16);
const original = new Float32Array(16);
const quaternion = new Float32Array(4);

function nearZero(value: number): boolean {
  return Math.abs(f(value - 0)) <= EPSILON;
}

/** The unit quaternion of the rotation held in a transposed matrix. */
function toQuaternion(t: Float32Array, q: Float32Array): void {
  const trace = f(f(t[0] + t[5]) + t[10]);
  if (trace >= 0) {
    const s = f(Math.sqrt(f(trace + 1)));
    const k = f(-0.5 / s);
    q[3] = f(s * 0.5);
    q[0] = f(f(t[6] - t[9]) * k);
    q[1] = f(f(t[8] - t[2]) * k);
    q[2] = f(f(t[1] - t[4]) * k);
    return;
  }
  let axis = 0;
  let largest = t[0];
  if (t[5] > largest) {
    axis = 1;
    largest = t[5];
  }
  if (t[10] > largest) axis = 2;
  if (axis === 0) {
    const s = f(Math.sqrt(f(f(f(t[0] - t[5]) - t[10]) + 1)));
    const k = f(0.5 / s);
    q[0] = f(s * 0.5);
    q[1] = f(f(t[4] + t[1]) * k);
    q[2] = f(f(t[8] + t[2]) * k);
    q[3] = -f(f(t[6] - t[9]) * k);
  } else if (axis === 1) {
    const s = f(Math.sqrt(f(f(f(t[5] - t[0]) - t[10]) + 1)));
    const k = f(0.5 / s);
    q[1] = f(s * 0.5);
    q[2] = f(f(t[9] + t[6]) * k);
    q[0] = f(f(t[4] + t[1]) * k);
    q[3] = -f(f(t[8] - t[2]) * k);
  } else {
    const s = f(Math.sqrt(f(f(t[10] - f(t[0] + t[5])) + 1)));
    const k = f(0.5 / s);
    q[2] = f(s * 0.5);
    q[0] = f(f(t[8] + t[2]) * k);
    q[1] = f(f(t[9] + t[6]) * k);
    q[3] = -f(f(t[1] - t[4]) * k);
  }
}

/** Writes the rotation of a quaternion into a transposed matrix with no translation. */
function fromQuaternion(q: Float32Array, t: Float32Array): void {
  const [x, y, z, w] = q;
  const xy = f(y * x);
  const yz = f(z * y);
  const zx = f(x * z);
  const wx = f(w * x);
  const wy = f(w * y);
  const wz = f(w * z);
  const xx = f(x * x);
  const yy = f(y * y);
  const zz = f(z * z);
  t[0] = f(1 - f(f(zz + yy) * 2));
  t[1] = f(f(xy - wz) * 2);
  t[2] = f(f(zx + wy) * 2);
  t[3] = 0;
  t[4] = f(f(xy + wz) * 2);
  t[5] = f(1 - f(f(xx + zz) * 2));
  t[6] = f(f(yz - wx) * 2);
  t[7] = 0;
  t[8] = f(f(zx - wy) * 2);
  t[9] = f(f(yz + wx) * 2);
  t[10] = f(1 - f(f(yy + xx) * 2));
  t[11] = 0;
  t[12] = 0;
  t[13] = 0;
  t[14] = 0;
  t[15] = 1;
}

class SeparateEraseMotion implements MotionInstance {
  readonly behavior = separateEraseMotion;
  readonly flags: readonly boolean[];

  constructor(
    scene: StageScene,
    readonly record: StageMotionRecord,
  ) {
    const data = record.data ?? fail("motion without data");
    this.flags = Array.from({ length: 7 }, (_, k) => scene.graph.u32(data + k * 4) !== 0);
  }

  update(node: StageNode, scratch: Float32Array): boolean {
    const flags = this.flags;
    if (!flags.some(Boolean)) return false;
    const target = node.world;
    const t = transposed;
    original.set(target);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) t[i * 4 + j] = target[j * 4 + i];
    const tx = t[3];
    const ty = t[7];
    const tz = t[11];
    t[3] = 0;
    t[7] = 0;
    t[11] = 0;
    const lengths = [0, 1, 2].map((c) => {
      const sum = [0, 1, 2].reduce((acc, r, n) => {
        const a = t[r * 4];
        const b = t[r * 4 + 1];
        const d = t[r * 4 + 2];
        const v =
          c === 0
            ? f(f(a + f(b * 0)) + f(d * 0))
            : c === 1
              ? f(f(b + f(a * 0)) + f(d * 0))
              : f(f(f(a * 0) + f(b * 0)) + d);
        const square = f(v * v);
        return n === 0 ? square : f(acc + square);
      }, 0);
      return f(Math.sqrt(sum));
    });
    if (!lengths.some(nearZero)) {
      const inverse = lengths.map((l) => f(1 / l));
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 3; c++) t[r * 4 + c] = f(t[r * 4 + c] * inverse[c]);
    }
    const q = quaternion;
    toQuaternion(t, q);
    const norm = f(
      Math.sqrt(f(f(f(f(q[0] * q[0]) + f(q[1] * q[1])) + f(q[2] * q[2])) + f(q[3] * q[3]))),
    );
    if (!nearZero(norm)) {
      const k = f(1 / norm);
      for (let i = 0; i < 4; i++) q[i] = f(k * q[i]);
    }
    if (flags[0]) setIdentity(t);
    else fromQuaternion(q, t);
    t[3] = flags[1] ? 0 : tx;
    t[7] = flags[2] ? 0 : ty;
    t[11] = flags[3] ? 0 : tz;
    const scale = lengths.map((l, c) => (flags[4 + c] ? 1 : l));
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 3; c++) t[r * 4 + c] = f(t[r * 4 + c] * scale[c]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) target[j * 4 + i] = t[i * 4 + j];
    scratch.set(original);
    inverseAffine(scratch, product);
    scratch.set(product);
    multiplyAffine(scratch, target, product);
    scratch.set(product);
    return true;
  }
}

export const separateEraseMotion: MotionBehavior = {
  type: 6002001,
  create: (scene, _node, record) => new SeparateEraseMotion(scene, record),
};
