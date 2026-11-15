import { nthElement, type ColorElement, type TextureElement } from "../elements";
import { sceneCamera } from "../motions/turnCamera";
import {
  applyMotions,
  computeWorld,
  stageNodeDrawable,
  type NodeBehavior,
  type StageNode,
} from "../runtime";
import { vertexColour } from "./primitive";
import { stageSimpleDraw, type StagePrimitive3d } from "./primitive3d";
import { setIdentity } from "../../math/matrix";

const f = Math.fround;
const EPSILON = f(0.0000001);
const PAIR_WORDS = 10;
export const RIBBON_TYPE = 103;

/** State of the history-based ribbon geometry produced by Stage node 103. */
export interface RibbonState {
  readonly capacity: number;
  readonly segments: number;
  readonly interpolation: number;
  readonly halfWidth: number;
  readonly halfWidthEnd: number;
  widthStep: number;
  readonly alphaStart: number;
  readonly alphaEnd: number;
  alphaStep: number;
  readonly uvLength: number;
  readonly cameraBias: number;
  readonly followCurve: boolean;
  readonly distanceUv: boolean;
  readonly history: Float32Array;
  readonly centers: Float32Array;
  readonly pairs: Float32Array;
  readonly words: Uint32Array;
  readonly direction: Float32Array;
  readonly firstDirection: Float32Array;
  active: number;
  vertices: number;
  control: number;
  time: number;
  phase: number;
  readonly v: Float32Array;
}

/** Creates a ribbon from the 12 words in its scene record. */
export function createRibbon(settings: ArrayLike<number>, color: number): RibbonState {
  const values = new Float32Array(Uint32Array.from(settings).buffer);
  const capacity = settings[2];
  const interpolation = settings[1];
  if (
    settings[0] > 1 ||
    (interpolation !== 0 && interpolation !== 1) ||
    capacity < 2 ||
    settings[3] < 1 ||
    !(values[8] >= EPSILON) ||
    settings[10] > 1 ||
    settings[11] > 1
  )
    throw new RangeError("Stage ribbon: unsupported settings");
  const segments = interpolation === 0 ? Math.min(settings[3], capacity - 1) : settings[3];
  const pairs = new Float32Array((segments + 1) * PAIR_WORDS);
  const state: RibbonState = {
    capacity,
    segments,
    interpolation,
    halfWidth: Math.max(f(values[4] * 0.5), EPSILON),
    halfWidthEnd: f(values[5] * 0.5),
    widthStep: f(f(f(values[5] - values[4]) * 0.5) / segments),
    alphaStart: settings[6],
    alphaEnd: settings[7],
    alphaStep: f(f(settings[7] - settings[6]) * f(1 / segments)),
    uvLength: values[8],
    cameraBias: values[9],
    followCurve: settings[10] !== 0,
    distanceUv: settings[11] !== 0,
    history: new Float32Array(capacity * 3),
    centers: new Float32Array((segments + 1) * 3),
    pairs,
    words: new Uint32Array(pairs.buffer),
    direction: new Float32Array(3),
    firstDirection: new Float32Array(3),
    active: 0,
    vertices: (segments + 1) * 2,
    control: 0,
    time: 0,
    phase: 0,
    v: Float32Array.of(0, 1),
  };
  updateColor(state, color, false);
  updateUv(state, [0, 0, 1, 1]);
  return state;
}

function updateColor(state: RibbonState, color: number, finalAlpha = true): void {
  let alpha = state.alphaStart;
  for (let i = 0; i <= state.segments; i++) {
    const component = finalAlpha && i === state.segments ? state.alphaEnd : Math.trunc(alpha);
    state.words[i * PAIR_WORDS + 9] =
      ((color & 0xffffff) | (Math.trunc((component * (color >>> 24)) / 255) << 24)) >>> 0;
    alpha = f(alpha + state.alphaStep);
  }
}

function updateUv(state: RibbonState, rect: ArrayLike<number>): void {
  let u = rect[0];
  const increment = f(f(f(rect[2] - u) / (state.vertices / 2 - 1)) * state.uvLength);
  for (let i = 0; i <= state.segments; i++) {
    state.pairs[i * PAIR_WORDS + 8] = u;
    u = f(u + increment);
  }
}

function normalise(v: Float32Array): void {
  const square = f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2]));
  if (Math.abs(square) < EPSILON || Math.abs(f(square - 1)) < EPSILON) return;
  const inverse = f(1 / f(Math.sqrt(square)));
  for (let c = 0; c < 3; c++) v[c] = f(v[c] * inverse);
}

function splineTangent(history: Float32Array, count: number, index: number, component: number) {
  const p = (i: number) => history[i * 3 + component];
  if (count === 2) return f(p(1) - p(0));
  if (index === 0) {
    const full = f(p(2) - p(0));
    const half = f(full * 0.5);
    return f(f(f(f(f(p(1) - p(0)) - half) * 1.5) + f(0 * full)) + half);
  }
  if (index === count - 1) {
    const full = f(p(index) - p(index - 2));
    const half = f(full * 0.5);
    return f(f(f(f(f(p(index) - p(index - 1)) - half) * 1.5) + f(0 * full)) + half);
  }
  return f(f(p(index + 1) - p(index - 1)) * 0.5);
}

/** Samples either the linear or native cubic interpolation of a history of 3D points. */
export function sampleRibbonHistory(
  history: Float32Array,
  centers: Float32Array,
  segments: number,
  active: number,
  interpolation: number,
): void {
  const step = f(f(active - 1) / segments);
  let curveTime = step;
  for (let i = 0; i <= segments; i++) {
    if (i === 0 || i === segments) {
      const source = i === 0 ? 0 : (active - 1) * 3;
      centers.set(history.subarray(source, source + 3), i * 3);
      continue;
    }
    const time = interpolation === 1 ? curveTime : f(f(i / segments) * f(active - 1));
    const index = Math.floor(time);
    const t = f(time - index);
    for (let c = 0; c < 3; c++) {
      const a = history[index * 3 + c];
      const b = history[(index + 1) * 3 + c];
      if (interpolation === 0) centers[i * 3 + c] = f(f(b * t) + f(a * f(1 - t)));
      else {
        const t2 = f(t * t);
        const t3 = f(t2 * t);
        const twice = f(t3 + t3);
        const three = f(t2 * 3);
        const h0 = f(f(twice - three) + 1);
        const h1 = f(three - twice);
        const h2 = f(f(t3 - f(t2 + t2)) + t);
        const h3 = f(t3 - t2);
        const m0 = splineTangent(history, active, index, c);
        const m1 = splineTangent(history, active, index + 1, c);
        centers[i * 3 + c] = f(f(f(f(b * h1) + f(a * h0)) + f(m0 * h2)) + f(m1 * h3));
      }
    }
    curveTime = f(curveTime + step);
  }
}

/** Advances one native update tick, independent of controller delta, and rebuilds the visible strip. */
export function advanceRibbon(
  state: RibbonState,
  position: ArrayLike<number>,
  camera: ArrayLike<number>,
  color: number,
  rect: ArrayLike<number>,
  colorChanged = true,
  rectChanged = false,
  cameraDirection?: ArrayLike<number>,
): void {
  const { history, centers, pairs, direction, segments } = state;
  state.time = f(state.time + 1);
  if (state.control === 0) {
    state.active = 0;
    for (let i = 0; i < state.capacity; i++)
      for (let c = 0; c < 3; c++) history[i * 3 + c] = position[c];
    state.control = 1;
  }
  if (state.control !== 3) {
    history.copyWithin(3, 0, history.length - 3);
    state.active = Math.min(state.active + 1, state.capacity);
    if (state.control === 1) for (let c = 0; c < 3; c++) history[c] = position[c];
    if (state.active >= 2) {
      const x = f(history[3] - history[0]);
      const y = f(history[4] - history[1]);
      const z = f(history[5] - history[2]);
      const length = f(Math.sqrt(f(f(f(y * y) + f(x * x)) + f(z * z))));
      const phase = f(state.phase + f(length * f(1 / state.uvLength)));
      state.phase = f(phase - Math.floor(phase));
    }
  }
  if (state.active < 2) return;
  const direct = state.interpolation === 0 && state.capacity === segments + 1;
  if (direct) {
    centers.set(history);
    state.vertices = state.active * 2;
    const inverse = f(1 / (state.active - 1));
    state.widthStep = f(f(state.halfWidthEnd - state.halfWidth) * inverse);
    state.alphaStep = f(f(state.alphaEnd - state.alphaStart) * inverse);
  } else sampleRibbonHistory(history, centers, segments, state.active, state.interpolation);
  if (Math.abs(state.cameraBias) > EPSILON) {
    direction.set(
      cameraDirection ?? [
        f(camera[0] - centers[0]),
        f(camera[1] - centers[1]),
        f(camera[2] - centers[2]),
      ],
    );
    normalise(direction);
    for (let c = 0; c < 3; c++) direction[c] = f(direction[c] * state.cameraBias);
    for (let i = 0; i < centers.length; i++) centers[i] = f(centers[i] + direction[i % 3]);
  }
  let width = state.halfWidth;
  for (let i = 0; i < state.vertices / 2; i++) {
    const a = i === 0 ? 0 : (i - 1) * 3;
    const b = i === 0 ? 3 : i * 3;
    const at = i * 3;
    const x = f(centers[a] - centers[b]);
    const y = f(centers[a + 1] - centers[b + 1]);
    const z = f(centers[a + 2] - centers[b + 2]);
    const length = f(Math.sqrt(f(f(f(x * x) + f(y * y)) + f(z * z))));
    if ((i === 0 || state.followCurve) && length > EPSILON) {
      const cx = cameraDirection ? cameraDirection[0] : f(camera[0] - centers[at]);
      const cy = cameraDirection ? cameraDirection[1] : f(camera[1] - centers[at + 1]);
      const cz = cameraDirection ? cameraDirection[2] : f(camera[2] - centers[at + 2]);
      direction[0] = f(f(y * cz) - f(z * cy));
      direction[1] = f(f(z * cx) - f(x * cz));
      direction[2] = f(f(x * cy) - f(y * cx));
      normalise(direction);
      for (let c = 0; c < 3; c++) direction[c] = f(direction[c] * width);
      if (i === 0) state.firstDirection.set(direction);
    } else if (i !== 0) {
      normalise(direction);
      for (let c = 0; c < 3; c++) direction[c] = f(direction[c] * width);
    }
    if (i === 0 && length <= EPSILON) direction.set(state.firstDirection);
    const pair = i * PAIR_WORDS;
    for (let c = 0; c < 3; c++) {
      pairs[pair + c] = f(centers[at + c] + direction[c]);
      pairs[pair + 4 + c] = f(centers[at + c] - direction[c]);
    }
    width = f(width + state.widthStep);
  }
  if (colorChanged || (direct && state.vertices !== (segments + 1) * 2)) updateColor(state, color);
  if (state.distanceUv) {
    let u = state.phase;
    let step = 0;
    for (let i = 0; i <= segments; i++) {
      pairs[i * PAIR_WORDS + 8] = u;
      if (i === segments) {
        pairs[i * PAIR_WORDS + 8] = f(u + step);
        continue;
      }
      const difference = (c: number) => {
        const at = i * PAIR_WORDS + c;
        return f(
          f(f(pairs[at] + pairs[at + 4]) - f(pairs[at + PAIR_WORDS] + pairs[at + PAIR_WORDS + 4])) *
            0.5,
        );
      };
      const x = difference(0),
        y = difference(1),
        z = difference(2);
      const length = f(Math.sqrt(f(f(f(y * y) + f(x * x)) + f(z * z))));
      step = f(length * f(-1 / state.uvLength));
      u = f(u + step);
    }
  } else if (rectChanged) {
    updateUv(state, rect);
    const step = f(f(f(rect[2] - rect[0]) / (state.vertices / 2 - 1)) * state.uvLength);
    pairs[segments * PAIR_WORDS + 8] = f(pairs[segments * PAIR_WORDS + 8] + step);
  }
  if (state.distanceUv || rectChanged) state.v.set([rect[1], rect[3]]);
}

interface StageRibbon extends StagePrimitive3d {
  readonly ribbon: RibbonState | null;
}

export function setRibbonControl(node: StageNode, value: number): void {
  const ribbon = (node.extension as StageRibbon).ribbon;
  if (ribbon) ribbon.control = Math.trunc(value);
}

/** The 103 trail follows its node's world positions and rebuilds a camera-facing strip. */
export const ribbonNode: NodeBehavior = {
  type: RIBBON_TYPE,
  construct(node) {
    const graph = node.scene.graph;
    const settings = node.record!.settings;
    const color = nthElement<ColorElement>(node, 101, 0);
    const texture = nthElement<TextureElement>(node, 300, 0);
    try {
      if (settings === null || !color || !texture || texture.data === null)
        throw new RangeError("missing settings or elements");
      const textures = node.elements.filter((element) => element?.type === 300) as TextureElement[];
      if (textures.length > 3 || (textures.length > 1 && textures.some((t) => t.textures === 0)))
        throw new RangeError("ribbon texture slots must be dense and contain at most three images");
      const words = Array.from({ length: 12 }, (_, i) => graph.u32(settings + i * 4));
      const ribbon = createRibbon(words, color.color);
      const vertices = new Float32Array(ribbon.vertices * 6);
      const drawWorld = words[0] === 1 ? new Float32Array(16) : null;
      if (drawWorld) setIdentity(drawWorld);
      node.extension = {
        failure: null,
        ribbon,
        vertices,
        words: new Uint32Array(vertices.buffer),
        draw: stageSimpleDraw(
          node,
          ribbon.vertices,
          true,
          4,
          texture.textures === 0 ? 0 : textures.length,
        ),
        drawWorld,
      } satisfies StageRibbon;
    } catch (error) {
      if (!(error instanceof RangeError) || !node.scene.options.skipUnregistered) throw error;
      node.scene.missing.add(`node ${RIBBON_TYPE}: ${error.message}`);
      node.extension = {
        failure: error.message,
        ribbon: null,
        vertices: new Float32Array(0),
        words: new Uint32Array(0),
        draw: null,
      } satisfies StageRibbon;
    }
  },
  update(node) {
    const state = node.extension as StageRibbon;
    computeWorld(node);
    if (state.drawWorld) {
      state.drawWorld.set(node.world);
      setIdentity(node.world);
    }
    const ribbon = state.ribbon;
    applyMotions(node);
    if (!ribbon || state.failure) return;
    const position = [node.world[12], node.world[13], node.world[14]];
    const camera = sceneCamera(node.scene);
    const color = nthElement<ColorElement>(node, 101, 0)!;
    const texture = nthElement<TextureElement>(node, 300, 0)!;
    advanceRibbon(
      ribbon,
      position,
      camera.eye,
      color.color,
      texture.rect,
      color.changed,
      texture.rectChanged,
      camera.parallel ? camera.eye.map((value, i) => f(value - camera.at[i])) : undefined,
    );
    if (ribbon.active < 2) return;
    if (state.draw && state.draw.vertexCount !== ribbon.vertices)
      state.draw = { ...state.draw, vertexCount: ribbon.vertices };
    color.changed = false;
    if (!ribbon.distanceUv) texture.rectChanged = false;
    for (let i = 0; i <= ribbon.segments; i++) {
      const pair = i * PAIR_WORDS;
      for (let side = 0; side < 2; side++) {
        const at = (i * 2 + side) * 6;
        state.vertices.set(ribbon.pairs.subarray(pair + side * 4, pair + side * 4 + 3), at);
        state.words[at + 3] = vertexColour(ribbon.words[pair + 9]);
        state.vertices[at + 4] = ribbon.pairs[pair + 8];
        state.vertices[at + 5] = ribbon.v[side];
      }
    }
  },
};

/** A supported ribbon contributes a strip only after two history samples exist. */
export function stageRibbon(node: StageNode): StagePrimitive3d | null {
  if (node.record?.type !== RIBBON_TYPE || !node.extension) return null;
  const state = node.extension as StageRibbon;
  return state.ribbon && state.ribbon.active >= 2 ? state : null;
}

/** Whether the ribbon is updated and eligible for draw submission. */
export function stageRibbonLive(node: StageNode): boolean {
  const state = stageRibbon(node);
  return !!state && !state.failure && stageNodeDrawable(node);
}
