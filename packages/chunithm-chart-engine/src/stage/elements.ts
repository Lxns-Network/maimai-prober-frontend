import type { StageElementRecord, StageMotionRecord } from "./graph";
import type { StageNode, StageScene } from "./runtime";
import { registerCollisionShape, unregisterCollisionShape } from "./collision";

/** One element of a node: a typed component that motions write and draws read. */
export interface StageElement {
  readonly type: number;
  readonly record: StageElementRecord;
  /** The element's state as word index and value pairs of the executable's element object. */
  words?(): [number, number][];
  /** Releases scene-wide registrations owned by the element. */
  dispose?(): void;
  /** Receives a scalar parameter addressed by the element's ordinal. */
  setParameter?(index: number, value: number): void;
}

/** The material element's six scalar cells, initialized in property order rather than file order. */
export class MaterialElement implements StageElement {
  readonly type = 6003002;
  readonly values = new Float32Array(6);
  readonly data: number | null;

  constructor(
    readonly record: StageElementRecord,
    node: StageNode,
  ) {
    const graph = node.scene.graph;
    this.data = graph.pointer(record.offset + 0x14);
    if (this.data !== null)
      [1, 2, 3, 4, 5, 7].forEach((word, index) => {
        this.values[index] = graph.f32(this.data! + word * 4);
      });
  }

  setParameter(index: number, value: number): void {
    if (index >>> 0 < this.values.length) this.values[index] = value;
  }
}

/** The colour component: set and changed flags, and the packed colour. */
export class ColorElement implements StageElement {
  readonly type = 101;
  set = false;
  changed = false;
  color = 0xffffffff;
  readonly data: number | null;

  constructor(
    readonly record: StageElementRecord,
    node: StageNode,
  ) {
    const graph = node.scene.graph;
    this.data = graph.pointer(record.offset + 0x14);
    if (this.data !== null) {
      const initial = graph.u32(this.data);
      if (initial !== 0xffffffff) {
        this.color = initial;
        this.changed = true;
      }
    }
  }

  words(): [number, number][] {
    return [
      [9, this.set ? 1 : 0],
      [10, this.changed ? 1 : 0],
      [11, this.color],
    ];
  }

  setColor(color: number): void {
    this.set = true;
    if (this.color !== color >>> 0) {
      this.color = color >>> 0;
      this.changed = true;
    }
  }
}

/** The matrix component. */
export class MatrixElement implements StageElement {
  readonly type = 100;
  readonly matrix = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

  constructor(readonly record: StageElementRecord) {}

  words(): [number, number][] {
    return Array.from(new Uint32Array(this.matrix.buffer), (w, i) => [9 + i, w]);
  }
}

/** A model list publishes one selected entry; invalid selections leave the current entry intact. */
export class ModelElement implements StageElement {
  readonly type = 200;
  readonly ordinals: number[] = [];
  index = 0;

  constructor(
    readonly record: StageElementRecord,
    node: StageNode,
  ) {
    const graph = node.scene.graph;
    const pairs = graph.pointer(record.offset + 8);
    const count = graph.u32(record.offset + 12);
    for (let i = 0; i < count && pairs !== null; i++) this.ordinals.push(graph.u32(pairs + i * 8));
  }

  get count(): number {
    return this.ordinals.length;
  }

  select(index: number): void {
    if (this.count > index >>> 0) this.index = index;
  }

  words(): [number, number][] {
    return [[6, this.index]];
  }
}

/** The texture component: selected texture, UV rectangle, pattern code and UV offset. */
export class TextureElement implements StageElement {
  readonly type = 300;
  readonly data: number | null;
  /** The record's texture count. */
  readonly textures: number;
  texture = 0;
  readonly rect = Float32Array.of(0, 0, 1, 1);
  rectChanged = false;
  pattern = -1;
  readonly offset = new Float32Array(2);
  offsetChanged = false;
  /** Per texture slot UV offsets, two floats a slot, when the owning model provides slots. */
  slots: Float32Array | null = null;

  constructor(
    readonly record: StageElementRecord,
    node: StageNode,
  ) {
    const graph = node.scene.graph;
    this.data = graph.pointer(record.offset + 0x14);
    this.textures = graph.u32(record.offset + 12);
  }

  words(): [number, number][] {
    const out: [number, number][] = [
      [1, 0x58455445],
      [2, this.data === null ? 0xffff0002 : 0xffff0004],
      [6, this.texture],
      [15, this.rectChanged ? 1 : 0],
      [16, this.pattern],
      [19, this.offsetChanged ? 1 : 0],
      [22, this.slots ? this.slots.length / 2 : 0],
    ];
    const rect = new Uint32Array(this.rect.buffer);
    for (let i = 0; i < 4; i++) out.push([11 + i, rect[i]]);
    const offset = new Uint32Array(this.offset.buffer);
    out.push([20, offset[0]], [21, offset[1]]);
    if (!this.slots) out.push([23, 0]);
    return out;
  }

  /** How many textures a pattern draws its start from. */
  selectable(node: StageNode): number {
    if (this.data === null) throw new RangeError("Stage texture: an element without parameters");
    return node.scene.graph.u32(this.data + 32) !== 0 ? 1 : this.textures;
  }

  selectTexture(index: number): void {
    if (this.textures >>> 0 > index >>> 0) this.texture = index;
  }

  setOffset(u: number, v: number, slot: number): void {
    this.writeOffset(u, v, slot, false);
  }

  addOffset(u: number, v: number, slot: number): void {
    this.writeOffset(u, v, slot, true);
  }

  private writeOffset(u: number, v: number, slot: number, add: boolean): void {
    const f = Math.fround;
    const slots = this.slots;
    if (!slots) {
      this.offset[0] = add ? f(u + this.offset[0]) : u;
      this.offset[1] = add ? f(v + this.offset[1]) : v;
      this.offsetChanged = true;
      return;
    }
    const count = slots.length / 2;
    if (slot < -1 || slot >= count) throw new RangeError(`Stage texture: offset slot ${slot}`);
    for (let i = slot === -1 ? 0 : slot; i < (slot === -1 ? count : slot + 1); i++) {
      slots[i * 2] = add ? f(slots[i * 2] + u) : u;
      slots[i * 2 + 1] = add ? f(slots[i * 2 + 1] + v) : v;
    }
    this.offsetChanged = true;
  }
}

/** The collision component: shape kind, group, and the shape in node and in world coordinates. */
export class CollisionElement implements StageElement {
  readonly type = 1001;
  readonly kind: number = 0;
  group: number = 0;
  readonly scene: StageScene;
  registered = false;
  hitMask = 0;
  /** Sphere centre/radius or plane point/normal, each stored in native four-float slots. */
  readonly local: Float32Array | null = null;
  readonly world: Float32Array | null = null;

  constructor(
    readonly record: StageElementRecord,
    node: StageNode,
  ) {
    this.scene = node.scene;
    const graph = node.scene.graph;
    const data = graph.pointer(record.offset + 0x14);
    if (data === null) return;
    this.kind = graph.u32(data);
    this.group = graph.u32(data + 32);
    const g = (at: number) => graph.f32(data + at);
    if (this.kind === 3) this.local = Float32Array.of(g(4), g(8), g(12), 0, g(16));
    else if (this.kind === 1)
      this.local = Float32Array.of(g(4), g(8), g(12), 0, g(16), g(20), g(24), 0);
    else throw new RangeError(`Stage collision element: shape kind ${this.kind}`);
    this.world = Float32Array.from(this.local);
    this.registered = true;
    registerCollisionShape(this.scene, this);
  }

  dispose(): void {
    unregisterCollisionShape(this.scene, this);
  }

  words(): [number, number][] {
    return [
      [11, this.kind],
      [13, this.group],
    ];
  }
}

/** A component whose state no ported motion or draw reads yet; it keeps its record only. */
export class RecordElement implements StageElement {
  constructor(
    readonly type: number,
    readonly record: StageElementRecord,
  ) {}
}

export type ElementFactory = (record: StageElementRecord, node: StageNode) => StageElement;

const FACTORIES = new Map<number, ElementFactory>([
  [100, (r) => new MatrixElement(r)],
  [101, (r, n) => new ColorElement(r, n)],
  [200, (r, n) => new ModelElement(r, n)],
  [300, (r, n) => new TextureElement(r, n)],
  [1001, (r, n) => new CollisionElement(r, n)],
  [6003002, (r, n) => new MaterialElement(r, n)],
]);

/** Registers the factory of an element type. */
export function registerElement(type: number, factory: ElementFactory): void {
  FACTORIES.set(type, factory);
}

export function createElements(node: StageNode): StageElement[] {
  if (!node.record) return [];
  return node.record.elements.map(
    (record) =>
      FACTORIES.get(record.type)?.(record, node) ?? new RecordElement(record.type, record),
  );
}

/** The element a motion addresses: its ordinal when that element has the type, else the node's first of the type. */
export function motionElement<T extends StageElement>(
  node: StageNode,
  motion: StageMotionRecord,
  type: number,
): T | null {
  const elements = node.elements;
  const ordinal = motion.ordinal;
  if (ordinal >= 0 && ordinal < elements.length) {
    const element = elements[ordinal];
    if (!element) return null;
    if (element.type === type) return element as T;
  }
  for (const element of elements) if (element && element.type === type) return element as T;
  return null;
}

/** The node's `index`-th element of `type`. */
export function nthElement<T extends StageElement>(
  node: StageNode,
  type: number,
  index: number,
): T | null {
  let seen = 0;
  for (const element of node.elements)
    if (element && element.type === type) {
      if (seen === index) return element as T;
      seen++;
    }
  return null;
}
