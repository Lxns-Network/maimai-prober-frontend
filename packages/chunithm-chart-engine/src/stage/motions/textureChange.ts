import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { motionElement, type TextureElement } from "../elements";
import { stageModelState } from "../nodes/model";

const f = Math.fround;
const MODEL_NODE = 6001001;
const MIN_RATE = f(0.0001);

class TextureChangeMotion implements MotionInstance {
  readonly behavior = textureChangeMotion;
  readonly element: TextureElement | null;
  readonly disabled: boolean;
  base = 0;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    const d = record.data;
    this.element = d === null ? null : motionElement<TextureElement>(node, record, 300);
    this.disabled = this.element === null;
    if (this.disabled || g.u32(d! + 24) === 0) return;
    let low = g.i32(d! + 16);
    let high = g.i32(d! + 20);
    if (high < 0) high = low;
    else if (high < low) [low, high] = [high, low];
    this.base = scene.random.intRange(low, (high + 1) | 0) | 0;
  }

  update(node: StageNode): boolean {
    if (this.disabled) return false;
    const scene = this.scene;
    const hosted = scene.options.genericNodes && node !== scene.root;
    if (hosted || node.record?.type !== MODEL_NODE) return false;
    const state = stageModelState(node);
    if (!state) return false;
    const g = scene.graph;
    const d = this.record.data!;
    const element = this.element!;
    const start = g.i32(d + 16);
    let low = start;
    let high = g.i32(d + 20);
    if (high >= 0) {
      if (high < low) [low, high] = [high, low];
    } else high = low;
    const rate = g.f32(d + 8);
    const time = f(f(this.base * rate) + (node.controller ? node.controller.stateAge : 0));
    const quotient = f(time / (rate > MIN_RATE ? rate : MIN_RATE));
    const steps =
      Number.isFinite(quotient) && Math.abs(quotient) < 2 ** 31 ? Math.trunc(quotient) : -(2 ** 31);
    const span = high - low;
    let index = low;
    if (g.u32(d + 12) === 0) index += Math.min(span, steps);
    else index += steps % (span + 1);
    if (index < 0 || index >= element.textures) return false;
    const pairs = g.pointer(element.record.offset + 8);
    if (pairs === null) return false;
    const swap = {
      record: this.record.offset,
      name: g.text(g.target(d + 4)),
      ordinal: g.u32(pairs + index * 8),
    };
    const at = state.textureSwaps.findIndex((x) => x.record === swap.record);
    if (at >= 0) state.textureSwaps[at] = swap;
    else state.textureSwaps.push(swap);
    return false;
  }
}

export const textureChangeMotion: MotionBehavior = {
  type: 6002003,
  create: (scene, node, record) => new TextureChangeMotion(scene, node, record),
};
