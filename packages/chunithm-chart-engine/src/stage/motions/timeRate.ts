import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";

const f = Math.fround;

class TimeRateMotion implements MotionInstance {
  readonly behavior = timeRateMotion;
  readonly rate: number;

  constructor(
    scene: StageScene,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    if (record.data === null) throw new RangeError("Stage time rate: motion without data");
    this.rate = g.f32(record.data);
    const repeats = g.i32(record.data + 4);
    if (repeats > 0) throw new RangeError(`Stage time rate: repeat count ${repeats}`);
  }

  update(node: StageNode): boolean {
    node.delta = f(this.rate * node.delta);
    return false;
  }
}

export const timeRateMotion: MotionBehavior = {
  type: 750,
  create: (scene, _node, record) => new TimeRateMotion(scene, record),
};
