import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import type { TextureElement } from "../elements";
import { sineOfDegrees, textureElements } from "./uvScroll";

const f = Math.fround;
const EPSILON = f(0.0000001);

class UvSetMotion implements MotionInstance {
  readonly behavior = uvSetMotion;
  readonly data: number;
  readonly elements: (TextureElement | null)[];
  readonly disabled: boolean;
  readonly values = new Float32Array(4);
  readonly half = new Float32Array(2);
  readonly mid = new Float32Array(2);
  rate = 0;
  clock = 0;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    this.elements = textureElements(node);
    this.data = record.data ?? 0;
    this.disabled = this.elements[0] === null || record.data === null;
    if (this.disabled) return;
    const d = this.data;
    if (g.u32(d + 4) === 2) {
      this.half[0] = f(f(g.f32(d + 16) - g.f32(d + 8)) * 0.5);
      this.half[1] = f(f(g.f32(d + 20) - g.f32(d + 12)) * 0.5);
      this.mid[0] = f(f(g.f32(d + 16) + g.f32(d + 8)) * 0.5);
      this.mid[1] = f(f(g.f32(d + 20) + g.f32(d + 12)) * 0.5);
      const period = g.f32(d + 24);
      if (period > EPSILON) this.rate = f(360 / period);
      this.values.set([0, 0, 1, 1]);
    } else for (let i = 0; i < 4; i++) this.values[i] = g.f32(d + 8 + i * 4);
    if (g.u32(d + 4) === 1) this.clock = g.f32(d + 32);
  }

  private apply(node: StageNode, element: TextureElement): void {
    const g = this.scene.graph;
    const d = this.data;
    const op = g.u32(d + 4);
    const flags = g.u32(d + 36);
    const h = this.values;
    const out = new Float32Array(4);
    if (op === 0) {
      out[0] = h[0];
      out[1] = h[1];
      out[2] = flags & 1 ? f(h[2] + h[0]) : h[2];
      out[3] = flags & 2 ? f(h[3] + h[1]) : h[3];
      element.rect.set(out);
      element.rectChanged = true;
      return;
    }
    const delta = node.delta;
    if (op === 1) {
      const du = g.f32(d + 24);
      const dv = g.f32(d + 28);
      const period = g.f32(d + 32);
      if (!(period > EPSILON)) {
        h[0] = f(h[0] + f(du * delta));
        h[1] = f(h[1] + f(dv * delta));
        h[2] = f(h[2] + f(du * delta));
        h[3] = f(h[3] + f(dv * delta));
      } else {
        this.clock = f(this.clock - delta);
        if (this.clock <= 0) {
          h[0] = f(h[0] + du);
          h[1] = f(h[1] + dv);
          h[2] = f(h[2] + du);
          h[3] = f(h[3] + dv);
          this.clock = f(period + this.clock);
        }
      }
      out.set(h);
    } else if (op === 2) {
      const s = sineOfDegrees(f(f(this.rate * this.clock) + g.f32(d + 32)));
      const a = f(f(this.half[0] * s) + this.mid[0]);
      const b = f(f(this.half[1] * s) + this.mid[1]);
      this.clock = f(this.clock + delta);
      out[0] = f(h[0] + a);
      out[1] = f(h[1] + b);
      out[2] = f(h[2] + a);
      out[3] = f(h[3] + b);
    } else return;
    if (flags & 4) for (let i = 0; i < 4; i++) out[i] = f(element.rect[i] + out[i]);
    element.rect.set(out);
    element.rectChanged = true;
  }

  update(node: StageNode): boolean {
    if (this.disabled) return false;
    const selector = this.scene.graph.i32(this.data);
    if (selector === -1) {
      for (const element of this.elements) if (element) this.apply(node, element);
      return false;
    }
    if (selector < 0 || selector > 2) throw new RangeError(`Stage UV set: element ${selector}`);
    const element = this.elements[selector];
    if (element) this.apply(node, element);
    return false;
  }
}

export const uvSetMotion: MotionBehavior = {
  type: 402,
  create: (scene, node, record) => new UvSetMotion(scene, node, record),
};
