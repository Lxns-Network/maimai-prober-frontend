import { applyMotions, computeWorld, type NodeBehavior, type StageNode } from "../runtime";
import { nthElement, type ColorElement, type TextureElement } from "../elements";
import { sinCosAngleCode } from "../../math/trig";
import { vertexColour } from "./primitive";
import { stageSimpleDraw, type StagePrimitive3d } from "./primitive3d";

const f = Math.fround;
export const SOLID_TYPE = 106;
const COLOR_ELEMENT = 101;
const TEXTURE_ELEMENT = 300;
const SETTINGS_WORDS = 13;
const FLOATS = 6;
const SPHERE = 0;
const BOX = 1;
const CYLINDER = 3;
const RING = 4;
const ANGLE_CODES_PER_DEGREE = 182.04444885253906;
const FULL_TURN = 0x10000;

const bits = new Float32Array(1);
const wordsOf = new Uint32Array(bits.buffer);

function floatOf(word: number): number {
  wordsOf[0] = word;
  return bits[0];
}

const trig: { [index: number]: number } = [0, 0];
const sinCode = (code: number) => (sinCosAngleCode(code, trig), trig[0]);
const cosCode = (code: number) => (sinCosAngleCode(code, trig), trig[1]);

function refuse(node: StageNode, state: { failure: string | null }, reason: string): void {
  state.failure = reason;
  node.scene.missing.add(`node ${SOLID_TYPE}: ${reason}`);
}

/** The sphere's vertices: one strip of pole, ring pairs, pole per slice, alternating direction slice by slice. */
function sphereVertices(radius: number, stacks: number, slices: number): Float32Array {
  const perSlice = 2 * stacks;
  const out = new Float32Array(slices * perSlice * FLOATS);
  const uStep = f(1 / slices);
  const longitudeStep = Math.trunc(f(f(uStep * 360) * ANGLE_CODES_PER_DEGREE));
  const vStep = f(1 / stacks);
  const latitudeStep = Math.trunc(f(f(vStep * 180) * ANGLE_CODES_PER_DEGREE));
  const put = (index: number, x: number, y: number, z: number, u: number, v: number) => {
    out[index * FLOATS] = x;
    out[index * FLOATS + 1] = y;
    out[index * FLOATS + 2] = z;
    out[index * FLOATS + 4] = u;
    out[index * FLOATS + 5] = v;
  };
  let longitude = 0;
  let uBase = 0;
  let up = true;
  for (let slice = 0; slice < slices; slice++) {
    const first = slice * perSlice;
    const last = first + perSlice - 1;
    const uCentre = f(f(uStep * 0.5) + uBase);
    if (up) {
      put(first, 0, radius, 0, uCentre, 0);
      let angle = 0;
      let v = 0;
      for (let at = first + 1; at < last; at += 2) {
        angle += latitudeStep;
        const ring = f(sinCode(angle) * radius);
        const y = f(cosCode(angle) * radius);
        v = f(v + vStep);
        put(at, f(sinCode(longitude) * ring), y, f(cosCode(longitude) * ring), uBase, v);
        put(
          at + 1,
          f(sinCode(longitude + longitudeStep) * ring),
          y,
          f(cosCode(longitude + longitudeStep) * ring),
          f(uBase + uStep),
          v,
        );
      }
      put(last, 0, -radius, 0, uCentre, 1);
    } else {
      put(first, 0, -radius, 0, uCentre, 1);
      let angle = FULL_TURN;
      let v = 1;
      for (let at = first + 1; at < last; at += 2) {
        angle -= latitudeStep;
        const ring = -f(sinCode(angle) * radius);
        const y = -f(cosCode(angle) * radius);
        v = f(v - vStep);
        put(
          at,
          f(sinCode(longitude + longitudeStep) * ring),
          y,
          f(cosCode(longitude + longitudeStep) * ring),
          f(uBase + uStep),
          v,
        );
        put(at + 1, f(sinCode(longitude) * ring), y, f(cosCode(longitude) * ring), uBase, v);
      }
      put(last, 0, radius, 0, uCentre, 0);
    }
    up = !up;
    longitude += longitudeStep;
    uBase = f(uBase + uStep);
  }
  return out;
}

function ringVertices(
  inner: number,
  outer: number,
  segments: number,
  repeats: number,
): Float32Array {
  const out = new Float32Array(segments * 6 * FLOATS);
  const angleStep = Math.trunc(f(f(f(1 / segments) * 360) * ANGLE_CODES_PER_DEGREE));
  const uvStep = f(repeats * f(1 / segments));
  const point = (index: number, radius: number, angle: number) => {
    out[index * FLOATS] = f(sinCode(angle) * radius);
    out[index * FLOATS + 2] = f(cosCode(angle) * radius);
  };
  for (let i = 0; i < segments; i++) {
    const first = i * 6;
    if (i === 0) {
      point(first, inner, 0);
      point(first + 1, outer, 0);
    } else {
      out.copyWithin(first * FLOATS, (first - 2) * FLOATS, first * FLOATS);
    }
    if (i === segments - 1) {
      out.copyWithin((first + 4) * FLOATS, 0, 2 * FLOATS);
    } else {
      point(first + 4, inner, angleStep * (i + 1));
      point(first + 5, outer, angleStep * (i + 1));
    }
    for (let side = 0; side < 2; side++) {
      const start = (first + side) * FLOATS;
      const middle = (first + 2 + side) * FLOATS;
      const end = (first + 4 + side) * FLOATS;
      out[middle] = f(f(out[start] + out[end]) * 0.5);
      out[middle + 2] = f(f(out[start + 2] + out[end + 2]) * 0.5);
    }
    for (let pair = 0; pair < 3; pair++) {
      const u = f(f(i + pair * 0.5) * uvStep);
      for (let side = 0; side < 2; side++) {
        const at = (first + pair * 2 + side) * FLOATS;
        out[at + 4] = u;
        out[at + 5] = side;
      }
    }
  }
  return out;
}

function updateRingUvs(state: StagePrimitive3d, repeats: number, texture: TextureElement): void {
  const segments = state.vertices.length / (6 * FLOATS);
  const rect = texture.rect;
  const step = f(f(Math.trunc(repeats) * f(rect[2] - rect[0])) / segments);
  const half = f(step * 0.5);
  for (let i = 0; i < segments; i++) {
    const start = f(f(i * step) + rect[0]);
    const end = f(f((i + 1) * step) + rect[0]);
    for (let pair = 0; pair < 3; pair++) {
      const u = pair === 0 ? start : pair === 1 ? f(start + half) : end;
      for (let side = 0; side < 2; side++) {
        const at = (i * 6 + pair * 2 + side) * FLOATS;
        state.vertices[at + 4] = u;
        state.vertices[at + 5] = rect[side === 0 ? 1 : 3];
      }
    }
  }
  texture.rectChanged = false;
}

function cylinderVertices(radius: number, height: number, segments: number): Float32Array {
  const out = new Float32Array(segments * 6 * FLOATS);
  const halfHeight = f(height * 0.5);
  const step = f(1 / segments);
  const angleStep = Math.trunc(f(f(step * 360) * ANGLE_CODES_PER_DEGREE));
  let x = 0;
  let z = radius;
  let u = 0;
  for (let i = 0; i < segments; i++) {
    const nextX = i === segments - 1 ? 0 : f(sinCode(angleStep * (i + 1)) * radius);
    const nextZ = i === segments - 1 ? radius : f(cosCode(angleStep * (i + 1)) * radius);
    const nextU = i === segments - 1 ? 1 : f(u + step);
    for (const [corner, isNext, bottom] of [
      [0, false, false],
      [1, false, true],
      [2, true, false],
      [3, true, false],
      [4, false, true],
      [5, true, true],
    ] as const) {
      const at = (i * 6 + corner) * FLOATS;
      out[at] = isNext ? nextX : x;
      out[at + 1] = bottom ? -halfHeight : halfHeight;
      out[at + 2] = isNext ? nextZ : z;
      out[at + 4] = isNext ? nextU : u;
      out[at + 5] = bottom ? 1 : 0.5;
    }
    x = nextX;
    z = nextZ;
    u = f(u + step);
  }
  return out;
}

function boxVertices(width: number, height: number, depth: number): Float32Array {
  const x = f(width * 0.5);
  const y = f(height * 0.5);
  const z = f(depth * 0.5);
  const faces = [
    [
      [-x, y, -z],
      [-x, y, z],
      [x, y, -z],
      [x, y, z],
    ],
    [
      [-x, y, z],
      [-x, -y, z],
      [x, y, z],
      [x, -y, z],
    ],
    [
      [-x, -y, z],
      [-x, -y, -z],
      [x, -y, z],
      [x, -y, -z],
    ],
    [
      [-x, y, -z],
      [-x, -y, -z],
      [-x, y, z],
      [-x, -y, z],
    ],
    [
      [x, y, -z],
      [x, -y, -z],
      [-x, y, -z],
      [-x, -y, -z],
    ],
    [
      [x, y, z],
      [x, -y, z],
      [x, y, -z],
      [x, -y, -z],
    ],
  ];
  const corners = [0, 1, 2, 2, 1, 3];
  const uvs = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];
  const vertices = new Float32Array(36 * FLOATS);
  for (let face = 0; face < faces.length; face++) {
    for (let vertex = 0; vertex < corners.length; vertex++) {
      const corner = corners[vertex];
      const at = (face * 6 + vertex) * FLOATS;
      vertices.set(faces[face][corner], at);
      vertices.set(uvs[corner], at + 4);
    }
  }
  return vertices;
}

function updateBoxUvs(state: StagePrimitive3d, texture: TextureElement): void {
  const rect = texture.rect;
  // The native update writes six groups of four, not the six triangle faces.
  for (let vertex = 0; vertex < 24; vertex++) {
    const corner = vertex % 4;
    const at = vertex * FLOATS;
    state.vertices[at + 4] = rect[corner < 2 ? 0 : 2];
    state.vertices[at + 5] = rect[corner === 1 || corner === 2 ? 3 : 1];
  }
  texture.rectChanged = false;
}

function updateCylinderUvs(state: StagePrimitive3d, texture: TextureElement): void {
  const segments = state.vertices.length / (6 * FLOATS);
  const rect = texture.rect;
  const step = f(f(rect[2] - rect[0]) / segments);
  for (let i = 0; i < segments; i++) {
    const left = f(f(i * step) + rect[0]);
    const right = i === segments - 1 ? rect[2] : f(f((i + 1) * step) + rect[0]);
    for (const [corner, isNext, bottom] of [
      [0, false, false],
      [1, false, true],
      [2, true, false],
      [3, true, false],
      [4, false, true],
      [5, true, true],
    ] as const) {
      const at = (i * 6 + corner) * FLOATS;
      state.vertices[at + 4] = isNext ? right : left;
      state.vertices[at + 5] = bottom ? rect[3] : f(rect[1] + 0.5);
    }
  }
  texture.rectChanged = false;
}

function construct(node: StageNode): void {
  const g = node.scene.graph;
  const settings = node.record!.settings;
  const colour = nthElement<ColorElement>(node, COLOR_ELEMENT, 0);
  const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0);
  const state: StagePrimitive3d = {
    failure: null,
    vertices: new Float32Array(0),
    words: new Uint32Array(0),
    draw: null,
  };
  node.extension = state;
  if (settings === null || !colour || !texture) {
    state.failure = "missing settings or element";
    return;
  }
  const s = Array.from({ length: SETTINGS_WORDS }, (_, i) => g.u32(settings + i * 4));
  if (s[0] !== 5) return refuse(node, state, `vertex form ${s[0]}`);
  let vertices: Float32Array;
  if (s[1] === SPHERE) {
    const stacks = Math.trunc(floatOf(s[3]));
    const slices = Math.trunc(floatOf(s[4]));
    if (!(stacks >= 1) || !(slices >= 1)) return refuse(node, state, "solid without divisions");
    vertices = sphereVertices(floatOf(s[2]), stacks, slices);
  } else if (s[1] === BOX) {
    if (s[9] !== 0) return refuse(node, state, `box texture mode ${s[9]}`);
    if (nthElement<TextureElement>(node, TEXTURE_ELEMENT, 1))
      return refuse(node, state, "box second texture element");
    vertices = boxVertices(floatOf(s[2]), floatOf(s[3]), floatOf(s[4]));
  } else if (s[1] === RING) {
    if (s[9] !== 1) return refuse(node, state, `ring texture mode ${s[9]}`);
    if (nthElement<TextureElement>(node, TEXTURE_ELEMENT, 1))
      return refuse(node, state, "ring second texture element");
    const inner = floatOf(s[2]);
    const outer = floatOf(s[3]);
    const segments = Math.trunc(floatOf(s[4]));
    if (!(segments >= 1) || outer < f(0.0000001) || inner >= outer)
      return refuse(node, state, "invalid ring dimensions");
    vertices = ringVertices(inner, outer, segments, floatOf(s[5]));
  } else if (s[1] === CYLINDER) {
    if (s[7] !== 255 || s[8] !== 255 || s[9] !== 2 || s[11] !== 0 || s[12] !== 0)
      return refuse(node, state, "cylinder settings");
    if (nthElement<TextureElement>(node, TEXTURE_ELEMENT, 1))
      return refuse(node, state, "cylinder second texture element");
    const segments = Math.trunc(floatOf(s[4]));
    if (!(segments >= 1)) return refuse(node, state, "solid without divisions");
    vertices = cylinderVertices(floatOf(s[2]), floatOf(s[3]), segments);
  } else return refuse(node, state, `solid kind ${s[1]}`);
  state.vertices = vertices;
  state.words = new Uint32Array(vertices.buffer);
  state.draw = stageSimpleDraw(node, vertices.length / FLOATS, s[1] !== CYLINDER && s[1] !== BOX);
  publishColour(state, s[1] === BOX ? 0xffffffff : colour.color);
}

function publishColour(state: StagePrimitive3d, colour: number): void {
  const packed = vertexColour(colour);
  for (let i = 3; i < state.words.length; i += FLOATS) state.words[i] = packed;
}

function update(node: StageNode): void {
  const state = node.extension as StagePrimitive3d;
  if (state.failure) return;
  computeWorld(node);
  applyMotions(node);
  const colour = nthElement<ColorElement>(node, COLOR_ELEMENT, 0)!;
  if (colour.changed) {
    publishColour(state, colour.color);
    colour.changed = false;
  }
  const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0)!;
  const settings = node.record!.settings!;
  if (texture.rectChanged) {
    const kind = node.scene.graph.u32(settings + 4);
    if (kind === BOX) updateBoxUvs(state, texture);
    else if (kind === RING) updateRingUvs(state, node.scene.graph.f32(settings + 20), texture);
    else if (kind === CYLINDER) updateCylinderUvs(state, texture);
  }
}

/** A procedurally built solid mesh placed by its node matrix. */
export const solidNode: NodeBehavior = {
  type: SOLID_TYPE,
  construct,
  update,
};
