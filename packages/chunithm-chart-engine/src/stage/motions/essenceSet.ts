import type { StageMotionRecord } from "../graph";
import type { MotionBehavior, MotionInstance, StageNode, StageScene } from "../runtime";
import { motionElement, ModelElement, TextureElement } from "../elements";
import { AnimationElement } from "../model/animationElement";
import { coordinateCamera } from "./coordinate";

const ANY = 0xffffffff;
const f = Math.fround;

class EssenceSetMotion implements MotionInstance {
  readonly behavior = essenceSetMotion;
  readonly element: TextureElement | AnimationElement | ModelElement | null = null;
  readonly mode: number = 0;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    const data = record.data;
    if (data === null) return;
    const element = motionElement(node, record, g.u32(data));
    if (!element) return;
    if (
      !(element instanceof TextureElement) &&
      !(element instanceof AnimationElement) &&
      !(element instanceof ModelElement)
    )
      throw new RangeError(`Stage essence set: element type ${element.type}`);
    this.element = element;
    this.mode = g.u32(data + 8);
    const index = g.u32(data + 4);
    const count = element instanceof TextureElement ? element.textures : element.count;
    switch (this.mode) {
      case 0:
        if (index !== ANY) this.select(index);
        else if (count !== 0) this.select(scene.random.intBelow(count - 1));
        break;
      case 1: {
        let selected = node.spawnIndex;
        if (selected !== 0 && index !== 0 && count !== 0) {
          selected = Math.floor(selected / index);
          if (count < selected) {
            const period = Math.imul(index, count) >>> 0;
            selected = Math.floor((node.spawnIndex % period) / index);
          }
        }
        this.select(selected);
        break;
      }
      case 2:
        this.select(0);
        this.update(node);
        break;
      default:
        throw new RangeError(`Stage essence set: mode ${this.mode}`);
    }
  }

  private select(index: number): void {
    const element = this.element;
    if (element instanceof TextureElement) element.selectTexture(index);
    else if (element instanceof ModelElement) element.select(index);
    else if (element) element.select(index, -1);
  }

  update(node: StageNode): boolean {
    if (this.mode !== 2 || !this.element) return false;
    const g = this.scene.graph;
    const data = this.record.data!;
    const eye = coordinateCamera(this.scene).eye;
    const dx = f(node.world[12] - eye[0]);
    const dy = f(node.world[13] - eye[1]);
    const dz = f(node.world[14] - eye[2]);
    const distance = f(Math.sqrt(f(f(f(dy * dy) + f(dx * dx)) + f(dz * dz))));
    const count = g.i32(data + 12);
    const entries = count > 0 ? g.target(data + 16) : 0;
    for (let i = 0; i < count; i++) {
      const at = entries + i * 12;
      const start = g.f32(at + 4);
      const end = g.f32(at + 8);
      if (distance >= start && (end === -1 || distance < end)) {
        this.select(g.u32(at));
        break;
      }
    }
    return false;
  }
}

export const essenceSetMotion: MotionBehavior = {
  type: 700,
  create: (scene, node, record) => new EssenceSetMotion(scene, node, record),
};
