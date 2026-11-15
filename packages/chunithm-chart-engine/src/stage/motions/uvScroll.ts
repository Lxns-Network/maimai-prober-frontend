import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { nthElement, type TextureElement } from "../elements";
import { DEGREES_TO_ANGLE_CODE, sinCosAngleCode } from "../../math/trig";

const f = Math.fround;
const EPSILON = f(0.0000001);
const trig = new Float64Array(2);

/** The node's first three texture components. */
export function textureElements(node: StageNode): (TextureElement | null)[] {
  return [0, 1, 2].map((i) => nthElement<TextureElement>(node, 300, i));
}

/**
 * The per-slot UV offsets (two floats a slot) a model node's texture component holds once a motion
 * has written them, else null while its shapes keep their own material transforms.
 */
export function stageUvOffsets(node: StageNode): Float32Array | null {
  const element = nthElement<TextureElement>(node, 300, 0);
  return element?.slots && element.offsetChanged ? element.slots : null;
}

/** A degree value folded below one turn, as the 16-bit angle code's sine. */
export function sineOfDegrees(degrees: number): number {
  let d = degrees;
  if (d > 360) d = f(d - f(f(Math.trunc(Math.trunc(d) / 360)) * 360));
  sinCosAngleCode(Math.trunc(f(d * DEGREES_TO_ANGLE_CODE)), trig);
  return f(trig[0]);
}

class UvScrollMotion implements MotionInstance {
  readonly behavior = uvScrollMotion;
  readonly data: number;
  readonly elements: (TextureElement | null)[] = [];
  readonly disabled: boolean;
  elapsed = 0;
  countdown = 0;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    this.data = record.data ?? 0;
    if (record.data === null) {
      this.disabled = true;
      return;
    }
    this.elements = textureElements(node);
    this.disabled = this.elements[0] === null;
    if (this.disabled) return;
    this.countdown = g.u32(this.data) === 4 ? -1 : g.f32(this.data + 8);
  }

  private write(u: number, v: number, add: boolean): void {
    const first = this.elements[0]!;
    const channel = this.scene.graph.i32(this.data + 4);
    const apply = (e: TextureElement | null, slot: number) => {
      if (!e) return;
      if (add) e.addOffset(u, v, slot);
      else e.setOffset(u, v, slot);
    };
    if (first.slots) apply(first, channel);
    else if (channel === -1) for (const e of this.elements) apply(e, -1);
    else if (channel < 0) throw new RangeError(`Stage UV scroll: element channel ${channel}`);
    else if (channel < 3) apply(this.elements[channel], -1);
  }

  update(node: StageNode): boolean {
    if (this.disabled) return false;
    const g = this.scene.graph;
    const d = this.data;
    const delta = node.delta;
    const u = g.f32(d + 16);
    const v = g.f32(d + 20);
    switch (g.u32(d)) {
      case 0:
        this.write(u, v, false);
        break;
      case 1: {
        const period = g.f32(d + 8);
        if (!(period > 0)) {
          this.write(f(u * delta), f(v * delta), true);
          break;
        }
        this.countdown = f(this.countdown - delta);
        if (!(this.countdown < 0)) break;
        do {
          const t = Math.min(f(Math.abs(this.countdown)), 1);
          this.write(f(u * t), f(v * t), true);
          if (!(this.countdown <= -1)) break;
          this.countdown = f(f(this.countdown + 1) + g.f32(d + 8));
        } while (this.countdown < 0);
        break;
      }
      case 2: {
        const u1 = g.f32(d + 24);
        const v1 = g.f32(d + 28);
        const halfU = f(f(u1 - u) * 0.5);
        const halfV = f(f(v1 - v) * 0.5);
        const midU = f(f(u + u1) * 0.5);
        const midV = f(f(v + v1) * 0.5);
        const period = g.f32(d + 8);
        const rate = f(Math.abs(period)) > EPSILON ? f(360 / period) : 0;
        const s = sineOfDegrees(f(f(this.elapsed * rate) + g.f32(d + 12)));
        this.write(f(f(halfU * s) + midU), f(f(halfV * s) + midV), false);
        break;
      }
      case 3:
        if (this.countdown < 0) {
          this.write(u, v, true);
          this.countdown = 1;
        }
        break;
      case 4:
        this.write(u, v, true);
        break;
      default:
        break;
    }
    this.elapsed = f(this.elapsed + delta);
    return false;
  }
}

export const uvScrollMotion: MotionBehavior = {
  type: 403,
  create: (scene, node, record) => new UvScrollMotion(scene, node, record),
};
