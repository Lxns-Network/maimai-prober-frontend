import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { DEGREES_TO_ANGLE_CODE, sinCosAngleCode } from "../../math/trig";
import { setStageCameraParameter, stageCameraNode } from "../view";
import { ribbon102Node, RIBBON_102_TYPE, setRibbon102Control } from "../nodes/ribbon102";
import { ribbonNode, RIBBON_TYPE, setRibbonControl } from "../nodes/ribbon";
import { nodeClock } from "./common";

const f = Math.fround;
const EPSILON = f(0.0000001);
const KEY_BYTES = 24;
const NULL_NODE = 3;
const CAMERA_NODE = 6000001;
const trig = new Float64Array(2);

function fail(message: string): never {
  throw new RangeError(`Stage send-param: ${message}`);
}

class SendParamMotion implements MotionInstance {
  readonly behavior = sendParamMotion;
  readonly data: number | null;
  readonly disabled: boolean;
  elapsed = 0;
  total = 0;
  current = 0;
  start = 0;
  amplitude = 0;
  rate = 0;
  key = 0;
  previous = 0;
  started = false;
  finished = false;
  holding = false;
  randomValue = 0;
  clockOffset = 0;

  constructor(
    readonly scene: StageScene,
    readonly record: StageMotionRecord,
    node: StageNode,
  ) {
    const g = scene.graph;
    const data = record.data;
    this.data = data;
    let disabled = data === null;
    if (data !== null && g.u32(data + 56) === 2) {
      const span = f(g.f32(data + 60) - g.f32(data + 64));
      disabled = span < 0 || span < EPSILON;
    }
    this.disabled = disabled;
    if (disabled) return;
    const order = g.i32(data! + 48);
    if (order >= 1 && order <= 3) this.key = scene.random.intBelow(g.i32(data! + 16) - 1);
    else if (order !== 0 && order !== -1) fail(`key order ${order}`);
    this.previous = g.i32(data! + 16) - 1;
    this.start = this.keyValue(this.previous);
    this.current = this.keyValue(this.key);
    this.clockOffset = nodeClock(node, g.u32(data!), 0);
  }

  private keyAt(index: number): number {
    const g = this.scene.graph;
    const at = g.target(this.data! + 20) + index * KEY_BYTES;
    const kind = g.u32(at);
    if (kind > 13) fail(`key kind ${kind}`);
    return at;
  }

  private keyValue(index: number): number {
    const g = this.scene.graph;
    const at = this.keyAt(index);
    const first = g.f32(at + 4);
    const kind = g.u32(at);
    if (kind === 0) return first < -100000 ? this.start : first;
    if (kind === 1 || kind === 2) return this.start;
    if (kind === 9) return 0;
    if (kind === 4 || kind === 10 || kind === 11) {
      this.randomValue = this.scene.random.floatRange(g.f32(at + 8), first);
      this.amplitude = 0;
      return 0;
    }
    if (kind !== 3)
      return g.f32(at + 8) < -100000 ? first : this.scene.random.floatRange(g.f32(at + 8), first);
    const middle = f(f(g.f32(at + 8) + first) * 0.5);
    this.rate = 0;
    this.amplitude = f(first - middle);
    const period = g.f32(at + 12);
    if (Math.abs(period) > EPSILON) this.rate = f(65536 / period);
    return middle;
  }

  update(node: StageNode): boolean {
    if (this.disabled || this.finished) return false;
    if (!this.started) {
      const lead = f(this.scene.graph.f32(this.data! + 4) + this.clockOffset);
      while (lead > this.total) {
        this.step(node);
        if (this.finished || this.holding) break;
      }
      this.started = true;
    }
    this.step(node);
    return false;
  }

  private step(node: StageNode): void {
    const g = this.scene.graph;
    const data = this.data!;
    if (this.holding) {
      this.send(node, this.start);
      return;
    }
    const at = this.keyAt(this.key);
    const kind = g.u32(at);
    const duration = g.f32(at + 20);
    const whole = g.u32(data + 52) !== 0;
    let value = this.current;
    const blend = (factor: number) => f(f(f(1 - factor) * this.start) + f(this.current * factor));
    const sine = (degrees: number) => {
      if (degrees > 360) degrees = f(degrees - f(Math.trunc(Math.trunc(degrees) / 360) * 360));
      sinCosAngleCode(Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE)), trig);
      return f(trig[0]);
    };
    switch (kind) {
      case 1:
        this.current = f(g.f32(at + 8) * this.elapsed);
        value = f(this.start + this.current);
        break;
      case 2:
        value = f(f(f(g.f32(at + 4) * 0.5) * f(this.elapsed ** 2)) + this.start);
        this.current = value;
        break;
      case 3: {
        let degrees = g.f32(at + 16);
        if (degrees > 360) degrees = f(degrees - f(Math.trunc(Math.trunc(degrees) / 360) * 360));
        const code =
          g.f32(at + 12) >= EPSILON
            ? Math.trunc(f(this.rate * this.elapsed)) -
              Math.trunc(f(degrees * -DEGREES_TO_ANGLE_CODE))
            : Math.trunc(f(degrees * DEGREES_TO_ANGLE_CODE));
        sinCosAngleCode(code, trig);
        value = f(this.current + f(f(trig[0]) * this.amplitude));
        break;
      }
      case 4:
      case 10:
      case 11: {
        const period = g.f32(at + 12);
        if (period > -1 && this.amplitude >= period) {
          if (kind === 11) {
            this.start = f(this.start + this.current);
            this.current = 0;
          }
          this.randomValue = this.scene.random.floatRange(g.f32(at + 8), g.f32(at + 4));
          this.amplitude = f(this.amplitude - period);
        }
        if (kind === 4) value = this.randomValue;
        this.amplitude = f(this.amplitude + (whole ? 1 : node.delta));
        if (kind === 10) {
          this.current = f(f(node.delta * this.randomValue) + this.current);
          value = f(this.start + this.current);
        } else if (kind === 11) {
          this.current = f(f(this.randomValue * 0.5) * f(this.amplitude ** 2));
          value = f(this.start + this.current);
        }
        break;
      }
      case 5:
      case 6:
      case 7:
      case 8:
      case 12:
      case 13:
        if (duration > 0) {
          let factor = f(this.elapsed / duration);
          if (kind === 6) factor = sine(f(f(this.elapsed * 90) / duration));
          else if (kind === 7) factor = f(sine(f(f(f(this.elapsed * 90) / duration) + 270)) + 1);
          else if (kind !== 5)
            factor = f(factor ** (kind === 12 ? f(1 / g.f32(at + 12)) : g.f32(at + 12)));
          value = factor > 1 ? this.current : blend(factor);
        }
        break;
      case 9:
        value =
          node.count > 1
            ? f(
                f(f(f(g.f32(at + 4) - g.f32(at + 8)) * f(node.ordinal >>> 0)) / f(node.count - 1)) +
                  g.f32(at + 8),
              )
            : f(f(g.f32(at + 8) + g.f32(at + 4)) * 0.5);
        break;
    }
    const clamp = g.u32(data + 56);
    if (clamp === 1) value = Math.min(g.f32(data + 60), Math.max(g.f32(data + 64), value));
    else if (clamp === 2) {
      const high = g.f32(data + 60),
        low = g.f32(data + 64),
        span = f(high - low);
      if (value > high) value = f(f(f(value - high) % span) + low);
      else if (value < low) value = f(high - f(f(Math.abs(f(low + value))) % span));
    }
    this.send(node, value);
    const length = g.f32(data + 8);
    if (length >= 0 && this.total > f(f(f(g.f32(data + 4) + this.clockOffset) + length) - 1)) {
      this.previous = this.key;
      this.start = value;
      if (g.u32(data + 12) === 0) {
        this.finished = true;
        return;
      }
      this.holding = true;
    }
    if (duration > -1 && this.elapsed >= duration) {
      this.previous = this.key;
      this.start = value;
      this.elapsed = f(this.elapsed - duration);
      const order = g.i32(data + 48);
      if (order === 0 || order === 1) this.key++;
      else if (order === 3) this.key = this.scene.random.intBelow(g.i32(data + 16) - 1);
      if (this.key < g.i32(data + 16)) this.current = this.keyValue(this.key);
      else {
        const end = g.u32(data + 44);
        if (end === 1) this.holding = true;
        else if (end === 2) {
          this.key = 0;
          this.current = this.keyValue(0);
          return;
        } else {
          this.finished = true;
          return;
        }
      }
    }
    this.elapsed = f((whole ? 1 : node.delta) + this.elapsed);
    this.total = f((whole ? 1 : node.delta) + this.total);
  }

  private send(node: StageNode, value: number): void {
    const g = this.scene.graph;
    const data = this.data!;
    const receiver = g.u32(data + 24);
    const delivery = g.u32(data + 32);
    if (delivery > 2) fail(`delivery ${delivery}`);
    let tree: StageNode | null = null;
    switch (receiver) {
      case 0:
        tree = node.children[0] ?? null;
        break;
      case 1:
        tree = node.parent?.children[0] ?? null;
        break;
      case 2:
        tree = node;
        while (tree.parent) tree = tree.parent;
        break;
      case 3:
        this.deliver(node, value);
        break;
      case 4:
        if (node.parent) this.deliver(node.parent, value);
        break;
      case 5:
        this.deliver(node, value);
        tree = node.children[0] ?? null;
        break;
      default:
        fail(`receiver ${receiver}`);
    }
    if (tree) {
      const targets: StageNode[] = [];
      const id = g.u32(data + 28);
      const collect = (first: StageNode) => {
        const siblings = first.parent?.children ?? [first];
        for (let i = siblings.indexOf(first); i < siblings.length; i++) {
          const target = siblings[i];
          if (target.flags & 1) continue;
          if (target.record?.id === id) targets.push(target);
          if (target.children[0]) collect(target.children[0]);
        }
      };
      collect(tree);
      for (const target of targets) this.deliver(target, value);
    }
  }

  private deliver(node: StageNode, value: number): void {
    const g = this.scene.graph;
    const data = this.data!;
    const scene = this.scene;
    const delivery = g.u32(data + 32);
    if (delivery === 1) {
      const type = g.u32(data + 36);
      for (const list of [node.before, node.stateMotions, node.after]) {
        const slot = list.find((entry) => entry.record.type === type);
        if (!slot) continue;
        if (!slot.instance) return;
        if (!slot.instance.setParameter) fail(`parameter receiver of motion type ${type}`);
        slot.instance.setParameter(g.u32(data + 40), value);
        return;
      }
      return;
    }
    if (delivery === 2) {
      const ordinal = g.u32(data + 36);
      if (ordinal < node.elements.length) {
        const element = node.elements[ordinal];
        if (element?.setParameter) element.setParameter(g.u32(data + 40), value);
        else if (element) fail(`element parameter receiver of type ${element.type}`);
      }
      return;
    }
    if (
      node.record?.type === RIBBON_TYPE &&
      scene.options.nodes.get(RIBBON_TYPE) === ribbonNode &&
      g.u32(data + 40) === 0
    ) {
      setRibbonControl(node, value);
      return;
    }
    if (
      node.record?.type === RIBBON_102_TYPE &&
      scene.options.nodes.get(RIBBON_102_TYPE) === ribbon102Node &&
      g.u32(data + 40) === 0
    ) {
      setRibbon102Control(node, value);
      return;
    }
    const transform =
      (scene.options.genericNodes && node !== scene.root) || node.record?.type === NULL_NODE;
    const behavior = node.record && scene.options.nodes.get(node.record.type);
    if (!transform && behavior?.setParameter) {
      behavior.setParameter(node, g.u32(data + 40), value);
      return;
    }
    if (
      !transform &&
      node.record?.type === CAMERA_NODE &&
      scene.options.nodes.get(CAMERA_NODE) === stageCameraNode &&
      g.u32(data + 40) < 5
    ) {
      setStageCameraParameter(node, g.u32(data + 40), value);
      return;
    }
    if (!transform) fail(`parameter ${g.u32(data + 40)} of node type ${node.record?.type}`);
    // A transform node holds no parameters, so the value is not kept.
    void value;
  }
}

export const sendParamMotion: MotionBehavior = {
  type: 900,
  create: (scene, node, record) => new SendParamMotion(scene, record, node),
};
