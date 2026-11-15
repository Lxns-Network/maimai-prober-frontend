import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { motionElement, type CollisionElement } from "../elements";
import {
  cancelCollisionQueries,
  collisionDistance,
  collisionHit,
  collisionPlaneSide,
  enqueueCollisionQuery,
} from "../collision";
import { checkCommand, COMMAND_BYTES, runCommand } from "./commands";

const f = Math.fround;
const PLANE = 1;
const SPHERE = 3;
const PASSIVE = -1;
const DEBUG_SHAPES = 0x80000000;

class CollisionMotion implements MotionInstance {
  readonly behavior = collisionMotion;
  readonly element: CollisionElement | null;
  readonly mode: number;
  readonly action: number;
  readonly commands: number;
  readonly count: number;
  finished = false;
  matched = false;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const element =
      record.data === null ? null : motionElement<CollisionElement>(node, record, 1001);
    this.element = element && (element.kind === 11 || element.local) ? element : null;
    const data = record.data;
    this.mode = data === null ? PASSIVE : scene.graph.i32(data + 8);
    this.action = data === null || this.mode === PASSIVE ? 0 : scene.graph.i32(data + 16);
    this.count = data === null || this.mode === PASSIVE ? 0 : scene.graph.i32(data + 4);
    this.commands = this.count > 0 ? scene.graph.target(data!) : 0;
    if (this.mode !== PASSIVE && (this.mode < 0 || this.mode > 5))
      throw new RangeError(`Stage collision: query mode ${this.mode} against the scene's shapes`);
    if (this.mode !== PASSIVE) {
      if (this.action < 0 || this.action > 2)
        throw new RangeError(`Stage collision: action ${this.action}`);
      for (let i = 0; i < this.count; i++)
        checkCommand(scene.graph, this.commands + i * COMMAND_BYTES);
    }
  }

  update(node: StageNode): boolean {
    const element = this.element;
    if (!element || this.finished) return false;
    if (element.kind !== SPHERE && element.kind !== PLANE)
      throw new RangeError(`Stage collision: shape kind ${element.kind}`);
    const m = node.world;
    const p = element.local!;
    const w = element.world!;
    w[0] = f(f(f(f(m[4] * p[1]) + f(m[0] * p[0])) + f(m[8] * p[2])) + m[12]);
    w[1] = f(f(f(f(m[1] * p[0]) + f(m[5] * p[1])) + f(m[9] * p[2])) + m[13]);
    w[2] = f(f(f(f(m[2] * p[0]) + f(m[6] * p[1])) + f(m[10] * p[2])) + m[14]);
    if (node.record!.flags & DEBUG_SHAPES) throw new RangeError("Stage collision: shape drawing");
    if (this.mode !== PASSIVE) enqueueCollisionQuery(this.scene, this, node);
    return false;
  }

  dispose(): void {
    cancelCollisionQueries(this.scene, this);
  }

  evaluate(node: StageNode): void {
    const data = this.record.data!;
    const mask = this.scene.graph.u32(data + 20);
    let matches: boolean;
    if (this.mode < 2) {
      matches = collisionHit(this.scene, this.element!, mask) === (this.mode === 0);
    } else if (this.mode < 4) {
      const distance = collisionDistance(this.scene, this.element!, mask);
      const threshold = this.scene.graph.f32(data + 12);
      matches = this.mode === 2 ? distance < threshold : distance >= threshold;
    } else {
      const side = collisionPlaneSide(this.scene, this.element!, mask);
      matches = this.mode === 4 ? side >= 0 : side < 0;
    }
    if (!matches) {
      this.matched = false;
      return;
    }
    if (this.action === 0 && this.matched) return;
    if (this.action !== 0) this.finished = true;
    if (this.action === 2) this.element!.dispose();
    for (let i = 0; i < this.count; i++) runCommand(node, this.commands + i * COMMAND_BYTES, -1);
    this.matched = true;
  }
}

export const collisionMotion: MotionBehavior = {
  type: 1000,
  create: (scene, node, record) => new CollisionMotion(scene, node, record),
};
