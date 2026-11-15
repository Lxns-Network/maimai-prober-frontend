import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { motionElement, nthElement, type ColorElement } from "../elements";
import { DEGREES_TO_ANGLE_CODE, sinCosAngleCode } from "../../math/trig";
import { SEEDED_TABLE } from "../random";
import { nodeClock, nodeSeed, findNodeById } from "./common";

const f = Math.fround;
const EPSILON = f(0.0000001);
const RULE_BYTES = 40;
const trig = new Float64Array(2);

function sine(code: number): number {
  sinCosAngleCode(code, trig);
  return f(trig[0]);
}

function channel(color: number, shift: number): number {
  return (color >>> shift) & 255;
}

/** A channel drawn from `low` toward `high` by the permutation entry at `seed`. */
function seededChannel(seed: number, low: number, high: number): number {
  if (low === high) return low;
  return (low + (SEEDED_TABLE[seed & 0xff] % (high - low + 1))) & 255;
}

/** Combines two packed colours by a blend code. */
export function combineColors(a: number, b: number, op: number): number {
  const ch = (shift: number, value: number) => (value & 255) << shift;
  switch (op) {
    case 0:
      return b >>> 0;
    case 1:
    case 2: {
      let out = 0;
      for (const shift of [0, 8, 16, 24]) {
        const x = channel(a, shift);
        const y = channel(b, shift);
        out |= ch(shift, op === 1 ? Math.min(x + y, 255) : Math.max(x - y, 0));
      }
      return out >>> 0;
    }
    case 3: {
      let out = 0;
      for (const shift of [0, 8, 16, 24])
        out |= ch(shift, (channel(a, shift) + channel(b, shift)) >>> 1);
      return out >>> 0;
    }
    case 4: {
      let out = 0;
      for (const shift of [0, 8, 16, 24])
        out |= ch(shift, Math.trunc((channel(a, shift) * channel(b, shift)) / 255));
      return out >>> 0;
    }
    case 5:
      return a >>> 0;
    case 6:
      return ((a & 0xffffff) | (b & 0xff000000)) >>> 0;
    case 7:
      return ((b & 0xffffff) | (a & 0xff000000)) >>> 0;
    default:
      return 0xffffffff;
  }
}

/** Per-channel float blend from `a` to `b` by `t`. */
export function lerpColors(a: number, b: number, t: number): number {
  if (a >>> 0 === b >>> 0) return b >>> 0;
  let out = 0;
  for (const shift of [16, 8, 0, 24]) {
    const value = f(f(f(1 - t) * channel(a, shift)) + f(channel(b, shift) * t));
    out |= (Math.trunc(value) & 255) << shift;
  }
  return out >>> 0;
}

class MaterialMotion implements MotionInstance {
  readonly behavior = materialMotion;
  readonly data: number;
  readonly element: ColorElement | null;
  parent: ColorElement | null = null;
  elapsed = 0;
  duration = 0;
  phase = 0;
  period = 0;
  index = 0;
  previousIndex = -1;
  cached = 0xffffffff;
  previous = 0xffffffff;
  finished = false;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    this.element = motionElement<ColorElement>(node, record, 101);
    this.data = record.data ?? 0;
    if (!this.element || !record.data) return;
    const rules = this.rules;
    const first = g.u32(rules + 12);
    if (!(first === 0 || first === 5 || first === 6)) this.cached = this.ruleColor(node, 0, 0);
    this.previous =
      g.f32(rules + 32) >= EPSILON
        ? this.ruleColor(node, this.count - 1, 1)
        : this.ruleColor(node, 0, 1);
    this.retime();
    this.resolveParent(node);
    let lead = g.f32(this.data + 4);
    const selector = g.u32(this.data);
    if (selector !== 0) lead = f(nodeClock(node, selector, 0) + lead);
    if (lead > this.elapsed)
      do {
        const color = this.ruleColor(node, this.index, 0);
        this.elapsed = f(this.elapsed + node.delta);
        const duration = this.duration;
        if (this.elapsed > duration) {
          this.elapsed = node.delta;
          this.previous = color;
          this.previousIndex = this.index++;
          lead = f(lead - duration);
          if (this.index >= this.count) {
            if (g.u32(this.data + 24) !== 0) {
              this.index = 0;
              this.elapsed = 0;
            } else {
              this.finished = true;
              this.index = this.count - 1;
            }
          }
          this.retime();
        }
      } while (lead > this.elapsed);
  }

  get rules(): number {
    return this.scene.graph.target(this.data + 16);
  }

  get count(): number {
    return this.scene.graph.u32(this.data + 12);
  }

  private rule(index: number): number {
    return this.rules + index * RULE_BYTES;
  }

  private retime(): void {
    const g = this.scene.graph;
    const at = this.rule(this.index);
    const periodLow = g.f32(at + 20);
    this.period =
      periodLow <= -1 ? g.f32(at + 16) : this.scene.random.floatRange(periodLow, g.f32(at + 16));
    const durationLow = g.f32(at + 36);
    this.duration =
      durationLow <= -1
        ? g.f32(at + 32)
        : this.scene.random.floatRange(durationLow, g.f32(at + 32));
  }

  private resolveParent(node: StageNode): void {
    const g = this.scene.graph;
    if (g.u32(this.data + 28) === 0) return;
    const id = g.i32(this.data + 32);
    const target = id < 0 ? node.parent : findNodeById(this.scene, id);
    if (target) this.parent = nthElement<ColorElement>(target, 101, 0);
  }

  ruleColor(node: StageNode, index: number, salt: number): number {
    const g = this.scene.graph;
    const at = this.rule(index);
    const a = g.u32(at);
    const b = g.u32(at + 4);
    switch (g.u32(at + 12)) {
      case 0:
        this.cached = a;
        return a;
      case 1:
      case 2: {
        if (this.previousIndex === this.index) return this.cached;
        const seed = (salt + nodeSeed(node, g.u32(at + 12) === 2)) & 0xff;
        this.cached =
          (seededChannel(seed + 2, channel(b, 0), channel(a, 0)) |
            (seededChannel(seed + 1, channel(b, 8), channel(a, 8)) << 8) |
            (seededChannel(seed, channel(b, 16), channel(a, 16)) << 16) |
            (seededChannel(seed + 3, channel(b, 24), channel(a, 24)) << 24)) >>>
          0;
        this.previousIndex = this.index;
        return this.cached;
      }
      case 3:
        if (this.previousIndex === this.index) return this.cached;
        return this.drawColor(a, b);
      case 4:
        if (this.period <= this.phase) {
          this.phase = 0;
          return this.drawColor(a, b);
        }
        this.phase = f(node.delta + this.phase);
        return this.cached;
      case 5: {
        let code = 0;
        if (Math.abs(this.period) > EPSILON) {
          let degrees = f(f(this.phase / this.period) * 360);
          if (degrees > 360)
            degrees = f(degrees - f(f(Math.trunc(Math.trunc(degrees) / 360)) * 360));
          code = Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE));
        }
        const s = sine(code);
        let out = 0;
        for (const shift of [8, 16, 24, 0]) {
          const first = channel(b, shift);
          const last = channel(a, shift);
          const value = f(f(f(f(last - first) * 0.5) * s) + f(f(first + last) * 0.5));
          out |= (Math.trunc(value) & 255) << shift;
        }
        this.cached = out >>> 0;
        this.phase = f(node.delta + this.phase);
        if (Math.abs(this.period) > EPSILON) this.phase = f(this.phase % this.period);
        return this.cached;
      }
      case 6:
        return this.element!.color;
      default:
        return 0xffffffff;
    }
  }

  private drawColor(a: number, b: number): number {
    const random = this.scene.random;
    const range = (shift: number) => {
      const x = channel(b, shift);
      const y = channel(a, shift);
      return x >= y ? [y, x] : [x, y];
    };
    const [rl, rh] = range(16);
    const [gl, gh] = range(8);
    const [bl, bh] = range(0);
    const [al, ah] = range(24);
    const r = random.intRange(rl, rh);
    const g = random.intRange(gl, gh);
    const bb = random.intRange(bl, bh);
    const alpha = random.intRange(al, ah);
    this.cached = ((bb & 255) | ((g & 255) << 8) | ((r & 255) << 16) | ((alpha & 255) << 24)) >>> 0;
    this.previousIndex = this.index;
    return this.cached;
  }

  private ease(at: number, previous: number, next: number): number {
    const g = this.scene.graph;
    const kind = g.u32(at + 24);
    if (kind === 0 || kind > 6) return previous;
    if (g.f32(at + 32) <= EPSILON) return next;
    let t: number;
    if (kind === 1) t = f(this.elapsed / this.duration);
    else if (kind === 2 || kind === 3) {
      let degrees = f(f(this.elapsed / this.duration) * 90);
      if (kind === 3) degrees = f(degrees + 270);
      if (degrees > 360) degrees = f(degrees - f(f(Math.trunc(Math.trunc(degrees) / 360)) * 360));
      t = sine(Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE)));
      if (kind === 3) t = f(t + 1);
    } else {
      const exponent = kind === 5 ? f(1 / g.f32(at + 28)) : g.f32(at + 28);
      t = f(Math.pow(f(this.elapsed / this.duration), exponent));
    }
    return lerpColors(previous, next, Math.min(t, 1));
  }

  private timed(node: StageNode): number {
    const g = this.scene.graph;
    if (this.finished) {
      if (g.u32(this.rule(this.index) + 12) === 4) return this.ruleColor(node, this.index, 0);
      return this.previous;
    }
    const target = this.ruleColor(node, this.index, 0);
    const color = this.ease(this.rule(this.index), this.previous, target);
    const selector = g.u32(this.data);
    const clock = selector >= 1 && selector <= 3 ? nodeClock(node, selector, 0) : 0;
    const limit = g.f32(this.data + 8);
    if (limit < 0 || f(f(g.f32(this.data + 4) + clock) + this.elapsed) <= limit)
      this.elapsed = f(node.delta + this.elapsed);
    if (this.elapsed > this.duration) {
      if (limit >= 0) throw new RangeError("Stage material: a time-limited colour track");
      this.elapsed = node.delta;
      this.previousIndex = this.index;
      this.previous = target;
      this.index++;
      if (this.index >= this.count) {
        if (g.u32(this.data + 24) !== 0) {
          this.index = 0;
          this.elapsed = 0;
          this.retime();
          return color;
        }
        this.finished = true;
        this.index = this.count - 1;
      }
      this.retime();
    }
    return color;
  }

  update(node: StageNode): boolean {
    const element = this.element;
    if (!element || !this.record.data) return false;
    const g = this.scene.graph;
    const index = this.index;
    const current = element.color;
    let color: number;
    if (this.count === 1) {
      color = this.ruleColor(node, 0, 0);
      this.previousIndex = this.index;
    } else color = this.timed(node);
    let blended = combineColors(current, color, g.u32(this.rule(index) + 8));
    this.resolveParent(node);
    if (this.parent) blended = combineColors(this.parent.color, blended, g.u32(this.data + 36));
    const mask = g.u32(this.data + 40);
    let out = current;
    if ((mask & 0xf) === 0xf) out = blended;
    else {
      if (mask & 1) out = ((blended & 0xff0000) | (out & 0xff00ffff)) >>> 0;
      if (mask & 2) out = ((blended & 0xff00) | (out & 0xffff00ff)) >>> 0;
      if (mask & 4) out = ((blended & 0xff) | (out & 0xffffff00)) >>> 0;
      if (mask & 8) out = ((blended & 0xff000000) | (out & 0xffffff)) >>> 0;
    }
    const output = g.u32(this.data + 20);
    if (output === 0) {
      element.setColor(out);
      node.translucent = out >>> 24 !== 0xff;
    } else if (output === 10) {
      element.setColor(out);
      this.scene.globalColor = out;
    }
    return false;
  }
}

export const materialMotion: MotionBehavior = {
  type: 300,
  create: (scene, node, record) => new MaterialMotion(scene, node, record),
};
