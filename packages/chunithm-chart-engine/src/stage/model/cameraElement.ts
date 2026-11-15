import type { StageElementRecord } from "../graph";
import { registerElement, type StageElement } from "../elements";
import type { StageNode } from "../runtime";
import { stageCameraAnimation, type StageCameraAnimation } from "./cameraAnimation";

/** Camera resource selection and playback state. */
export class CameraElement implements StageElement {
  readonly type = 600;
  readonly count: number;
  readonly ordinals: number[];
  index = 0;
  frame = 0;
  flags = 0;

  constructor(
    readonly record: StageElementRecord,
    private readonly node: StageNode,
  ) {
    const g = node.scene.graph;
    this.count = g.u32(record.offset + 12);
    const pairs = this.count ? g.target(record.offset + 8) : 0;
    this.ordinals = Array.from({ length: this.count }, (_, i) => g.u32(pairs + i * 8));
  }

  animation(): StageCameraAnimation | null {
    if (!this.count) return null;
    const ordinal = this.ordinals[this.index];
    const bytes = this.node.scene.options.animation?.(ordinal);
    if (!bytes) throw new RangeError(`Stage camera: missing animation resource ${ordinal}`);
    return stageCameraAnimation(bytes);
  }

  select(index: number): void {
    if (this.count > index >>> 0) this.index = index;
  }

  setFrame(frame: number): void {
    this.frame = Math.fround(frame);
  }

  finish(): void {
    this.flags |= 0x10;
  }

  words(): [number, number][] {
    return [
      [1, 0x4d414345],
      [2, (0xffff0000 | this.flags) >>> 0],
      [6, this.index],
      [9, 0],
      [10, new Uint32Array(Float32Array.of(this.frame).buffer)[0]],
      [11, 0],
    ];
  }
}

registerElement(600, (record, node) => new CameraElement(record, node));
