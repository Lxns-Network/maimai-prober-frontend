import type { StageElementRecord } from "../graph";
import { registerElement, type StageElement } from "../elements";
import type { StageNode } from "../runtime";

const f = Math.fround;
const ANIMATION_ELEMENT = 400;
const UV_ELEMENT = 402;
const FINISHED = 0x10;
const PAUSED = 0x20;

const bits = new DataView(new ArrayBuffer(4));
const floatBits = (value: number) => (bits.setFloat32(0, value, true), bits.getUint32(0, true));

/**
 * An animation playback component: the list of animation resources of its record, which one is
 * selected, and the frame it plays at.
 */
export class AnimationElement implements StageElement {
  /** Resource ordinals of the record's animation list, in list order. */
  readonly ordinals: number[] = [];
  flags = 0;
  /** The selected list index. */
  index = 0;
  /** The list index selected before the last selection, or -1. */
  previous = -1;
  second = -1;
  frame = 0;
  /** A blend into this playback from another is in progress. */
  blending = false;
  blendWeight = 1;
  blendSource = -1;

  constructor(
    readonly type: number,
    readonly record: StageElementRecord,
    node: StageNode,
  ) {
    const g = node.scene.graph;
    const pairs = g.pointer(record.offset + 8);
    const count = g.u32(record.offset + 12);
    for (let i = 0; i < count && pairs !== null; i++) this.ordinals.push(g.u32(pairs + i * 8));
    this.select(0, -1);
  }

  /** How many animations the list holds. */
  get count(): number {
    return this.ordinals.length;
  }

  /** Selects list entry `index` and the second selector, when the list has that entry. */
  select(index: number, second: number): void {
    if (this.count > index >>> 0) {
      this.previous = this.index;
      this.index = index;
    }
    this.second = second;
  }

  words(): [number, number][] {
    return [
      [2, (0xffff0000 | this.flags) >>> 0],
      [6, this.index],
      [9, floatBits(this.frame)],
      [10, this.second >>> 0],
      [11, this.previous >>> 0],
      [12, this.blending ? 1 : 0],
      [13, floatBits(this.blendSource)],
      [14, floatBits(this.blendWeight)],
    ];
  }

  setFrame(frame: number): void {
    this.frame = f(frame);
  }

  finish(): void {
    this.flags |= FINISHED;
  }

  resume(): void {
    this.flags &= ~PAUSED;
  }

  pause(): void {
    this.flags |= PAUSED;
  }
}

registerElement(ANIMATION_ELEMENT, (record, node) => new AnimationElement(400, record, node));
registerElement(UV_ELEMENT, (record, node) => new AnimationElement(402, record, node));
