import type { StageMotionRecord } from "../graph";
import {
  sceneState,
  type MotionBehavior,
  type MotionInstance,
  type StageNode,
  type StageScene,
} from "../runtime";
import { motionElement, type TextureElement } from "../elements";

const f = Math.fround;
const LAST_TEXTURES = "texturePattern.lastTextures";

const lastTextures = (scene: StageScene) =>
  sceneState(scene, LAST_TEXTURES, () => new Map<number, number>());

/** A pattern record's last texture index; a record that leaves it zero takes the first instance's start texture. */
function lastTexture(scene: StageScene, data: number): number {
  return lastTextures(scene).get(data) ?? scene.graph.i32(data + 4);
}

class TexturePatternMotion implements MotionInstance {
  readonly behavior = texturePatternMotion;
  readonly data: number;
  readonly element: TextureElement | null;
  readonly disabled: boolean;
  elapsed = 0;
  stepU = 0;
  stepV = 0;
  rows = 0;
  frame = 0;
  texture = 0;
  group = 0;

  constructor(
    readonly scene: StageScene,
    node: StageNode,
    readonly record: StageMotionRecord,
  ) {
    const g = scene.graph;
    this.data = record.data ?? 0;
    this.element = record.data === null ? null : motionElement<TextureElement>(node, record, 300);
    this.disabled = this.element === null;
    if (this.disabled) return;
    const d = this.data;
    const mode = g.u32(d + 20);
    if (mode !== 0 && mode !== 1) throw new RangeError(`Stage texture pattern: table mode ${mode}`);
    const columns = g.i32(d + 24);
    this.stepU = f(1 / f(columns));
    const rows = g.i32(d + 28);
    this.rows = rows < 1 ? columns : rows;
    this.stepV = rows < 1 ? this.stepU : f(1 / f(rows));
    const random = scene.random;
    this.texture =
      g.u32(d + 8) !== 0 ? random.intBelow(this.element!.selectable(node) - 1) : g.i32(d);
    if (lastTexture(scene, d) === 0) {
      lastTextures(scene).set(d, this.texture);
    }
    const start = g.i32(d + 48);
    if (start >= 0) {
      this.group = g.i32(d + 12);
      this.frame = Math.min(start, g.i32(d + 40));
    } else {
      this.group = random.intRange(g.i32(d + 12), g.i32(d + 16)) | 0;
      this.frame = random.intRange(g.i32(d + 36), g.i32(d + 40)) | 0;
    }
    this.element!.pattern = g.i32(d + 56);
  }

  private advance(): void {
    const g = this.scene.graph;
    const d = this.data;
    const firstTexture = g.i32(d);
    const lastTextureIndex = lastTexture(this.scene, d);
    const firstGroup = g.i32(d + 12);
    const lastGroup = g.i32(d + 16);
    const firstFrame = g.i32(d + 36);
    const lastFrame = g.i32(d + 40);
    const loop = g.u32(d + 52) !== 0;
    const texture = this.texture;
    const group = this.group;
    const frame = this.frame;
    switch (g.u32(d + 44)) {
      case 0:
        this.frame = (frame + 1) | 0;
        if (this.frame <= lastFrame) return;
        this.group = (group + 1) | 0;
        if (this.group <= lastGroup) {
          this.frame = firstFrame;
          return;
        }
        this.texture = (texture + 1) | 0;
        if (this.texture <= lastTextureIndex || loop) {
          if (this.texture > lastTextureIndex) this.texture = firstTexture;
          this.group = firstGroup;
          this.frame = firstFrame;
          return;
        }
        this.texture = lastTextureIndex;
        this.group = lastGroup;
        this.frame = lastFrame;
        return;
      case 1:
        this.frame = (frame - 1) | 0;
        if (this.frame >= firstFrame) return;
        this.group = (group - 1) | 0;
        if (this.group >= firstGroup) {
          this.frame = lastFrame;
          return;
        }
        this.texture = (texture - 1) | 0;
        if (this.texture >= firstTexture || loop) {
          if (this.texture < firstTexture) this.texture = lastTextureIndex;
          this.group = lastGroup;
          this.frame = lastFrame;
          return;
        }
        this.texture = firstTexture;
        this.group = firstGroup;
        this.frame = firstFrame;
        return;
      case 2: {
        const random = this.scene.random;
        this.texture = random.intRange(firstTexture, lastTextureIndex) | 0;
        this.group = random.intRange(firstGroup, lastGroup) | 0;
        this.frame = random.intRange(firstFrame, lastFrame) | 0;
        if (this.texture === texture && this.group === group && this.frame === frame) {
          this.frame = (this.frame + 1) | 0;
          if (this.frame > lastFrame) this.frame = firstFrame;
        }
        return;
      }
      default:
        return;
    }
  }

  update(node: StageNode): boolean {
    if (this.disabled) return false;
    const g = this.scene.graph;
    const d = this.data;
    const element = this.element!;
    const divisor = g.u32(d + 20) === 0 ? g.i32(d + 24) : this.rows;
    if (divisor === 0) throw new RangeError("Stage texture pattern: no columns");
    const major = Math.trunc(this.frame / divisor);
    const minor = this.frame % divisor;
    const [column, row] = g.u32(d + 20) === 0 ? [minor, major] : [major, minor];
    const u = f(f(column) * this.stepU);
    const v = f(f(row) * this.stepV);
    element.rect[0] = u;
    element.rect[1] = v;
    element.rect[2] = f(this.stepU + u);
    element.rect[3] = f(this.stepV + v);
    element.rectChanged = true;
    element.selectTexture(this.texture);
    this.elapsed = f(node.delta + this.elapsed);
    const interval = g.f32(d + 32);
    while (interval >= 0 && this.elapsed >= interval) {
      if (interval === 0) throw new RangeError("Stage texture pattern: zero interval");
      this.advance();
      this.elapsed = f(this.elapsed - interval);
    }
    return false;
  }
}

export const texturePatternMotion: MotionBehavior = {
  type: 401,
  create: (scene, node, record) => new TexturePatternMotion(scene, node, record),
};
