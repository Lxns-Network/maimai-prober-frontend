import { nthElement, type ColorElement, type TextureElement } from "../elements";
import {
  applyMotions,
  computeWorld,
  stageNodeDrawable,
  type NodeBehavior,
  type StageNode,
} from "../runtime";
import { vertexColour } from "./primitive";
import { stageSimpleDraw, type StagePrimitive3d } from "./primitive3d";
import { sampleRibbonHistory } from "./ribbon";
import { setIdentity } from "../../math/matrix";
import { DEGREES_TO_ANGLE_CODE, sinCosAngleCode } from "../../math/trig";
import { sceneCamera } from "../motions/turnCamera";

const f = Math.fround;
const trig = new Float64Array(2);
export const RIBBON_102_TYPE = 102;

/** The source form of a two-edge history strip. */
export interface Ribbon102State {
  readonly capacity: number;
  readonly segments: number;
  readonly interpolation: number;
  readonly uvLength: number;
  readonly distanceUv: boolean;
  readonly cameraOffset: number;
  readonly edgeModes: readonly [number, number];
  readonly edgeAmounts: readonly [number, number];
  readonly offsets: readonly [Float32Array, Float32Array];
  readonly coordinates: readonly [RibbonEndpoint, RibbonEndpoint];
  readonly coordinateMatrix: Float32Array;
  readonly histories: readonly [Float32Array, Float32Array];
  readonly sampled: readonly [Float32Array, Float32Array];
  readonly vertices: Float32Array;
  readonly words: Uint32Array;
  readonly colours: Uint32Array;
  active: number;
  phase: number;
  time: number;
  control: number;
}

interface RibbonEndpoint {
  readonly mode: number;
  readonly id: number;
  readonly translationOnly: boolean;
  readonly joint: number;
}

/** Creates the locally replayed source form of node 102. */
export function createRibbon102(settings: ArrayLike<number>): Ribbon102State {
  const values = new Float32Array(Uint32Array.from(settings).buffer);
  const interpolation = settings[0];
  const capacity = settings[1];
  const segments = interpolation === 0 ? Math.min(settings[2], capacity - 1) : settings[2];
  if (
    (interpolation !== 0 && interpolation !== 1) ||
    capacity < 2 ||
    segments < 1 ||
    !(values[5] >= f(0.0000001)) ||
    [7, 18].some((i) => settings[i] > 4) ||
    [9, 20].some((i) => settings[i] > 1) ||
    [11, 22].some((i) => settings[i] > 2) ||
    settings[29] > 1
  )
    throw new RangeError("Stage ribbon 102: unsupported settings");
  const vertices = new Float32Array((segments + 1) * 12);
  const coordinateMatrix = new Float32Array(16);
  setIdentity(coordinateMatrix);
  const coordinate = (at: number): RibbonEndpoint => ({
    mode: settings[at],
    id: settings[at + 1],
    translationOnly: settings[at + 2] === 1,
    joint: settings[at + 3] | 0,
  });
  const colours = new Uint32Array((segments + 1) * 2);
  const step = f(1 / segments);
  for (let side = 0; side < 2; side++) {
    const colour = settings[side === 0 ? 17 : 28];
    const alpha = (colour >>> 24) & 255;
    const start = f(f(settings[3] * alpha) * f(1 / 255));
    const delta = f(f(f(alpha * f(settings[4] - settings[3])) * f(1 / 255)) * step);
    let value = start;
    for (let i = 0; i <= segments; i++) {
      colours[i * 2 + side] = ((colour & 0xffffff) | (Math.trunc(value) << 24)) >>> 0;
      value = f(f(i * delta) + start);
    }
  }
  const words = new Uint32Array(vertices.buffer);
  let u = 0;
  const uvStep = f(values[5] * step);
  for (let i = 0; i <= segments; i++) {
    for (let side = 0; side < 2; side++) {
      const at = (i * 2 + side) * 6;
      words[at + 3] = vertexColour(colours[i * 2 + side]);
      vertices[at + 4] = u;
      vertices[at + 5] = side;
    }
    u = f(u + uvStep);
  }
  return {
    capacity,
    segments,
    interpolation,
    uvLength: values[5],
    distanceUv: settings[29] !== 0,
    cameraOffset: values[6],
    edgeModes: [settings[11], settings[22]],
    edgeAmounts: [values[12], values[23]],
    offsets: [values.slice(13, 16), values.slice(24, 27)],
    coordinates: [coordinate(7), coordinate(18)],
    coordinateMatrix,
    histories: [new Float32Array(capacity * 3), new Float32Array(capacity * 3)],
    sampled: [new Float32Array((segments + 1) * 3), new Float32Array((segments + 1) * 3)],
    vertices,
    words,
    colours,
    active: 0,
    phase: 0,
    time: 0,
    control: 0,
  };
}

/** Advances both edges and rebuilds their world-space triangle strip. */
export function advanceRibbon102(
  state: Ribbon102State,
  endpoints: readonly [ArrayLike<number>, ArrayLike<number>],
  color: number,
  rect: ArrayLike<number>,
  delta = 1,
  colorChanged = true,
  rectChanged = true,
  camera?: ArrayLike<number>,
): void {
  const time = f(state.time + delta);
  if (state.control === 0) {
    state.active = 0;
    for (let side = 0; side < 2; side++)
      for (let i = 0; i < state.capacity; i++) state.histories[side].set(endpoints[side], i * 3);
    state.control = 1;
  }
  const sample = f(time - Math.floor(state.time)) >= 1 && state.control !== 3;
  state.time = time;
  if (sample) {
    for (let side = 0; side < 2; side++) {
      const history = state.histories[side];
      history.copyWithin(3, 0, history.length - 3);
      if (state.control === 1) history.set(endpoints[side], 0);
    }
    state.active = Math.min(state.active + 1, state.capacity);
    if (state.active >= 2) {
      const centerDifference = (component: number) => {
        const current = f(state.histories[0][component] + state.histories[1][component]);
        const previous = f(state.histories[0][component + 3] + state.histories[1][component + 3]);
        return f(f(current - previous) * 0.5);
      };
      const x = centerDifference(0);
      const y = centerDifference(1);
      const z = centerDifference(2);
      const distance = f(Math.sqrt(f(f(f(y * y) + f(x * x)) + f(z * z))));
      state.phase = f(state.phase + f(distance * f(1 / state.uvLength)));
    }
  }
  if (state.active < 2) return;
  for (let side = 0; side < 2; side++)
    sampleRibbonHistory(
      state.histories[side],
      state.sampled[side],
      state.segments,
      state.active,
      state.interpolation,
    );
  deformRibbon102(state, camera);
  let u = state.distanceUv ? state.phase : rect[0];
  const uvStep = f(f(f(rect[2] - rect[0]) / state.segments) * state.uvLength);
  for (let i = 0; i <= state.segments; i++) {
    for (let side = 0; side < 2; side++)
      writeVertex(state, i, side, color, u, rect, colorChanged, rectChanged);
    if (state.distanceUv && i < state.segments) {
      const dx = edgeCenterDifference(state, i, 0);
      const dy = edgeCenterDifference(state, i, 1);
      const dz = edgeCenterDifference(state, i, 2);
      const length = f(Math.sqrt(f(f(f(dy * dy) + f(dx * dx)) + f(dz * dz))));
      u = f(u + f(length * f(-1 / state.uvLength)));
    } else u = f(u + uvStep);
  }
}

function deformRibbon102(state: Ribbon102State, camera: ArrayLike<number> | undefined): void {
  if (Math.abs(state.cameraOffset) > f(0.0000001)) {
    if (!camera) throw new RangeError("Stage ribbon 102: camera unavailable");
    let x = f(camera[0] - state.sampled[0][0]);
    let y = f(camera[1] - state.sampled[0][1]);
    let z = f(camera[2] - state.sampled[0][2]);
    const square = f(f(f(y * y) + f(x * x)) + f(z * z));
    if (Math.abs(square) >= f(0.0000001) && Math.abs(f(square - 1)) >= f(0.0000001)) {
      const inverse = f(1 / f(Math.sqrt(square)));
      x = f(x * inverse);
      y = f(y * inverse);
      z = f(z * inverse);
    }
    const offset = [
      f(x * state.cameraOffset),
      f(y * state.cameraOffset),
      f(z * state.cameraOffset),
    ];
    for (const edge of state.sampled)
      for (let i = 0; i < edge.length; i++) edge[i] = f(edge[i] + offset[i % 3]);
  }
  if (state.edgeModes[0] === 0 && state.edgeModes[1] === 0) return;
  const angleStep = Math.trunc(f(f(180 / state.segments) * DEGREES_TO_ANGLE_CODE));
  const steps = state.edgeAmounts.map((amount) => f(amount / state.segments));
  const amounts = [...steps];
  for (let i = 1; i <= state.segments; i++) {
    const at = i * 3;
    const x = f(state.sampled[0][at] - state.sampled[1][at]);
    const y = f(state.sampled[0][at + 1] - state.sampled[1][at + 1]);
    const z = f(state.sampled[0][at + 2] - state.sampled[1][at + 2]);
    for (let side = 0; side < 2; side++) {
      const mode = state.edgeModes[side];
      if (mode === 0) continue;
      let amount = amounts[side];
      if (mode === 2) {
        sinCosAngleCode(angleStep * i, trig);
        amount = f(trig[0] * state.edgeAmounts[side]);
      } else amounts[side] = f(amount + steps[side]);
      if (side === 1) amount = -amount;
      const edge = state.sampled[side];
      edge[at] = f(edge[at] + f(x * amount));
      edge[at + 1] = f(edge[at + 1] + f(y * amount));
      edge[at + 2] = f(edge[at + 2] + f(z * amount));
    }
  }
}

function edgeCenterDifference(state: Ribbon102State, index: number, component: number): number {
  const at = index * 3 + component;
  const current = f(state.sampled[0][at] + state.sampled[1][at]);
  const next = f(state.sampled[0][at + 3] + state.sampled[1][at + 3]);
  return f(f(current - next) * 0.5);
}

function writeVertex(
  state: Ribbon102State,
  index: number,
  side: number,
  color: number,
  u: number,
  rect: ArrayLike<number>,
  colorChanged: boolean,
  rectChanged: boolean,
): void {
  const at = (index * 2 + side) * 6;
  state.vertices.set(state.sampled[side].subarray(index * 3, index * 3 + 3), at);
  if (colorChanged) {
    const source = state.colours[index * 2 + side];
    let packed = 0;
    for (let shift = 0; shift < 32; shift += 8)
      packed |= Math.trunc((((source >>> shift) & 255) * ((color >>> shift) & 255)) / 255) << shift;
    state.words[at + 3] = vertexColour(packed);
  }
  if (state.distanceUv || rectChanged) {
    state.vertices[at + 4] = u;
    state.vertices[at + 5] = rect[side === 0 ? 1 : 3];
  }
}

interface StageRibbon102 extends StagePrimitive3d {
  readonly ribbon: Ribbon102State | null;
  readonly endpoints: readonly [Float32Array, Float32Array];
}

export function setRibbon102Control(node: StageNode, value: number): void {
  const ribbon = (node.extension as StageRibbon102).ribbon;
  if (ribbon) ribbon.control = Math.trunc(value);
}

function findRibbonTarget(start: StageNode | null, id: number): StageNode | null {
  if (!start) return null;
  const siblings = start.parent?.children ?? [start];
  for (let i = siblings.indexOf(start); i < siblings.length; i++) {
    const node = siblings[i];
    if (node.flags & 1) continue;
    if (node.record?.id === id) return node;
    const child = findRibbonTarget(node.children[0] ?? null, id);
    if (child) return child;
  }
  return null;
}

/** Resolves both edge references in order, retaining the shared last target matrix on lookup failure. */
export function updateRibbon102Endpoints(
  node: StageNode,
  state: Ribbon102State,
  endpoints: readonly [Float32Array, Float32Array],
): void {
  const matrix = state.coordinateMatrix;
  for (let side = 0; side < 2; side++) {
    const coordinate = state.coordinates[side];
    const offset = state.offsets[side];
    let target: StageNode | null = null;
    if (coordinate.mode === 0) {
      for (let row = 0; row < 3; row++)
        endpoints[side][row] = f(offset[row] + node.world[row + 12]);
      continue;
    }
    switch (coordinate.mode) {
      case 1:
        target = node.parent;
        break;
      case 2:
        target = findRibbonTarget(node, coordinate.id);
        break;
      case 3:
        if (!node.parent) continue;
        target = findRibbonTarget(node.parent, coordinate.id);
        break;
      case 4: {
        let top = node;
        while (top.parent) top = top.parent;
        target = findRibbonTarget(top, coordinate.id);
        break;
      }
    }
    if (target) {
      matrix.set(target.world);
      if (coordinate.joint >= 0 && target.record)
        node.scene.options.nodes
          .get(target.record.type)
          ?.joint?.(target, matrix, coordinate.joint, -1);
    }
    for (let row = 0; row < 3; row++) {
      const translation = f(
        f(
          f(f(matrix[row] * offset[0]) + f(matrix[row + 4] * offset[1])) +
            f(matrix[row + 8] * offset[2]),
        ) + matrix[row + 12],
      );
      endpoints[side][row] = coordinate.translationOnly
        ? f(f(offset[row] + matrix[row + 12]) + node.world[row + 12])
        : f(
            f(
              f(f(matrix[row + 4] * node.world[13]) + f(matrix[row] * node.world[12])) +
                f(matrix[row + 8] * node.world[14]),
            ) + translation,
          );
    }
  }
}

/** A strip whose two edges follow offsets or referenced node joints. */
export const ribbon102Node: NodeBehavior = {
  type: RIBBON_102_TYPE,
  construct(node) {
    try {
      const settings = node.record!.settings;
      const color = nthElement<ColorElement>(node, 101, 0);
      const texture = nthElement<TextureElement>(node, 300, 0);
      if (settings === null || !color || !texture || texture.data === null)
        throw new RangeError("missing settings or elements");
      const textures = node.elements.filter((element) => element?.type === 300) as TextureElement[];
      if (textures.length > 3 || (textures.length > 1 && textures.some((t) => t.textures === 0)))
        throw new RangeError("ribbon texture slots must be dense and contain at most three images");
      const words = Array.from({ length: 30 }, (_, i) => node.scene.graph.u32(settings + i * 4));
      const ribbon = createRibbon102(words);
      node.extension = {
        failure: null,
        ribbon,
        vertices: ribbon.vertices,
        words: ribbon.words,
        draw: stageSimpleDraw(
          node,
          (ribbon.segments + 1) * 2,
          true,
          4,
          texture.textures === 0 ? 0 : textures.length,
        ),
        endpoints: [new Float32Array(3), new Float32Array(3)],
      } satisfies StageRibbon102;
    } catch (error) {
      if (!(error instanceof RangeError) || !node.scene.options.skipUnregistered) throw error;
      node.scene.missing.add(`node ${RIBBON_102_TYPE}: ${error.message}`);
      node.extension = {
        failure: error.message,
        ribbon: null,
        vertices: new Float32Array(0),
        words: new Uint32Array(0),
        draw: null,
        endpoints: [new Float32Array(3), new Float32Array(3)],
      } satisfies StageRibbon102;
    }
  },
  update(node) {
    const state = node.extension as StageRibbon102;
    computeWorld(node);
    applyMotions(node);
    const ribbon = state.ribbon;
    if (!ribbon || state.failure) return;
    if (
      ribbon.control === 0 ||
      (ribbon.control === 1 && f(f(ribbon.time + node.delta) - Math.floor(ribbon.time)) >= 1)
    )
      updateRibbon102Endpoints(node, ribbon, state.endpoints);
    const color = nthElement<ColorElement>(node, 101, 0)!;
    const texture = nthElement<TextureElement>(node, 300, 0)!;
    const camera =
      Math.abs(ribbon.cameraOffset) > f(0.0000001) ? sceneCamera(node.scene).eye : undefined;
    advanceRibbon102(
      ribbon,
      state.endpoints,
      color.color,
      texture.rect,
      node.delta,
      color.changed,
      texture.rectChanged,
      camera,
    );
    if (ribbon.active >= 2 && !ribbon.distanceUv) texture.rectChanged = false;
  },
};

/** A 102 strip after it has at least two history samples. */
export function stageRibbon102(node: StageNode): StagePrimitive3d | null {
  if (node.record?.type !== RIBBON_102_TYPE || !node.extension) return null;
  const state = node.extension as StageRibbon102;
  return state.ribbon && state.ribbon.active >= 2 ? state : null;
}

export function stageRibbon102Live(node: StageNode): boolean {
  const state = stageRibbon102(node);
  return !!state && !state.failure && stageNodeDrawable(node);
}
