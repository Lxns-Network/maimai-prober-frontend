import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { multiplyAffine, rotateCodes, setIdentity } from "../../math/matrix";
import { angleCode, sine, translateLocal } from "./affine";

const f = Math.fround;
const EPSILON = f(0.0000001);
const ENTRY_BYTES = 48;

const product = new Float32Array(16);
const codes = new Int32Array(3);

function fail(message: string): never {
  throw new RangeError(`Stage placement: ${message}`);
}

class LinearPlacement implements MotionInstance {
  readonly behavior = linearPlacementMotion;
  readonly data: number;
  readonly position = Float32Array.of(0, 0, 0, 1);
  placed = false;

  constructor(
    readonly scene: StageScene,
    readonly record: StageMotionRecord,
  ) {
    this.data = record.data ?? fail("motion without data");
  }

  update(node: StageNode, scratch: Float32Array): boolean {
    const g = this.scene.graph;
    const p = this.position;
    if (!this.placed) {
      const count = node.count >>> 0;
      if (count > 1) {
        const t = f(f(node.ordinal >>> 0) / f(count - 1));
        for (let k = 0; k < 3; k++)
          p[k] = f(f(g.f32(this.data + k * 4) * f(1 - t)) + f(g.f32(this.data + 16 + k * 4) * t));
      } else {
        p[3] = 1;
        for (let k = 0; k < 3; k++)
          p[k] = f(f(g.f32(this.data + 16 + k * 4) + g.f32(this.data + k * 4)) * 0.5);
      }
      this.placed = true;
    }
    translateLocal(node.world, p[0], p[1], p[2]);
    translateLocal(scratch, p[0], p[1], p[2]);
    return true;
  }
}

export const linearPlacementMotion: MotionBehavior = {
  type: 200,
  create: (scene, _node, record) => new LinearPlacement(scene, record),
};

class FanPlacement implements MotionInstance {
  readonly behavior = fanPlacementMotion;
  readonly axis: number;
  readonly first: number;
  readonly last: number;
  readonly radius: number;
  readonly turning: boolean;
  readonly position = Float32Array.of(0, 0, 0, 1);
  code = 0;
  placed = false;

  constructor(
    scene: StageScene,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    const data = record.data ?? fail("motion without data");
    this.axis = g.u32(data);
    this.first = g.f32(data + 4);
    this.last = g.f32(data + 8);
    this.radius = g.f32(data + 12);
    this.turning = g.u32(data + 16) !== 0;
    if (this.axis > 2) fail(`axis ${this.axis}`);
  }

  private place(node: StageNode): void {
    let count = node.count >>> 0;
    if (count > 1) {
      const span = f(this.last - this.first);
      let degrees = 360;
      if (!(EPSILON > Math.abs(span))) {
        count -= 1;
        degrees = span;
      }
      const step = f(f(node.ordinal >>> 0) * degrees);
      this.code = angleCode(f(f(f(1 / f(count)) * step) + this.first));
    } else this.code = 0;
    if (!this.turning) {
      const s = f(sine(this.code) * this.radius);
      const c = f(sine((this.code + 0x4000) & 0xffff) * this.radius);
      const p = this.position;
      if (this.axis === 0) {
        p[0] = 0;
        p[1] = s;
        p[2] = c;
      } else if (this.axis === 1) {
        p[0] = s;
        p[1] = 0;
        p[2] = c;
      } else {
        p[0] = c;
        p[1] = s;
        p[2] = 0;
      }
    }
    this.placed = true;
  }

  update(node: StageNode, scratch: Float32Array): boolean {
    if (!this.placed) this.place(node);
    const target = node.world;
    if (!this.turning) {
      const p = this.position;
      translateLocal(target, p[0], p[1], p[2]);
      translateLocal(scratch, p[0], p[1], p[2]);
      return true;
    }
    if (this.code !== 0) {
      codes.fill(0);
      codes[this.axis] = this.code;
      rotateCodes(scratch, codes);
    }
    const column = this.axis === 2 ? 0 : 8;
    const r = this.radius;
    scratch[12] = f(f(scratch[column] * r) + scratch[12]);
    scratch[13] = f(f(scratch[column + 1] * r) + scratch[13]);
    scratch[15] = 1;
    scratch[14] = f(f(scratch[column + 2] * r) + scratch[14]);
    multiplyAffine(target, scratch, product);
    target.set(product);
    return true;
  }
}

export const fanPlacementMotion: MotionBehavior = {
  type: 201,
  create: (scene, _node, record) => new FanPlacement(scene, record),
};

class TablePlacement implements MotionInstance {
  readonly behavior = tablePlacementMotion;
  readonly data: number;
  readonly matrix = new Float32Array(16);
  built = false;

  constructor(
    readonly scene: StageScene,
    readonly record: StageMotionRecord,
  ) {
    this.data = record.data ?? fail("motion without data");
    const mode = scene.graph.u32(this.data);
    if (mode !== 0) fail(`selection mode ${mode}`);
    setIdentity(this.matrix);
  }

  private build(node: StageNode): void {
    const g = this.scene.graph;
    const m = this.matrix;
    setIdentity(m);
    const count = g.i32(this.data + 4);
    let index = node.spawnIndex | 0;
    while (index >= count && count > 0) index -= count;
    const at = g.target(this.data + 8) + index * ENTRY_BYTES;
    translateLocal(m, g.f32(at), g.f32(at + 4), g.f32(at + 8));
    codes[2] = angleCode(g.f32(at + 24));
    codes[1] = angleCode(g.f32(at + 20));
    codes[0] = angleCode(g.f32(at + 16));
    rotateCodes(m, codes);
    const scale = new Float32Array(16);
    setIdentity(scale);
    scale[0] = g.f32(at + 32);
    scale[5] = g.f32(at + 36);
    scale[10] = g.f32(at + 40);
    multiplyAffine(m, scale, product);
    m.set(product);
    this.built = true;
  }

  update(node: StageNode, scratch: Float32Array): boolean {
    if (!this.built) this.build(node);
    multiplyAffine(node.world, this.matrix, product);
    node.world.set(product);
    multiplyAffine(scratch, this.matrix, product);
    scratch.set(product);
    return true;
  }
}

export const tablePlacementMotion: MotionBehavior = {
  type: 202,
  create: (scene, _node, record) => new TablePlacement(scene, record),
};
