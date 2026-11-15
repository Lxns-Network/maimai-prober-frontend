import {
  applyMotions,
  computeWorld,
  stageNodeDrawable,
  type NodeBehavior,
  type StageNode,
} from "../runtime";
import { nthElement, type ColorElement, type TextureElement } from "../elements";

const f = Math.fround;
export const PRIMITIVE_TYPE = 200;
export const FILL_TYPE = 6001020;
const COLOR_ELEMENT = 101;
const TEXTURE_ELEMENT = 300;
const SETTINGS_WORDS = 17;
const IDENTITY = Float32Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

/** The corners (top-left, bottom-left, top-right, bottom-right) each of the six vertices takes. */
const QUAD_ORDER = [0, 1, 2, 2, 1, 3] as const;
/** The corners (top-left, top-right, bottom-left, bottom-right) each of a fill's six vertices takes. */
const FILL_ORDER = [0, 1, 2, 2, 1, 3] as const;
const FILL_UVS = Float32Array.of(0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1);

const bits = new Float32Array(1);
const words = new Uint32Array(bits.buffer);

function floatOf(word: number): number {
  words[0] = word;
  return bits[0];
}

/** The settings block of a 2D primitive: seventeen words, read as signed integers or, where noted, floats. */
export interface StagePrimitiveSettings {
  readonly values: readonly number[];
  /** The rectangle mode. */
  readonly mode: number;
  /** The depth every vertex carries. */
  readonly depth: number;
  /** The initial texture rectangle: left, top, right, bottom. */
  readonly rect: readonly number[];
  readonly anchor: number;
  /** Whether the node's matrix carries the rectangle's corners about its anchor. */
  readonly transform: number;
  readonly textureMode: number;
}

/** What a 2D primitive or full-screen fill draws at the current step. */
export interface StagePrimitive {
  readonly kind: "quad" | "fill";
  /** Why the node never draws, or null. */
  failure: string | null;
  /** Six vertex positions (x, y, z) in 2D pixel units; a fill's are produced by `fillPositions`. */
  readonly positions: Float32Array;
  /** Six texture coordinate pairs. */
  readonly uvs: Float32Array;
  /** The vertex colour dword: the colour element's word with its first and third bytes swapped. */
  colour: number;
  readonly settings: StagePrimitiveSettings | null;
}

interface QuadState extends StagePrimitive {
  readonly corners: Float32Array;
  readonly transformed: Float32Array;
  readonly pivot: Float32Array;
  readonly saved: Float32Array;
}

/** The vertex colour dword of a colour element's packed word. */
export function vertexColour(packed: number): number {
  return ((packed & 0xff00ff00) | ((packed >>> 16) & 0xff) | ((packed & 0xff) << 16)) >>> 0;
}

/** The six vertices of a fill over a render target of `width` by `height` pixels, at depth zero. */
export function fillPositions(width: number, height: number, out = new Float32Array(18)) {
  const w = f(width);
  const h = f(height);
  const corners = [0, 0, w, 0, 0, h, w, h];
  for (let k = 0; k < 6; k++) {
    const c = FILL_ORDER[k];
    out[k * 3] = corners[c * 2];
    out[k * 3 + 1] = corners[c * 2 + 1];
    out[k * 3 + 2] = 0;
  }
  return out;
}

function readSettings(node: StageNode): StagePrimitiveSettings | null {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) return null;
  const values = Array.from({ length: SETTINGS_WORDS }, (_, i) => g.i32(at + i * 4));
  const word = (i: number) => values[i] >>> 0;
  return {
    values,
    mode: values[0],
    depth: floatOf(word(3)),
    rect: [floatOf(word(6)), floatOf(word(7)), floatOf(word(8)), floatOf(word(9))],
    anchor: word(14),
    transform: word(15),
    textureMode: values[16],
  };
}

/**
 * The four corners (x, y each: top-left, bottom-left, top-right, bottom-right) a rectangle mode
 * builds from the settings integers, and the pivot its anchor selects.
 *
 * @throws RangeError for a rectangle mode outside 0 to 3.
 */
export function primitiveGeometry(settings: StagePrimitiveSettings): {
  corners: Float32Array;
  pivot: Float32Array;
} {
  const s = settings.values;
  const corners = new Float32Array(8);
  const pivot = new Float32Array(2);
  const half = (n: number) => Math.trunc(n / 2);
  const add = (a: number, b: number) => (a + b) | 0;
  const sub = (a: number, b: number) => (a - b) | 0;
  const right = add(s[1], s[4]);
  const bottom = add(s[2], s[5]);
  switch (settings.mode) {
    case 0:
      corners.set([s[1], s[2], s[1], bottom, right, s[2], right, bottom]);
      break;
    case 1:
      corners.set([s[1], s[2], s[4], s[5], s[10], s[11], s[12], s[13]]);
      break;
    case 2: {
      const cx = half(right);
      const cy = half(bottom);
      corners.set([
        sub(s[1], cx),
        sub(s[2], cy),
        sub(s[1], cx),
        sub(bottom, cy),
        sub(right, cx),
        sub(s[2], cy),
        sub(right, cx),
        sub(bottom, cy),
      ]);
      break;
    }
    case 3: {
      const cx = half(s[4]);
      const cy = half(s[5]);
      corners.set([
        sub(s[1], cx),
        sub(s[2], cy),
        sub(s[4], cx),
        sub(s[5], cy),
        sub(s[10], cx),
        sub(s[11], cy),
        sub(s[12], cx),
        sub(s[13], cy),
      ]);
      break;
    }
    default:
      throw new RangeError(`rectangle mode ${settings.mode}`);
  }
  const a = settings.anchor;
  if (a & 0x49) pivot[0] = corners[0];
  if (a & 0x92) pivot[0] = f(f(f(corners[4] - corners[0]) * 0.5) + corners[0]);
  if (a & 0x124) pivot[0] = corners[4];
  if (a & 7) pivot[1] = corners[1];
  if (a & 0x38) pivot[1] = f(f(f(corners[7] - corners[1]) * 0.5) + corners[1]);
  if (a & 0x1c0) pivot[1] = corners[7];
  if (settings.mode === 2 || settings.mode === 3) {
    for (let i = 0; i < 4; i++) {
      corners[i * 2] = f(corners[i * 2] - pivot[0]);
      corners[i * 2 + 1] = f(corners[i * 2 + 1] - pivot[1]);
    }
    pivot.fill(0);
  }
  return { corners, pivot };
}

const colourElement = (node: StageNode) => nthElement<ColorElement>(node, COLOR_ELEMENT, 0);
const textureElement = (node: StageNode, index: number) =>
  nthElement<TextureElement>(node, TEXTURE_ELEMENT, index);

function publishUvs(state: StagePrimitive, texture: TextureElement): void {
  const r = texture.rect;
  const corners = [r[0], r[1], r[0], r[3], r[2], r[1], r[2], r[3]];
  for (let k = 0; k < 6; k++) {
    state.uvs[k * 2] = corners[QUAD_ORDER[k] * 2];
    state.uvs[k * 2 + 1] = corners[QUAD_ORDER[k] * 2 + 1];
  }
}

function publishPositions(state: QuadState, tx: number, ty: number): void {
  for (let k = 0; k < 6; k++) {
    const c = QUAD_ORDER[k];
    state.positions[k * 3] = f(state.transformed[c * 2] + tx);
    state.positions[k * 3 + 1] = f(state.transformed[c * 2 + 1] + ty);
    state.positions[k * 3 + 2] = state.settings!.depth;
  }
}

function refuse(node: StageNode, state: { failure: string | null }, reason: string): void {
  state.failure = reason;
  node.scene.missing.add(`node ${PRIMITIVE_TYPE}: ${reason}`);
}

function constructQuad(node: StageNode): void {
  const settings = readSettings(node);
  const texture = textureElement(node, 0);
  const state: QuadState = {
    kind: "quad",
    failure: null,
    positions: new Float32Array(18),
    uvs: new Float32Array(12),
    colour: 0xffffffff,
    settings,
    corners: new Float32Array(8),
    transformed: new Float32Array(8),
    pivot: new Float32Array(2),
    saved: Float32Array.from(IDENTITY),
  };
  node.extension = state;
  if (!settings || !colourElement(node) || !texture) {
    state.failure = "missing settings or element";
    return;
  }
  if (textureElement(node, 1)) return refuse(node, state, "second texture element");
  if (settings.textureMode !== 0)
    return refuse(node, state, `viewport texture mode ${settings.textureMode}`);
  try {
    const geometry = primitiveGeometry(settings);
    state.corners.set(geometry.corners);
    state.pivot.set(geometry.pivot);
  } catch (error) {
    if (error instanceof RangeError) return refuse(node, state, error.message);
    throw error;
  }
  state.transformed.set(state.corners);
  texture.rect.set(settings.rect);
  texture.rectChanged = false;
  state.colour = vertexColour(colourElement(node)!.color);
  publishUvs(state, texture);
  publishPositions(state, 0, 0);
}

function updateQuad(node: StageNode): void {
  const state = node.extension as QuadState;
  if (state.failure) return;
  computeWorld(node);
  applyMotions(node);
  const colour = colourElement(node)!;
  if (colour.changed) {
    state.colour = vertexColour(colour.color);
    colour.changed = false;
  }
  const texture = textureElement(node, 0)!;
  const world = node.world;
  let moved = texture.rectChanged;
  for (let i = 0; i < 16 && !moved; i++) moved = state.saved[i] !== world[i];
  if (moved) {
    if (texture.rectChanged) {
      publishUvs(state, texture);
      texture.rectChanged = false;
    }
    const carried = state.settings!.transform !== 0;
    const m0 = carried ? world[0] : 1;
    const m1 = carried ? world[1] : 0;
    const m4 = carried ? world[4] : 0;
    const m5 = carried ? world[5] : 1;
    for (let i = 0; i < 4; i++) {
      const dx = f(state.corners[i * 2] - state.pivot[0]);
      const dy = f(state.corners[i * 2 + 1] - state.pivot[1]);
      state.transformed[i * 2] = f(f(f(dx * m0) + f(dy * m4)) + state.pivot[0]);
      state.transformed[i * 2 + 1] = f(f(f(dx * m1) + f(dy * m5)) + state.pivot[1]);
    }
    publishPositions(state, world[12], world[13]);
  }
  state.saved.set(world);
}

/** The 2D primitive: a screen-space rectangle placed by a rectangle mode, anchored, and optionally carried by its node's matrix. */
export const primitiveNode: NodeBehavior = {
  type: PRIMITIVE_TYPE,
  construct: constructQuad,
  update: updateQuad,
};

function constructFill(node: StageNode): void {
  const failed = !colourElement(node) || !textureElement(node, 0);
  node.extension = {
    kind: "fill",
    failure: failed ? "missing element" : null,
    positions: new Float32Array(18),
    uvs: Float32Array.from(FILL_UVS),
    colour: 0xffffffff,
    settings: null,
  } satisfies StagePrimitive;
}

function updateFill(node: StageNode): void {
  const state = node.extension as StagePrimitive;
  if (state.failure) return;
  computeWorld(node);
  applyMotions(node);
  const colour = colourElement(node)!;
  if (colour.changed) {
    state.colour = vertexColour(colour.color);
    colour.changed = false;
  }
}

/** The full-screen fill: the whole render target, one colour and the texture's whole rectangle. */
export const fillNode: NodeBehavior = {
  type: FILL_TYPE,
  construct: constructFill,
  update: updateFill,
};

/** The primitive state of a 2D primitive or fill node, when it is one. */
export function stagePrimitive(node: StageNode): StagePrimitive | null {
  const type = node.record?.type;
  return (type === PRIMITIVE_TYPE || type === FILL_TYPE) && node.extension
    ? (node.extension as StagePrimitive)
    : null;
}

/** Whether the node's draw is submitted this step: alive, updated, not hidden, and constructed. */
export function stagePrimitiveLive(node: StageNode): boolean {
  const state = stagePrimitive(node);
  return !!state && !state.failure && stageNodeDrawable(node);
}
