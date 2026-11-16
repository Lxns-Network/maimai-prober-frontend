import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import {
  multiplyAffine,
  multiplyDiagonalTranslation,
  rotateCodes,
  setIdentity,
} from "../../math/matrix";
import { DEGREES_TO_ANGLE_CODE, sinCosAngleCode } from "../../math/trig";
import { seededValue } from "../random";
import { elementMatrix, nodeClock, nodeSeed } from "./common";
import { stageTransformRequired } from "../runtime";

const f = Math.fround;
const RECORD_BYTES = 116;
const EPSILON = f(0.0000001);

interface RecordState {
  readonly at: number;
  readonly op: number;
  readonly channel: number;
  readonly mode: number;
  readonly source: number;
  readonly clock: number;
  readonly uniform: boolean;
  readonly start: number;
  readonly end: number;
  readonly keep: boolean;
  readonly current: Float32Array;
  readonly base: Float32Array;
  readonly second: Float32Array;
  rate: number;
  phase: number;
}

const trig = new Float64Array(2);
const codes = new Int32Array(3);
const product = new Float32Array(16);
const out = new Float32Array(16);

function randomized(op: number): boolean {
  return op >= 4 && op <= 7;
}

function scalar(
  scene: StageScene,
  record: RecordState,
  minAt: number,
  maxAt: number,
  seed: number,
): number {
  const g = scene.graph;
  const min = g.f32(minAt);
  if (!randomized(record.op)) return min;
  const max = g.f32(maxAt);
  return record.source > 1 ? scene.random.floatRange(min, max) : seededValue(seed, min, max);
}

function vector(
  scene: StageScene,
  record: RecordState,
  minAt: number,
  maxAt: number,
  seed: number,
  first: boolean,
  out: Float32Array,
): void {
  const g = scene.graph;
  if (!randomized(record.op)) {
    for (let i = 0; i < 4; i++) out[i] = g.f32(minAt + i * 4);
    return;
  }
  const offset = first ? 0 : 3;
  if (record.uniform) {
    const v = scalar(scene, record, minAt, maxAt, seed + offset);
    out[0] = out[1] = out[2] = v;
  } else
    for (let i = 0; i < 3; i++)
      out[i] = scalar(scene, record, minAt + i * 4, maxAt + i * 4, seed + offset + i);
  out[3] = 1;
}

function seedOf(node: StageNode, source: number): number {
  return source === 0 ? nodeSeed(node, false) : source === 1 ? nodeSeed(node, true) : 0;
}

function initialize(scene: StageScene, node: StageNode, r: RecordState, seed: number): void {
  const at = r.at;
  vector(scene, r, at + 0x34, at + 0x44, seed, true, r.base);
  if (r.op === 2 || r.op === 6 || r.op === 3 || r.op === 7)
    vector(scene, r, at + 0x54, at + 0x64, seed, false, r.second);
  if (r.op === 3 || r.op === 7) {
    r.rate = f(360 / Math.max(scalar(scene, r, at + 0x24, at + 0x28, seed + 6), EPSILON));
    r.phase = scalar(scene, r, at + 0x2c, at + 0x30, seed + 7);
  }
  void node;
}

function translate(target: Float32Array, v: Float32Array, mode: number, out: Float32Array): void {
  if (mode === 1) {
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    out[15] = 1;
    target[12] = v[0];
    target[13] = v[1];
    target[14] = v[2];
    target[15] = 1;
    return;
  }
  if (mode === 2) {
    const x = f(v[0] + target[12]);
    const y = f(v[1] + target[13]);
    const z = f(v[2] + target[14]);
    out[12] = x;
    out[13] = y;
    out[14] = z;
    out[15] = 1;
    target[12] = x;
    target[13] = y;
    target[14] = z;
    target[15] = 1;
    return;
  }
  if (mode !== 0) throw new RangeError(`Stage matrix: screen translation mode ${mode}`);
  for (let row = 0; row < 3; row++)
    out[12 + row] = f(
      f(f(f(out[4 + row] * v[1]) + f(out[row] * v[0])) + f(out[8 + row] * v[2])) + out[12 + row],
    );
  out[15] = 1;
  multiplyDiagonalTranslation(target, 1, 1, 1, out[12], out[13], out[14]);
}

function rotate(
  target: Float32Array,
  v: Float32Array,
  out: Float32Array,
  accumulate: boolean,
): void {
  for (let i = 0; i < 3; i++) {
    let degrees = f(v[i] % 360);
    v[i] = degrees;
    if (degrees > 360) degrees = f(degrees - f(Math.trunc(Math.trunc(degrees) / 360) * 360));
    codes[i] = Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE));
  }
  rotateCodes(target, codes);
  if (accumulate) rotateCodes(out, codes);
}

function scale(
  target: Float32Array,
  v: Float32Array,
  op: number,
  out: Float32Array,
  accumulate: boolean,
): void {
  const plus = op === 1 || op === 2 || op === 5 || op === 6;
  const x = plus ? f(v[0] + 1) : v[0];
  const y = plus ? f(v[1] + 1) : v[1];
  const z = plus ? f(v[2] + 1) : v[2];
  multiplyDiagonalTranslation(target, x, y, z, 0, 0, 0);
  if (accumulate) multiplyDiagonalTranslation(out, x, y, z, 0, 0, 0);
}

class MatrixMotion implements MotionInstance {
  readonly behavior = matrixMotion;
  elapsed = 0;
  readonly records: RecordState[] = [];
  readonly elementOrdinal: number;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    const data = record.data!;
    this.elementOrdinal = g.u32(data);
    const count = g.u32(data + 4);
    const head = g.target(data + 8);
    for (let i = 0; i < count; i++) {
      const at = head + i * RECORD_BYTES;
      const op = g.u32(at);
      if (op === 100) throw new RangeError("Stage matrix: screen-relative record");
      const r: RecordState = {
        at,
        op,
        channel: g.u32(at + 4),
        mode: g.u32(at + 8),
        source: g.u32(at + 0xc),
        clock: g.u32(at + 0x10),
        uniform: g.u32(at + 0x14) !== 0,
        start: g.f32(at + 0x18),
        end: g.f32(at + 0x1c),
        keep: g.u32(at + 0x20) !== 0,
        current: Float32Array.of(0, 0, 0, 1),
        base: new Float32Array(4),
        second: new Float32Array(4),
        rate: 0,
        phase: 0,
      };
      initialize(scene, node, r, f(0) + seedOf(node, r.source) + i);
      this.records.push(r);
    }
  }

  update(node: StageNode, scratch: Float32Array, accumulate = true): boolean {
    if (!stageTransformRequired(node)) {
      this.elapsed = f(node.delta + this.elapsed);
      return true;
    }
    const scene = this.scene;
    let target: Float32Array | null;
    let produced = false;
    if (this.record.ordinal >= 0) {
      target = elementMatrix(node, 100, this.record.ordinal);
      produced = true;
    } else if (this.elementOrdinal === 0) {
      target = node.world;
      produced = true;
    } else target = elementMatrix(node, 100, this.elementOrdinal);
    if (!target) return produced;
    for (const r of this.records) {
      const ended = r.end >= 0 && this.elapsed > r.end;
      if (!(r.start <= this.elapsed && (!ended || r.keep))) continue;
      if (r.channel >= 100) throw new RangeError(`Stage matrix: element channel ${r.channel}`);
      if (!ended) {
        const seed = r.source === 3 ? seedOf(node, r.source) : 0;
        const c = r.current;
        switch (r.op) {
          case 0:
            c.set(r.base);
            break;
          case 1: {
            const t = f(nodeClock(node, r.clock, this.elapsed) - r.start);
            c[3] = 1;
            c[0] = f(t * r.base[0]);
            c[1] = f(r.base[1] * t);
            c[2] = f(r.base[2] * t);
            break;
          }
          case 2:
          case 6: {
            if (r.op === 6 && r.source === 3) {
              vector(scene, r, r.at + 52, r.at + 68, seed, true, r.base);
              vector(scene, r, r.at + 84, r.at + 100, seed, false, r.second);
            }
            const dt = node.delta;
            const e = this.elapsed;
            const k = f(f(f(f(dt + e) * f(dt + e)) - f(e * e)) * 0.5);
            const x = f(r.second[0] * k);
            const z = f(f(r.base[2] * dt) + f(r.second[2] * k));
            const y = f(f(r.base[1] * dt) + f(r.second[1] * k));
            c[0] = f(f(f(r.base[0] * dt) + x) + c[0]);
            c[1] = f(c[1] + y);
            c[2] = f(c[2] + z);
            break;
          }
          case 3:
          case 7: {
            if (r.op === 7 && r.source === 3) {
              vector(scene, r, r.at + 52, r.at + 68, seed, true, r.base);
              vector(scene, r, r.at + 84, r.at + 100, seed, false, r.second);
              r.rate = f(360 / Math.max(scalar(scene, r, r.at + 36, r.at + 40, seed + 6), EPSILON));
              r.phase = scalar(scene, r, r.at + 44, r.at + 48, seed + 7);
            }
            const t = nodeClock(node, r.clock, this.elapsed);
            const hy = f(f(r.base[1] - r.second[1]) * 0.5);
            const hz = f(f(r.base[2] - r.second[2]) * 0.5);
            const hx = f(f(r.base[0] - r.second[0]) * 0.5);
            const my = f(f(r.second[1] + r.base[1]) * 0.5);
            let degrees = f(f(r.rate * t) + r.phase);
            const mz = f(f(r.second[2] + r.base[2]) * 0.5);
            const mx = f(f(r.base[0] + r.second[0]) * 0.5);
            if (degrees > 360)
              degrees = f(degrees - f(f(Math.trunc(Math.trunc(degrees) / 360)) * 360));
            sinCosAngleCode(Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE)), trig);
            const sine = f(trig[0]);
            c[3] = 1;
            c[0] = f(f(hx * sine) + mx);
            c[1] = f(f(hy * sine) + my);
            c[2] = f(f(hz * sine) + mz);
            break;
          }
          case 4:
            if (r.source === 3) vector(scene, r, r.at + 52, r.at + 68, seed, true, r.base);
            c.set(r.base);
            break;
          case 5: {
            if (r.source === 3) vector(scene, r, r.at + 52, r.at + 68, seed, true, r.base);
            const dt = node.delta;
            r.second[3] = 1;
            r.second[2] = f(r.base[2] * dt);
            r.second[0] = f(r.base[0] * dt);
            r.second[1] = f(r.base[1] * dt);
            c[0] = f(r.second[0] + c[0]);
            c[1] = f(r.second[1] + c[1]);
            c[2] = f(r.second[2] + c[2]);
            break;
          }
          default:
            break;
        }
      }
      if (accumulate || r.channel === 0) setIdentity(out);
      if (r.channel === 0) translate(target, r.current, r.mode, out);
      else if (r.channel === 1) rotate(target, r.current, out, accumulate);
      else if (r.channel === 2) scale(target, r.current, r.op, out, accumulate);
      if (accumulate) {
        multiplyAffine(scratch, out, product);
        scratch.set(product);
      }
    }
    this.elapsed = f(node.delta + this.elapsed);
    return produced;
  }
}

export const matrixMotion: MotionBehavior = {
  type: 100,
  create: (scene, node, record) => new MatrixMotion(scene, node, record),
};
