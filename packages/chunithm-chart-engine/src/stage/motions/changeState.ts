import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { checkCommand, COMMAND_BYTES, runCommand } from "./commands";

const f = Math.fround;

class ChangeStateMotion implements MotionInstance {
  readonly behavior = changeStateMotion;
  readonly data: number;
  readonly commands: number;
  readonly count: number;
  elapsed = 0;
  repeats = 0;
  finished = false;

  constructor(
    scene: StageScene,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    if (record.data === null) throw new RangeError("Stage state change: motion without data");
    this.data = record.data;
    const trigger = g.u32(this.data + 4);
    if (trigger !== 0) throw new RangeError(`Stage state change: trigger ${trigger}`);
    this.count = g.i32(this.data + 24);
    this.commands = this.count > 0 ? g.target(this.data + 20) : 0;
    for (let i = 0; i < this.count; i++) checkCommand(g, this.commands + i * COMMAND_BYTES);
  }

  update(node: StageNode): boolean {
    if (this.finished) return false;
    const g = node.scene.graph;
    const duration = g.i32(this.data + 8);
    const fired = duration >= 0 && this.elapsed >= f(duration);
    this.elapsed = f(node.delta + this.elapsed);
    if (!fired) return false;
    for (let i = 0; i < this.count; i++) runCommand(node, this.commands + i * COMMAND_BYTES, -1);
    const limit = g.i32(this.data);
    if (limit > 0 && ++this.repeats >= limit) this.finished = true;
    return false;
  }
}

export const changeStateMotion: MotionBehavior = {
  type: 751,
  create: (scene, _node, record) => new ChangeStateMotion(scene, record),
};
