import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { motionElement, type ColorElement } from "../elements";
import { combineColors, lerpColors } from "./material";

const f = Math.fround;
const EPSILON = f(0.0000001);
const KEY_BYTES = 8;
const WORLD_Z = 4;

/** The colour a table of colour and position keys gives at `value`, blending between neighbours. */
function keyedColor(scene: StageScene, data: number, value: number): number {
  const g = scene.graph;
  const count = g.i32(data);
  const keys = g.target(data + 4);
  const color = (i: number) => g.u32(keys + i * KEY_BYTES);
  const at = (i: number) => g.f32(keys + i * KEY_BYTES + 4);
  if (at(0) >= value) return color(0);
  if (value >= at(count - 1)) return color(count - 1);
  for (let i = 1; i < count; i++) {
    if (!(at(i) > value)) continue;
    if (EPSILON > Math.abs(f(at(i) - at(i - 1)))) return color(i - 1);
    return lerpColors(color(i - 1), color(i), f(f(value - at(i - 1)) / f(at(i) - at(i - 1))));
  }
  return 0xffffffff;
}

class MaterialInterlockedMotion implements MotionInstance {
  readonly behavior = materialInterlockedMotion;
  readonly element: ColorElement | null;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    this.element = motionElement<ColorElement>(node, record, 101);
  }

  update(node: StageNode): boolean {
    const element = this.element;
    const data = this.record.data;
    if (!element || data === null) return false;
    const g = this.scene.graph;
    const source = g.u32(data + 8);
    if (source !== WORLD_Z) throw new RangeError(`Stage interlocked material: source ${source}`);
    const keyed = keyedColor(this.scene, data, node.world[14]);
    const color = combineColors(element.color, keyed, g.u32(data + 12));
    element.setColor(color);
    node.translucent = color >>> 24 !== 0xff;
    return false;
  }
}

export const materialInterlockedMotion: MotionBehavior = {
  type: 302,
  create: (scene, node, record) => new MaterialInterlockedMotion(scene, node, record),
};
