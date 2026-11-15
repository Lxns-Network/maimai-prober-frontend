import {
  applyMotions,
  computeWorld,
  stageNodeDrawable,
  type NodeBehavior,
  type StageNode,
} from "../runtime";
import {
  nthElement,
  type ColorElement,
  type TextureElement,
  type MaterialElement,
} from "../elements";
import {
  drawSourceFlags,
  elementSampler,
  plainMaterial,
  applySimpleMaterial,
  type SimpleMaterial,
  type TextureBinding,
} from "../../effects/eval/draw";
import type { PrimitiveDrawShape } from "../../effects/instance";
import { sinCosAngleCode } from "../../math/trig";
import { vertexColour } from "./primitive";
import { coordinateCamera } from "../motions/coordinate";

const f = Math.fround;
export const PRIMITIVE_3D_TYPE = 100;
const COLOR_ELEMENT = 101;
const TEXTURE_ELEMENT = 300;
const SETTINGS_WORDS = 13;

/** Applies live material-element cells in element order, after the node's base material setup. */
export function stageSimpleMaterial(
  node: StageNode,
  material: SimpleMaterial,
  layout: number,
  textureCount: number,
): SimpleMaterial {
  for (const element of node.elements) {
    if (element?.type !== 6003002) continue;
    const source = element as MaterialElement;
    if (source.data === null) throw new RangeError("Stage material element without settings");
    material = applySimpleMaterial(
      material,
      Array.from({ length: 12 }, (_, i) => node.scene.graph.u32(source.data! + i * 4)),
      source.values,
      layout,
      textureCount,
    );
  }
  return material;
}
const EPSILON = f(0.0000001);
const VERTICES = 6;
const FLOATS = 6;
const SINGLE_TEXTURE_LAYOUT = 4;

/** The corners of a quad's six vertices: the sign of each half extent, then which texture bound the u and v come from. */
const CORNERS = [
  [-1, 1, 0, 0],
  [-1, -1, 0, 1],
  [1, 1, 1, 0],
  [1, 1, 1, 0],
  [-1, -1, 0, 1],
  [1, -1, 1, 1],
] as const;

/** What a 3D primitive draws at the current step. */
export interface StagePrimitive3d {
  /** Why the node never draws, or null. */
  failure: string | null;
  /** Vertices of x, y, z, colour dword, u, v. */
  vertices: Float32Array;
  words: Uint32Array;
  draw: PrimitiveDrawShape | null;
  /** A draw transform distinct from the node matrix used for sort position. */
  drawWorld?: Float32Array | null;
}

/** The native position/normal/colour/UV buffer and its separate colour holder. */
export interface StageNormalPrimitive extends StagePrimitive3d {
  readonly normalVertices: Float32Array;
  readonly normalWords: Uint32Array;
  holderColour: number;
}

const bits = new Float32Array(1);
const wordsOf = new Uint32Array(bits.buffer);

function floatOf(word: number): number {
  wordsOf[0] = word;
  return bits[0];
}

function refuse(node: StageNode, state: { failure: string | null }, reason: string): void {
  state.failure = reason;
  node.scene.missing.add(`node ${PRIMITIVE_3D_TYPE}: ${reason}`);
}

/** The draw fields of a simple primitive; ribbons can supply their live texture-slot count. */
export function stageSimpleDraw(
  node: StageNode,
  vertexCount: number,
  strip: boolean,
  layout: 4 | 10 = SINGLE_TEXTURE_LAYOUT,
  textureCount?: number,
) {
  const g = node.scene.graph;
  const record = node.record!;
  const flags = drawSourceFlags(
    g.i32(record.offset + 12),
    record.flags,
    record.elements
      .filter((e) => e.type === TEXTURE_ELEMENT)
      .map((e) => {
        const data = g.pointer(e.offset + 0x14);
        return data === null ? null : g.u32(data + 8);
      }),
  );
  const priority = record.priority;
  const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0)!;
  return {
    material: plainMaterial(
      flags,
      priority,
      record.drawCoordinateMode,
      layout,
      textureCount ?? (texture.textures === 0 ? 0 : 1),
    ),
    layout,
    strip,
    vertexCount,
    sortDistanceOffset: -priority | 0,
  } satisfies PrimitiveDrawShape;
}

/** The resource index a binding carries when its texture element lists no textures. */
export const BLANK_TEXTURE = -1;

/** The indexed texture element's selected binding, or null when none can be selected. */
export function stageTextureBinding(node: StageNode, index = 0): TextureBinding | null {
  const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, index);
  if (!texture || texture.data === null) return null;
  const g = node.scene.graph;
  const words = Array.from({ length: 13 }, (_, i) => g.u32(texture.data! + i * 4));
  if (texture.textures === 0)
    return {
      elementOffset: texture.record.offset,
      referenceOrdinal: 0,
      resourceIndex: BLANK_TEXTURE,
      referenceValue: 0,
      parameterWords: words,
      sampler: elementSampler(words),
    };
  const references = g.pointer(texture.record.offset + 8);
  if (references === null || texture.texture >= texture.textures) return null;
  return {
    elementOffset: texture.record.offset,
    referenceOrdinal: texture.texture,
    resourceIndex: g.u32(references + texture.texture * 8),
    referenceValue: g.u32(references + texture.texture * 8 + 4),
    parameterWords: words,
    sampler: elementSampler(words),
  };
}

function construct(node: StageNode): void {
  const g = node.scene.graph;
  const settings = node.record!.settings;
  const colour = nthElement<ColorElement>(node, COLOR_ELEMENT, 0);
  const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0);
  const primitiveCount = settings === null ? 0 : g.u32(settings + 12);
  const vertexCount = primitiveCount * VERTICES;
  const vertices = new Float32Array(vertexCount * FLOATS);
  const state: StagePrimitive3d = {
    failure: null,
    vertices,
    words: new Uint32Array(vertices.buffer),
    draw: null,
  };
  node.extension = state;
  if (settings === null || !colour || !texture) {
    state.failure = "missing settings or element";
    return;
  }
  const s = Array.from({ length: SETTINGS_WORDS }, (_, i) => g.u32(settings + i * 4));
  if (nthElement<TextureElement>(node, TEXTURE_ELEMENT, 1))
    return refuse(node, state, "second texture element");
  if (s[0] > 4) return refuse(node, state, `placement mode ${s[0]}`);
  if (primitiveCount === 0) return refuse(node, state, "0 primitives");
  const width = floatOf(s[4]);
  const widthMinimum = floatOf(s[5]);
  const height = floatOf(s[6]);
  const heightMinimum = floatOf(s[7]);
  const aspect = s[8] !== 0 ? f(height / width) : 1;
  const angleFirst = g.i32(settings + 40);
  const angleLast = g.i32(settings + 36);
  const trig = [0, 1];
  for (let primitive = 0; primitive < primitiveCount; primitive++) {
    const radius = node.scene.random.floatRange(floatOf(s[2]), floatOf(s[1]));
    let centre: number[];
    if (s[0] <= 1) {
      centre = [0, 1, 2].map(() => f(node.scene.random.floatRange(0, 2) - 1));
      const squared = f(
        f(f(centre[0] * centre[0]) + f(centre[1] * centre[1])) + f(centre[2] * centre[2]),
      );
      if (Math.abs(squared) >= EPSILON && Math.abs(f(squared - 1)) >= EPSILON) {
        const inverse = f(1 / f(Math.sqrt(squared)));
        for (let i = 0; i < 3; i++) centre[i] = f(centre[i] * inverse);
      }
      for (let i = 0; i < 3; i++) centre[i] = f(centre[i] * radius);
      if (s[0] === 1) centre[1] = Math.abs(centre[1]);
    } else {
      sinCosAngleCode(node.scene.random.intBelow(65534), trig);
      const sin = f(trig[0] * radius);
      const cos = f(trig[1] * radius);
      centre = s[0] === 2 ? [cos, sin, 0] : s[0] === 3 ? [0, cos, sin] : [sin, 0, cos];
    }
    const halfWidth = f(
      (widthMinimum >= 0 ? node.scene.random.floatRange(widthMinimum, width) : width) * 0.5,
    );
    const halfHeight =
      s[8] !== 0
        ? f(halfWidth * aspect)
        : f(
            (heightMinimum >= 0 ? node.scene.random.floatRange(height, heightMinimum) : height) *
              0.5,
          );
    const angle =
      angleFirst === angleLast
        ? angleFirst
        : angleFirst + node.scene.random.intBelow(Math.abs(angleLast - angleFirst));
    let horizontal = halfWidth;
    let vertical = halfHeight;
    let oppositeHorizontal = halfWidth;
    let oppositeVertical = halfHeight;
    if (angle !== 0) {
      sinCosAngleCode(angle, trig);
      const [sin, cos] = trig;
      horizontal = f(f(cos * halfWidth) + f(sin * halfHeight));
      vertical = f(f(cos * halfHeight) - f(sin * halfWidth));
      oppositeHorizontal = f(f(cos * halfWidth) - f(sin * halfHeight));
      oppositeVertical = f(f(sin * halfWidth) + f(cos * halfHeight));
    }
    const corners =
      angle === 0
        ? CORNERS.map(([x, y]) => [f(x * halfWidth), f(y * halfHeight)])
        : [
            [-horizontal, vertical],
            [-oppositeHorizontal, -oppositeVertical],
            [oppositeHorizontal, oppositeVertical],
            [oppositeHorizontal, oppositeVertical],
            [-oppositeHorizontal, -oppositeVertical],
            [horizontal, -vertical],
          ];
    for (let k = 0; k < VERTICES; k++) {
      const at = (primitive * VERTICES + k) * FLOATS;
      vertices[at] = f(centre[0] + corners[k][0]);
      vertices[at + 1] = f(centre[1] + corners[k][1]);
      vertices[at + 2] = centre[2];
    }
  }
  if (s[12] !== 0 && s[12] !== 1) return refuse(node, state, `layout kind ${s[12]}`);
  if (s[12] === 1) {
    const normalVertices = new Float32Array(vertexCount * 9);
    const normal: StageNormalPrimitive = {
      ...state,
      draw: stageSimpleDraw(node, vertexCount, false, 10),
      normalVertices,
      normalWords: new Uint32Array(normalVertices.buffer),
      holderColour: 0xffffffff,
    };
    node.extension = normal;
    for (let k = 0; k < vertexCount; k++) {
      normalVertices.set(vertices.subarray(k * FLOATS, k * FLOATS + 3), k * 9);
      normalVertices[k * 9 + 5] = 1;
      normal.normalWords[k * 9 + 6] = 0xffffffff;
    }
    publishNormalUvs(normal, [0, 0, 1, 1]);
    node.scene.missing.add(`node ${PRIMITIVE_3D_TYPE}: normal layout light environment`);
    return;
  }
  state.draw = stageSimpleDraw(node, vertexCount, false);
  publishColour(state, colour.color);
  publishUvs(state, texture);
}

function publishNormalUvs(state: StageNormalPrimitive, rect: ArrayLike<number>): void {
  for (let k = 0; k < state.normalVertices.length / 9; k++) {
    state.normalVertices[k * 9 + 7] = rect[CORNERS[k % VERTICES][2] === 0 ? 0 : 2];
    state.normalVertices[k * 9 + 8] = rect[CORNERS[k % VERTICES][3] === 0 ? 1 : 3];
  }
}

function publishColour(state: StagePrimitive3d, colour: number): void {
  const packed = vertexColour(colour);
  for (let k = 0; k < state.vertices.length / FLOATS; k++) state.words[k * FLOATS + 3] = packed;
}

function publishUvs(state: StagePrimitive3d, texture: TextureElement): void {
  const r = texture.rect;
  for (let k = 0; k < state.vertices.length / FLOATS; k++) {
    state.vertices[k * FLOATS + 4] = CORNERS[k % VERTICES][2] === 0 ? r[0] : r[2];
    state.vertices[k * FLOATS + 5] = CORNERS[k % VERTICES][3] === 0 ? r[1] : r[3];
  }
}

function update(node: StageNode): void {
  const state = node.extension as StagePrimitive3d;
  const normal = "normalVertices" in state ? (state as StageNormalPrimitive) : null;
  if (state.failure && !normal) return;
  computeWorld(node);
  applyMotions(node);
  const distance = node.scene.graph.f32(node.record!.settings! + 44);
  if (Math.abs(distance) > EPSILON) {
    const eye = coordinateCamera(node.scene).eye;
    let x = eye[0];
    let y = eye[1];
    let z = eye[2];
    const squared = f(f(f(y * y) + f(x * x)) + f(z * z));
    if (Math.abs(squared) >= EPSILON && Math.abs(f(squared - 1)) >= EPSILON) {
      const inverse = f(1 / f(Math.sqrt(squared)));
      x = f(x * inverse);
      y = f(y * inverse);
      z = f(z * inverse);
    }
    x = f(x * distance);
    y = f(y * distance);
    z = f(z * distance);
    const world = node.world;
    for (let row = 0; row < 3; row++)
      world[12 + row] = f(
        f(f(f(world[4 + row] * y) + f(world[row] * x)) + f(world[8 + row] * z)) + world[12 + row],
      );
    world[15] = 1;
  }
  const colour = nthElement<ColorElement>(node, COLOR_ELEMENT, 0)!;
  if (colour.changed) {
    if (normal) normal.holderColour = vertexColour(colour.color);
    else publishColour(state, colour.color);
    colour.changed = false;
  }
  const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0)!;
  if (texture.rectChanged) {
    if (normal) publishNormalUvs(normal, texture.rect);
    else publishUvs(state, texture);
    texture.rectChanged = false;
  }
}

/** The 3D primitive: a textured quad about a random point of a sphere, placed by the node's matrix. */
export const primitive3dNode: NodeBehavior = {
  type: PRIMITIVE_3D_TYPE,
  construct,
  update,
};

/** The 3D primitive state of a node, when it is one that could be built. */
export function stagePrimitive3d(node: StageNode): StagePrimitive3d | null {
  return node.record?.type === PRIMITIVE_3D_TYPE && node.extension
    ? (node.extension as StagePrimitive3d)
    : null;
}

/** Whether a node's draw is submitted this step: alive, updated, not hidden, and constructed. */
export function stagePrimitive3dLive(node: StageNode): boolean {
  const state = stagePrimitive3d(node);
  return !!state && !state.failure && stageNodeDrawable(node);
}

export const MULTI_PRIMITIVE_TYPE = 204;
const SOLID_NODE_TYPE = 106;
const GEOMETRY_ELEMENT = 102;
const VERTEX_RECORD_BYTES = 24;
const MULTI_SETTINGS_WORDS = 7;

/** What a strip primitive draws: its source vertices and the colours and coordinates it derives from them. */
export interface StageStripPrimitive extends StagePrimitive3d {
  readonly count: number;
  /** Per source vertex: u, v, colour dword. */
  readonly source: Uint32Array;
  readonly sourceUv: Float32Array;
  readonly planar: boolean;
  lastColour: number;
}

function multiplyColours(original: number, colour: number): number {
  let out = 0;
  for (let shift = 0; shift < 32; shift += 8)
    out |= Math.trunc((((original >>> shift) & 255) * ((colour >>> shift) & 255)) / 255) << shift;
  return out >>> 0;
}

function publishStripColour(state: StageStripPrimitive, colour: number): void {
  for (let i = 0; i < state.count; i++) {
    const argb = multiplyColours(state.source[i], colour);
    state.words[i * FLOATS + 3] = vertexColour(argb);
  }
}

function constructStrip(node: StageNode): void {
  const g = node.scene.graph;
  const record = node.record!;
  const settings = record.settings;
  const geometry = record.elements.find((e) => e.type === GEOMETRY_ELEMENT);
  const colour = nthElement<ColorElement>(node, COLOR_ELEMENT, 0);
  const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0);
  const none = {
    failure: null as string | null,
    vertices: new Float32Array(0),
    words: new Uint32Array(0),
    draw: null,
    count: 0,
    source: new Uint32Array(0),
    sourceUv: new Float32Array(0),
    planar: false,
    lastColour: 0,
  };
  node.extension = none;
  const fail = (reason: string) => refuse(node, none, reason);
  const data = geometry ? g.pointer(geometry.offset + 0x14) : null;
  if (settings === null || !geometry || data === null || !colour || !texture)
    return void (none.failure = "missing settings or element");
  const s = Array.from({ length: MULTI_SETTINGS_WORDS }, (_, i) => g.u32(settings + i * 4));
  if (s[0] !== 0) return fail(`strip mode ${s[0]}`);
  if (s[1] !== 0) return fail("strip vertex count override");
  if (nthElement<TextureElement>(node, TEXTURE_ELEMENT, 1)) return fail("second texture element");
  const count = g.u32(data);
  const head = g.pointer(data + 4);
  if (count < 3 || head === null) return fail(`strip of ${count} vertices`);
  const vertices = new Float32Array(count * FLOATS);
  const source = new Uint32Array(count);
  const sourceUv = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const at = head + i * VERTEX_RECORD_BYTES;
    sourceUv[i * 2] = g.f32(at);
    sourceUv[i * 2 + 1] = g.f32(at + 4);
    source[i] = g.u32(at + 8);
    vertices[i * FLOATS] = g.f32(at + 12);
    vertices[i * FLOATS + 1] = g.f32(at + 16);
    vertices[i * FLOATS + 2] = g.f32(at + 20);
  }
  const state: StageStripPrimitive = {
    failure: null,
    vertices,
    words: new Uint32Array(vertices.buffer),
    draw: stageSimpleDraw(node, count, true),
    count,
    source,
    sourceUv,
    planar: s[2] !== 0,
    lastColour: 0,
  };
  node.extension = state;
  if (state.planar) {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < count; i++) {
      const x = vertices[i * FLOATS];
      const y = vertices[i * FLOATS + 1];
      bounds[0] = Math.min(bounds[0], x);
      bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x);
      bounds[3] = Math.max(bounds[3], y);
    }
    const spanX = Math.abs(f(bounds[2] - bounds[0]));
    const spanY = Math.abs(f(bounds[3] - bounds[1]));
    const u0 = floatOf(s[3]);
    const v0 = floatOf(s[4]);
    const u1 = floatOf(s[5]);
    const v1 = floatOf(s[6]);
    for (let i = 0; i < count; i++) {
      vertices[i * FLOATS + 4] = f(
        f(f(f(vertices[i * FLOATS] - bounds[0]) / spanX) * f(u1 - u0)) + u0,
      );
      vertices[i * FLOATS + 5] = f(
        f(f(1 - f(f(vertices[i * FLOATS + 1] - bounds[1]) / spanY)) * f(v1 - v0)) + v0,
      );
    }
  } else {
    for (let i = 0; i < count; i++) {
      vertices[i * FLOATS + 4] = sourceUv[i * 2];
      vertices[i * FLOATS + 5] = sourceUv[i * 2 + 1];
    }
  }
  for (let i = 0; i < count; i++) state.words[i * FLOATS + 3] = vertexColour(source[i]);
}

function updateStrip(node: StageNode): void {
  const state = node.extension as StageStripPrimitive;
  if (state.failure) return;
  computeWorld(node);
  applyMotions(node);
  const colour = nthElement<ColorElement>(node, COLOR_ELEMENT, 0)!;
  const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0)!;
  if (!state.planar)
    for (let i = 0; i < state.count; i++) {
      state.vertices[i * FLOATS + 4] = f(state.sourceUv[i * 2] + texture.rect[0]);
      state.vertices[i * FLOATS + 5] = f(state.sourceUv[i * 2 + 1] + texture.rect[1]);
    }
  if (state.lastColour !== colour.color) {
    publishStripColour(state, colour.color);
    state.lastColour = colour.color;
  }
}

/** The strip primitive: a triangle strip of authored vertices, coloured by its node and placed by its matrix. */
export const multiPrimitiveNode: NodeBehavior = {
  type: MULTI_PRIMITIVE_TYPE,
  construct: constructStrip,
  update: updateStrip,
};

/** The strip or quad state of a node of either 3D primitive class, when it could be built. */
export function stageSolid(node: StageNode): StagePrimitive3d | null {
  const type = node.record?.type;
  return (type === PRIMITIVE_3D_TYPE ||
    type === SOLID_NODE_TYPE ||
    type === MULTI_PRIMITIVE_TYPE) &&
    node.extension
    ? (node.extension as StagePrimitive3d)
    : null;
}

/** Whether a node of either class draws this step: alive, updated, not hidden, and constructed. */
export function stageSolidLive(node: StageNode): boolean {
  const state = stageSolid(node);
  return !!state && !state.failure && stageNodeDrawable(node);
}
