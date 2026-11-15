import {
  applyMotions,
  computeWorld,
  stageNodeDrawable,
  sceneState,
  type NodeBehavior,
  type StageNode,
  type StageScene,
} from "../runtime";
import { displayCameraMatrix, sceneCamera } from "../motions/turnCamera";
import { seededValue } from "../random";
import { nthElement, type ColorElement, type TextureElement } from "../elements";
import { sinAngleCode } from "../../math/trig";

const f = Math.fround;
export const STAR_PARTICLE_TYPE = 205;
export const SCREEN_PARTICLE_TYPE = 209;
const COLOR_ELEMENT = 101;
const TEXTURE_ELEMENT = 300;
const EPSILON = f(0.0000001);
const SETTINGS_WORDS = 62;
const PARTICLE_WORDS = 49;
const COLOR_KEY_WORDS = 7;
const SIZE_KEY_WORDS = 8;
const FORCE_WORDS = 13;
const PATH_WORDS = 10;
const FORCE_SLOT_WORDS = 8;
const DEGREES_TO_CODE = f(182.04445);
const DEAD = 1;
const FRESH_COLOR = 0x10000;

// Particle record word indices (byte offset / 4).
const POSITION = 0;
const COLOR = 4;
const SIZE_X = 5;
const SIZE_Y = 6;
const UV_U0 = 7;
const UV_V0 = 8;
const UV_U1 = 9;
const UV_V1 = 10;
const ANGLE = 11;
const OFFSET = 16;
const START = 20;
const PREVIOUS = 24;
const NEXT = 25;
const SCALE_X = 28;
const SCALE_Y = 29;
const AGE = 30;
const SPIN = 31;
const BASE_COLOR = 32;
const PREVIOUS_COLOR = 33;
const COLOR_TIME = 34;
const COLOR_INDEX = 35;
const SIZE_X_NOW = 36;
const SIZE_X_PREVIOUS = 37;
const SIZE_Y_NOW = 38;
const SIZE_Y_PREVIOUS = 39;
const SIZE_TIME = 40;
const SIZE_INDEX = 41;
const FRAME_TIME = 42;
const FRAME_INDEX = 43;
const CURVE_TIME = 44;
const CURVE_INDEX = 45;
const FLAGS = 47;
const SLOT = 48;

export {
  POSITION as STAR_POSITION,
  COLOR as STAR_COLOR,
  SIZE_X as STAR_SIZE_X,
  SIZE_Y as STAR_SIZE_Y,
  UV_U0 as STAR_UV_U0,
  UV_V0 as STAR_UV_V0,
  UV_U1 as STAR_UV_U1,
  UV_V1 as STAR_UV_V1,
  ANGLE as STAR_ANGLE,
  NEXT as STAR_NEXT,
  PARTICLE_WORDS as STAR_PARTICLE_WORDS,
};

function fail(reason: string): never {
  throw new RangeError(reason);
}

/** A block of words readable as unsigned, signed and float values. */
export class Words {
  readonly u: Uint32Array;
  readonly i: Int32Array;
  readonly f: Float32Array;

  constructor(count: number) {
    const buffer = new ArrayBuffer(count * 4);
    this.u = new Uint32Array(buffer);
    this.i = new Int32Array(buffer);
    this.f = new Float32Array(buffer);
  }
}

/** The authored settings of a dynamic particle node: its words and key tables. */
export interface StarParticleSettings {
  readonly screenSpace?: boolean;
  readonly screenTrails?: { readonly count: number; readonly bounds: Float32Array };
  readonly w: Words;
  readonly colorKeys: Words;
  readonly sizeKeys: Words;
  readonly forces: Words;
  readonly path: Words;
  readonly curve: Words;
}

function table(node: StageNode, settings: number, countWord: number, stride: number): Words {
  const g = node.scene.graph;
  const count = g.u32(settings + countWord * 4);
  const head = count === 0 ? null : g.pointer(settings + countWord * 4 + 4);
  if (count !== 0 && head === null) fail("particle node with a missing key table");
  const words = new Words(count * stride);
  for (let i = 0; i < count * stride; i++) words.u[i] = g.u32(head! + i * 4);
  return words;
}

/** Reads the settings of a node; forms the simulation does not cover throw. */
export function readStarParticleSettings(node: StageNode): StarParticleSettings {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) fail("particle node without settings");
  const w = new Words(SETTINGS_WORDS);
  for (let i = 0; i < SETTINGS_WORDS; i++) w.u[i] = g.u32(at + i * 4);
  const settings: StarParticleSettings = {
    w,
    colorKeys: table(node, at, 0, COLOR_KEY_WORDS),
    sizeKeys: table(node, at, 2, SIZE_KEY_WORDS),
    forces: table(node, at, 4, FORCE_WORDS),
    path: table(node, at, 6, PATH_WORDS),
    curve: table(node, at, 8, 2),
  };
  if (w.u[0] < 1 || w.u[2] < 1 || w.u[8] < 1) fail("particle node without key tables");
  if (w.u[18] > 2) fail(`particle random mode ${w.i[18]}`);
  if (w.i[19] !== 5 && w.i[19] !== 6 && w.i[19] !== 7) fail(`particle draw type ${w.i[19]}`);
  if (![0, 1, 2, 3, 6].includes(w.i[12])) fail(`particle emitter shape ${w.i[12]}`);
  if (w.u[6] < 1) fail("particle emitter without a path key");
  if (w.i[22] !== 0 && w.i[22] !== 1) fail(`particle initial emit state ${w.i[22]}`);
  if (w.u[30] > 11) fail(`particle death condition ${w.i[30]}`);
  if (w.i[28] < 0 || w.i[28] > 2) fail(`particle limit mode ${w.i[28]}`);
  if (w.i[21] < 1) fail("particle node without capacity");
  const { colorKeys, sizeKeys, forces } = settings;
  for (let i = 0; i < w.u[0]; i++) {
    const kind = colorKeys.i[i * COLOR_KEY_WORDS];
    if (kind !== 0 && kind !== 1 && kind !== 4) fail(`particle colour key kind ${kind}`);
  }
  for (let i = 0; i < w.u[2]; i++) {
    const kind = sizeKeys.i[i * SIZE_KEY_WORDS];
    if (kind !== 0 && kind !== 4) fail(`particle size key kind ${kind}`);
  }
  for (let i = 0; i < w.u[4]; i++) {
    const kind = forces.i[i * FORCE_WORDS + 8];
    if (kind < 0 || kind > 3) fail(`particle force kind ${kind}`);
    if (kind === 0 && forces.i[i * FORCE_WORDS + 11] > 1) fail("particle force frame");
    if (
      kind === 3 &&
      (forces.u[i * FORCE_WORDS + 11] > 2 ||
        !(
          forces.f[i * FORCE_WORDS + 12] > EPSILON &&
          Number.isFinite(forces.f[i * FORCE_WORDS + 12])
        ))
    )
      fail("particle oscillation phase or period");
  }
  return settings;
}

/** Reads the distinct 2D particle settings into the simulator's field layout. */
export function readScreenParticleSettings(node: StageNode): StarParticleSettings {
  const g = node.scene.graph;
  const at = node.record!.settings;
  if (at === null) fail("particle node without settings");
  const source = new Words(56);
  for (let i = 0; i < 56; i++) source.u[i] = g.u32(at + i * 4);
  const w = new Words(SETTINGS_WORDS);
  w.u.set(source.u.subarray(0, 10));
  w.u.set(source.u.subarray(10, 17), 12);
  w.i[21] = source.i[17];
  w.i[22] = source.i[18];
  w.u.set(source.u.subarray(19, 36), 23);
  w.u.set(source.u.subarray(36, 49), 42);
  w.i[18] = source.i[16];
  const settings: StarParticleSettings = {
    screenSpace: true,
    screenTrails: { count: source.u[48], bounds: source.f.slice(49, 56) },
    w,
    colorKeys: table(node, at, 0, COLOR_KEY_WORDS),
    sizeKeys: table(node, at, 2, SIZE_KEY_WORDS),
    forces: table(node, at, 4, FORCE_WORDS),
    path: table(node, at, 6, PATH_WORDS),
    curve: table(node, at, 8, 2),
  };
  if (w.u[0] < 1 || w.u[2] < 1 || w.u[8] < 1 || w.u[6] < 1)
    fail("2D particle node with unsupported key tables");
  if (w.u[18] > 2) fail(`2D particle random mode ${w.i[18]}`);
  if (![2, 3, 6].includes(w.i[12])) fail(`2D particle emitter shape ${w.i[12]}`);
  if (w.u[17] > 2) fail(`2D particle coordinate mode ${w.i[17]}`);
  if (w.u[30] > 11) fail(`2D particle death condition ${w.i[30]}`);
  if (w.u[28] > 2 || w.u[22] > 1 || w.i[21] < 1)
    fail("2D particle node with unsupported emission limits");
  const { colorKeys, sizeKeys, forces } = settings;
  for (let i = 0; i < w.u[0]; i++) {
    const kind = colorKeys.i[i * COLOR_KEY_WORDS];
    if (kind !== 0 && kind !== 1 && kind !== 4) fail("2D particle colour key kind");
  }
  for (let i = 0; i < w.u[2]; i++) {
    const kind = sizeKeys.i[i * SIZE_KEY_WORDS];
    if (kind !== 0 && kind !== 4) fail("2D particle size key kind");
  }
  if (![0, 1, 10].includes(w.i[49]) || w.i[47] < 1)
    fail("2D particle node with unsupported frame animation");
  for (let i = 0; i < w.u[4]; i++) {
    const at = i * FORCE_WORDS;
    const kind = forces.i[at + 8];
    if (
      kind < 0 ||
      kind > 3 ||
      (kind === 0 && forces.u[at + 11] > 1) ||
      (kind === 3 && forces.u[at + 11] > 2) ||
      (kind === 3 && !(forces.f[at + 12] > EPSILON && Number.isFinite(forces.f[at + 12])))
    )
      fail("2D particle force kind or frame");
  }
  return settings;
}

/** The mutable simulation state of one dynamic particle node. */
export interface StarParticleState {
  readonly settings: StarParticleSettings;
  readonly capacity: number;
  readonly pool: Words;
  /** Per particle and force, eight floats; the fifth carries the force's last settings word. */
  readonly forces: Float32Array;
  readonly trails: Float32Array;
  freeHead: number;
  liveHead: number;
  drawData: Float32Array | null;
  /** How many particles the node has ever spawned. */
  spawned: number;
  age: number;
  seed: number;
  sinceEmit: number;
  emitWait: number;
  fraction: number;
  emitState: number;
  warmed: boolean;
  readonly pathVelocity: Float32Array;
  readonly pathPrevious: Float32Array;
  readonly pathDelta: Float32Array;
  pathIndex: number;
  pathTime: number;
  readonly frameColumns: number;
  readonly frameRows: number;
  readonly frameCount: number;
  readonly frameDuration: number;
  readonly frameStepU: number;
  readonly frameStepV: number;
  readonly sizeHalf: Float32Array;
  readonly emitterHistory: Float32Array | null;
  readonly emitterTangent: Float32Array | null;
  emitterSamples: number;
}

type Extension = StarParticleState | { readonly unsupported: string };

const trigScratch: { [index: number]: number } = [0, 0];
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;
const ANGLE_CODE_TO_RADIANS = f(9.58738019107841e-5);
const DEFAULT_FIELD_OF_VIEW_CODE = 10922;

/** The distance, in screen pixels, at which a unit of view depth spans one pixel of height. */
function focalLength(fieldOfViewCode: number): number {
  const half = f(f(Math.trunc(f(fieldOfViewCode * 0.5))) * ANGLE_CODE_TO_RADIANS);
  const tangent = f(Math.tan(half));
  return f(SCREEN_HEIGHT / f(tangent + tangent));
}

interface HeldView {
  view: Float32Array | null;
  focal: number;
}
const RADIANS_TO_CODE = f(10430.378);
const VIEW_KEY = "starParticle.view";

/** Replaces the camera the particles' screen-space rotation reads; null restores the published display camera. */
export function setStarParticleView(
  scene: StageScene,
  view: Float32Array | null,
  fieldOfViewCode = DEFAULT_FIELD_OF_VIEW_CODE,
): void {
  const held = sceneState<HeldView>(scene, VIEW_KEY, () => ({ view: null, focal: 0 }));
  held.view = view;
  held.focal = focalLength(fieldOfViewCode);
}

/** The published update-time view, independent of camera nodes evaluated later for drawing. */
function viewOf(scene: StageScene): { view: Float32Array; focal: number; parallel?: boolean } {
  const held = sceneState<HeldView>(scene, VIEW_KEY, () => ({ view: null, focal: 0 }));
  if (held.view) return { view: held.view, focal: held.focal };
  const camera = sceneCamera(scene);
  return {
    view: displayCameraMatrix(scene),
    focal: focalLength(camera.fovCode ?? DEFAULT_FIELD_OF_VIEW_CODE),
    parallel: camera.parallel,
  };
}

function angleOf(cosine: number): number {
  const angle = f(f(Math.acos(cosine)) * RADIANS_TO_CODE);
  return Number.isNaN(angle) ? -2147483648 : Math.trunc(angle);
}

function screenAlignedAngle(vx: number, vy: number): number {
  let x = vx;
  let y = f(-vy);
  const length = f(f(y * y) + f(x * x));
  if (Math.abs(length) >= EPSILON && Math.abs(f(length - 1)) >= EPSILON) {
    const inverse = f(1 / f(Math.sqrt(length)));
    x = f(x * inverse);
    y = f(y * inverse);
  }
  return x <= 0 ? (angleOf(y) + 0x8000) | 0 : angleOf(f(-y));
}

/** The angle code that turns a particle's quad along its on-screen direction of travel. */
function alignedAngle(
  state: StarParticleState,
  world: Float32Array,
  camera: { view: Float32Array; focal: number; parallel?: boolean },
  position: Float32Array,
  at: number,
  vx: number,
  vy: number,
  vz: number,
): number {
  let x = position[at];
  let y = position[at + 1];
  let z = position[at + 2];
  let dx = vx;
  let dy = vy;
  let dz = vz;
  if (state.settings.w.i[17] < 2) {
    const m = world;
    const wy = f(f(f(f(m[1] * x) + f(m[5] * y)) + f(m[9] * z)) + m[13]);
    const wz = f(f(f(f(m[2] * x) + f(m[6] * y)) + f(m[10] * z)) + m[14]);
    const wx = f(f(f(f(m[4] * y) + f(x * m[0])) + f(m[8] * z)) + m[12]);
    const ty = f(f(f(m[1] * vx) + f(m[5] * vy)) + f(m[9] * vz));
    const tz = f(f(f(m[2] * vx) + f(m[6] * vy)) + f(m[10] * vz));
    const tx = f(f(f(f(m[4] * vy) + f(vx * m[0])) + f(m[8] * vz)));
    x = wx;
    y = wy;
    z = wz;
    dx = tx;
    dy = ty;
    dz = tz;
  }
  const view = camera.view;
  const project = (px: number, py: number, pz: number, out: number[]) => {
    const vxp = f(f(f(f(view[4] * py) + f(view[0] * px)) + f(view[8] * pz)) + view[12]);
    const vyp = f(f(f(f(view[1] * px) + f(view[5] * py)) + f(view[9] * pz)) + view[13]);
    const vzp = f(f(f(f(view[2] * px) + f(view[6] * py)) + f(view[10] * pz)) + view[14]);
    const inverse = Math.abs(vzp) <= EPSILON ? 0 : f(-1 / vzp);
    const scale = camera.parallel ? 1 : f(inverse * camera.focal);
    out[0] = f(f(vxp * scale) + f(SCREEN_WIDTH * 0.5));
    out[1] = f(f(SCREEN_HEIGHT * 0.5) + f(vyp * f(-scale)));
  };
  const behind: number[] = [0, 0];
  const ahead: number[] = [0, 0];
  project(f(x - dx), f(y - dy), f(z - dz), behind);
  project(x, y, z, ahead);
  let ox = f(ahead[0] - behind[0]);
  let oy = f(ahead[1] - behind[1]);
  const len2 = f(f(ox * ox) + f(oy * oy));
  if (Math.abs(len2) >= EPSILON && Math.abs(f(len2 - 1)) >= EPSILON) {
    const inv = f(1 / f(Math.sqrt(len2)));
    ox = f(ox * inv);
    oy = f(oy * inv);
  }
  return ox <= 0 ? angleOf(-oy) : (angleOf(oy) + 0x8000) | 0;
}

function intBelow(node: StageNode, n: number): number {
  return node.scene.random.intBelow(n);
}

function intRange(
  node: StageNode,
  a: number,
  b: number,
  state: StarParticleState,
  slot: number,
): number {
  if (state.settings.w.i[18] !== 0) return Math.trunc(seededValue(state.seed + slot, f(a), f(b)));
  if (a === b) return a;
  return (a + intBelow(node, Math.abs((b - a) | 0))) | 0;
}

function floatRange(
  node: StageNode,
  a: number,
  b: number,
  state: StarParticleState,
  slot: number,
): number {
  return state.settings.w.i[18] === 0
    ? node.scene.random.floatRange(a, b)
    : seededValue(state.seed + slot, a, b);
}

function particleSeed(node: StageNode, settings: StarParticleSettings): number {
  const mode = settings.w.i[18];
  if (mode === 0) return 0;
  const base = node.scene.graph.u32(node.record!.offset + 36);
  return (base + (mode === 1 ? node.ordinal : Math.trunc(node.birth))) >>> 0;
}

function lerp(a: number, b: number, t: number): number {
  return f(f(f(1 - t) * a) + f(b * t));
}

const channel = (color: number, byte: number) => (color >>> (byte * 8)) & 255;

/** A colour between two colours, channel by channel, truncating each channel. */
function lerpColor(a: number, b: number, t: number): number {
  if (a === b) return b;
  const mix = (byte: number) => lerp(channel(a, byte), channel(b, byte), t) | 0;
  return (
    ((mix(0) & 255) | ((mix(1) & 255) << 8) | ((mix(2) & 255) << 16) | ((mix(3) & 255) << 24)) >>> 0
  );
}

/** A random colour whose channels each lie between the two colours' channels. */
function randomColor(node: StageNode, a: number, b: number): number {
  const pick = (byte: number) => {
    const x = channel(a, byte);
    const y = channel(b, byte);
    const low = Math.min(x, y);
    const high = Math.max(x, y);
    return low === high ? low : low + intBelow(node, high - low);
  };
  const c2 = pick(2);
  const c1 = pick(1);
  const c0 = pick(0);
  const c3 = pick(3);
  return (c0 | (c1 << 8) | (c2 << 16) | (c3 << 24)) >>> 0;
}

/** The node's colour combined with a particle's colour under a blend selector. */
function blendColor(node: number, key: number, mode: number): number {
  const perByte = (op: (a: number, b: number) => number) => {
    let out = 0;
    for (let byte = 0; byte < 4; byte++)
      out |= (op(channel(node, byte), channel(key, byte)) & 255) << (byte * 8);
    return out >>> 0;
  };
  switch (mode) {
    case 0:
      return key;
    case 1:
      return perByte((a, b) => Math.min(a + b, 255));
    case 2:
      return perByte((a, b) => Math.max(a - b, 0));
    case 3:
      return perByte((a, b) => (a + b) >> 1);
    case 4:
      return perByte((a, b) => Math.floor((a * b) / 255));
    case 5:
      return node;
    case 6:
      return ((node & 0xffffff) | (key & 0xff000000)) >>> 0;
    case 7:
      return ((key & 0xffffff) | (node & 0xff000000)) >>> 0;
    default:
      return 0xffffffff;
  }
}

function colorOf(node: StageNode): number {
  return nthElement<ColorElement>(node, COLOR_ELEMENT, 0)?.color ?? 0xffffffff;
}

function createState(
  node: StageNode,
  settings = readStarParticleSettings(node),
): StarParticleState {
  const w = settings.w;
  const sizeScale = settings.screenSpace ? 1 : 0.5;
  const capacity = w.i[21] * (!settings.screenSpace && halfRateEmitter(node) ? 2 : 1);
  const forceCount = w.u[4];
  const pool = new Words(capacity * PARTICLE_WORDS);
  const forces = new Float32Array(capacity * forceCount * FORCE_SLOT_WORDS);
  for (let k = 0; k < capacity; k++) {
    pool.u[k * PARTICLE_WORDS + SLOT] = k;
    for (const word of [3, 15, 19, 23]) pool.f[k * PARTICLE_WORDS + word] = 1;
    for (let i = 0; i < forceCount; i++) {
      forces[(k * forceCount + i) * FORCE_SLOT_WORDS + 3] = 1;
      forces[(k * forceCount + i) * FORCE_SLOT_WORDS + 4] = settings.forces.f[i * FORCE_WORDS + 12];
    }
    pool.i[k * PARTICLE_WORDS + NEXT] = k + 1 < capacity ? k + 1 : -1;
  }
  const frameColumns = w.i[47];
  const frameRows = w.i[48] < 1 ? frameColumns : w.i[48];
  let frameCount = w.i[50];
  if (frameCount > frameRows * frameColumns || frameCount < 0)
    frameCount = frameRows * frameColumns - 1;
  let frameDuration = w.f[51];
  if (frameDuration < 0) frameDuration = frameCount < 1 ? 0 : f(w.f[31] / frameCount);
  const state: StarParticleState = {
    settings,
    capacity,
    pool,
    forces,
    trails: new Float32Array(capacity * (settings.screenTrails?.count ?? w.u[54]) * 4),
    freeHead: 0,
    liveHead: -1,
    drawData: null,
    spawned: 0,
    age: 0,
    seed: particleSeed(node, settings),
    sinceEmit: w.f[24],
    emitWait: 0,
    fraction: 0,
    emitState: w.i[22],
    warmed: w.i[23] <= 0,
    pathVelocity: new Float32Array(w.u[6] * 3),
    pathPrevious: new Float32Array(3),
    pathDelta: new Float32Array(3),
    pathIndex: 0,
    pathTime: settings.path.f[8],
    frameColumns,
    frameRows,
    frameCount,
    frameDuration,
    frameStepU: f(1 / frameColumns),
    frameStepV: f(1 / frameRows),
    sizeHalf: Float32Array.of(
      f(w.f[32] * sizeScale),
      f(w.f[33] * sizeScale),
      f(w.f[34] * sizeScale),
      f(w.f[35] * sizeScale),
    ),
    emitterHistory: w.i[12] === 6 ? new Float32Array(9) : null,
    emitterTangent: w.i[12] === 6 ? new Float32Array(3) : null,
    emitterSamples: 0,
  };
  state.emitWait = w.f[25] <= -1 ? w.f[24] : floatRange(node, w.f[25], w.f[24], state, 0);
  const trails = settings.screenTrails;
  for (let at = 3; at < state.trails.length; at += 4) state.trails[at] = 1;
  if (trails)
    for (let particle = 0; particle < capacity; particle++)
      for (let trail = 0; trail < trails.count; trail++) {
        const at = (particle * trails.count + trail) * 4;
        const slot = particle + trail + 1;
        state.trails[at + 2] = floatRange(
          node,
          trails.bounds[6],
          trails.bounds[2],
          state,
          slot + 2,
        );
        state.trails[at + 1] = floatRange(
          node,
          trails.bounds[5],
          trails.bounds[1],
          state,
          slot + 1,
        );
        state.trails[at] = floatRange(node, trails.bounds[4], trails.bounds[0], state, slot);
        state.trails[at + 3] = 1;
      }
  selectPathVelocity(node, state);
  state.pathPrevious.set(state.pathVelocity.subarray(0, 3));
  return state;
}

function halfRateEmitter(node: StageNode): boolean {
  return ((node.record!.flags | (node.parent?.record?.flags ?? 0)) & 0x800) !== 0;
}

function selectPathVelocity(node: StageNode, state: StarParticleState): void {
  const path = state.settings.path.f;
  const at = state.pathIndex * PATH_WORDS;
  const slot = screenParticle(state) ? 19 : 20;
  const z = floatRange(node, path[at + 2], path[at + 6], state, slot + 2);
  const y = floatRange(node, path[at + 1], path[at + 5], state, slot + 1);
  const x = floatRange(node, path[at], path[at + 4], state, slot);
  state.pathVelocity.set([x, y, z], state.pathIndex * 3);
}

function pathStep(node: StageNode, state: StarParticleState, out: Float32Array): void {
  const delta = node.delta;
  if (state.settings.w.u[6] === 1) {
    for (let axis = 0; axis < 3; axis++) out[axis] = f(state.pathVelocity[axis] * delta);
    return;
  }
  const at = state.pathIndex * PATH_WORDS;
  const path = state.settings.path;
  const duration = path.f[at + 8];
  if (path.i[at + 9] === 0) {
    const weight = duration > EPSILON ? Math.min(f(state.pathTime / duration), 1) : 1;
    const velocity = state.pathIndex * 3;
    for (let axis = 0; axis < 3; axis++) {
      const previous = f(state.pathPrevious[axis] * f(1 - weight));
      const current = f(state.pathVelocity[velocity + axis] * weight);
      out[axis] = axis === 0 ? f(current + previous) : f(previous + current);
    }
  }
  if (state.pathTime >= duration) {
    state.pathIndex = (state.pathIndex + 1) % state.settings.w.u[6];
    state.pathTime = 0;
    state.pathPrevious.set(out);
    selectPathVelocity(node, state);
  }
  for (let axis = 0; axis < 3; axis++) out[axis] = f(out[axis] * delta);
  state.pathTime = f(state.pathTime + delta);
}

/** Scales a three-component vector to unit length unless it is nearly zero or nearly unit length. */
function normalise(v: Float32Array, at: number): void {
  const len2 = f(f(f(v[at] * v[at]) + f(v[at + 1] * v[at + 1])) + f(v[at + 2] * v[at + 2]));
  if (!(Math.abs(len2) >= EPSILON) || !(Math.abs(f(len2 - 1)) >= EPSILON)) return;
  const inv = f(1 / f(Math.sqrt(len2)));
  v[at] = f(inv * v[at]);
  v[at + 1] = f(inv * v[at + 1]);
  v[at + 2] = f(inv * v[at + 2]);
}

function oscillatingColor(a: number, b: number, angle: number): number {
  const sine = sinAngleCode(angle, trigScratch);
  let color = 0;
  for (let shift = 0; shift < 32; shift += 8) {
    const low = (a >>> shift) & 255;
    const high = (b >>> shift) & 255;
    const channel = Math.trunc(f(f(f((high - low) * 0.5) * sine) + f((low + high) * 0.5)));
    color |= (channel & 255) << shift;
  }
  return color >>> 0;
}

function evalColorKey(node: StageNode, state: StarParticleState, p: number, key: number): void {
  const { pool, settings } = state;
  const keys = settings.colorKeys;
  const base = p * PARTICLE_WORDS;
  const at = key * COLOR_KEY_WORDS;
  if (keys.i[at] === 1) {
    if ((pool.u[base + FLAGS] & FRESH_COLOR) !== 0) {
      pool.u[base + BASE_COLOR] = randomColor(
        node,
        keys.u[key * COLOR_KEY_WORDS + 2],
        keys.u[key * COLOR_KEY_WORDS + 1],
      );
      pool.u[base + FLAGS] &= ~FRESH_COLOR;
    }
  } else if (keys.i[at] === 4) {
    const period = f(Math.max(keys.f[at + 5], 0));
    let phase = 0;
    if (Math.abs(period) > EPSILON) phase = f(f(pool.f[base + COLOR_TIME] % period) / period);
    const sum = f(keys.f[at + 6] + f(phase * 360));
    const degrees = sum <= 360 ? sum : f(sum - f(f(Math.trunc(Math.trunc(sum) / 360)) * 360));
    const angle = Math.trunc(f(degrees * DEGREES_TO_CODE));
    pool.u[base + BASE_COLOR] = oscillatingColor(keys.u[at + 2], keys.u[at + 1], angle);
  } else pool.u[base + BASE_COLOR] = keys.u[at + 1];
}

function evalSizeKey(state: StarParticleState, p: number, key: number): void {
  const { pool, settings } = state;
  const k = settings.sizeKeys;
  const base = p * PARTICLE_WORDS;
  const at = key * SIZE_KEY_WORDS;
  if (k.i[at] === 4) {
    const dx = f(k.f[at + 1] - k.f[at + 3]);
    const dy = f(k.f[at + 2] - k.f[at + 4]);
    const period = f(Math.max(k.f[at + 6], 0));
    let phase = 0;
    if (Math.abs(period) > EPSILON) phase = f(f(pool.f[base + SIZE_TIME] % period) / period);
    const sum = f(k.f[at + 7] + f(phase * 360));
    const degrees = sum <= 360 ? sum : f(sum - f(f(Math.trunc(Math.trunc(sum) / 360)) * 360));
    const angle = Math.trunc(f(degrees * DEGREES_TO_CODE));
    const wave = f(sinAngleCode(angle, trigScratch) + 1);
    pool.f[base + SIZE_X_NOW] = f(f(f(wave * dx) * 0.5) + k.f[at + 3]);
    pool.f[base + SIZE_Y_NOW] = f(f(f(wave * dy) * 0.5) + k.f[at + 4]);
  } else {
    pool.f[base + SIZE_X_NOW] = k.f[at + 1];
    pool.f[base + SIZE_Y_NOW] = k.f[at + 2];
  }
}

function screenParticle(state: StarParticleState): boolean {
  return state.settings.screenSpace === true;
}

function updateColor(
  node: StageNode,
  state: StarParticleState,
  p: number,
  nodeColor: number,
): void {
  const { pool, settings } = state;
  const keys = settings.colorKeys;
  const w = settings.w;
  const base = p * PARTICLE_WORDS;
  const count = w.u[0];
  let key = pool.i[base + COLOR_INDEX];
  let color: number;
  if (count > 1) {
    const time = pool.f[base + COLOR_TIME];
    const duration = keys.f[key * COLOR_KEY_WORDS + 4];
    if (time >= duration) {
      pool.u[base + FLAGS] |= FRESH_COLOR;
      pool.u[base + PREVIOUS_COLOR] = pool.u[base + BASE_COLOR];
      pool.i[base + COLOR_INDEX] = key + 1;
      pool.f[base + COLOR_TIME] = f(time - duration);
      if (key + 1 >= count) {
        if (w.i[44] !== 0) pool.i[base + COLOR_INDEX] = 0;
        else {
          pool.f[base + COLOR_TIME] = duration;
          pool.i[base + COLOR_INDEX] = count - 1;
        }
      }
      key = pool.i[base + COLOR_INDEX];
    }
    evalColorKey(node, state, p, key);
    color = pool.u[base + BASE_COLOR];
    if (keys.i[key * COLOR_KEY_WORDS + 3] === 1) {
      const span = keys.f[key * COLOR_KEY_WORDS + 4];
      if (span <= EPSILON) color = pool.u[base + PREVIOUS_COLOR];
      else {
        const t = f(pool.f[base + COLOR_TIME] / span);
        if (t < 1) color = lerpColor(pool.u[base + PREVIOUS_COLOR], pool.u[base + BASE_COLOR], t);
      }
    }
  } else {
    evalColorKey(node, state, p, key);
    color = pool.u[base + BASE_COLOR];
  }
  pool.u[base + COLOR] = blendColor(nodeColor, color, w.i[43]);
}

function updateSize(state: StarParticleState, p: number): void {
  const { pool, settings } = state;
  const k = settings.sizeKeys;
  const w = settings.w;
  const base = p * PARTICLE_WORDS;
  const count = w.u[2];
  let key = pool.i[base + SIZE_INDEX];
  if (count <= 1) {
    evalSizeKey(state, p, key);
    pool.f[base + SIZE_X] = f(pool.f[base + SIZE_X_NOW] * pool.f[base + SCALE_X]);
    pool.f[base + SIZE_Y] = f(pool.f[base + SIZE_Y_NOW] * pool.f[base + SCALE_Y]);
    return;
  }
  const time = pool.f[base + SIZE_TIME];
  const duration = k.f[key * SIZE_KEY_WORDS + 5];
  if (time >= duration) {
    pool.u[base + SIZE_X_PREVIOUS] = pool.u[base + SIZE_X_NOW];
    pool.u[base + SIZE_Y_PREVIOUS] = pool.u[base + SIZE_Y_NOW];
    pool.i[base + SIZE_INDEX] = key + 1;
    pool.f[base + SIZE_TIME] = f(time - duration);
    if (key + 1 >= count) {
      if (w.i[46] !== 0) pool.i[base + SIZE_INDEX] = 0;
      else {
        pool.f[base + SIZE_TIME] = duration;
        pool.i[base + SIZE_INDEX] = count - 1;
      }
    }
    key = pool.i[base + SIZE_INDEX];
  }
  evalSizeKey(state, p, key);
  const span = k.f[key * SIZE_KEY_WORDS + 5];
  let t: number;
  if (span <= EPSILON) t = 0;
  else {
    const ratio = f(pool.f[base + SIZE_TIME] / span);
    t = ratio <= 1 ? f(Math.max(ratio, 0)) : 1;
  }
  pool.f[base + SIZE_X] = f(
    lerp(pool.f[base + SIZE_X_PREVIOUS], pool.f[base + SIZE_X_NOW], t) * pool.f[base + SCALE_X],
  );
  pool.f[base + SIZE_Y] = f(
    lerp(pool.f[base + SIZE_Y_PREVIOUS], pool.f[base + SIZE_Y_NOW], t) * pool.f[base + SCALE_Y],
  );
}

function stepFrame(node: StageNode, state: StarParticleState, p: number): void {
  const { pool, settings } = state;
  const w = settings.w;
  const base = p * PARTICLE_WORDS;
  const time = pool.f[base + FRAME_TIME];
  if (!(time >= state.frameDuration)) return;
  pool.f[base + FRAME_TIME] = f(time - state.frameDuration);
  const mode = w.i[49];
  if (mode >= 0) {
    let reset = true;
    if (mode <= 1) {
      const index = pool.i[base + FRAME_INDEX] + 1;
      pool.i[base + FRAME_INDEX] = index;
      if (index <= state.frameCount) reset = false;
      else if (w.i[52] === 0) {
        pool.i[base + FRAME_INDEX] = index - 1;
        reset = false;
      }
    } else if (mode === 10) {
      const current = pool.i[base + FRAME_INDEX];
      if (screenParticle(state) ? state.frameCount > 0 : current > 0) {
        const pick = intBelow(node, state.frameCount - 1);
        pool.i[base + FRAME_INDEX] = pick;
        if (pick < current) reset = false;
        else {
          pool.i[base + FRAME_INDEX] = pick + 1;
          if (pick + 1 <= state.frameCount) reset = false;
        }
      }
    } else reset = false;
    if (reset) pool.i[base + FRAME_INDEX] = 0;
  }
  setFrameRect(state, p);
}

function setFrameRect(state: StarParticleState, p: number): void {
  const { pool } = state;
  const base = p * PARTICLE_WORDS;
  const index = pool.i[base + FRAME_INDEX];
  pool.f[base + UV_U0] = f(f(index % state.frameColumns) * state.frameStepU);
  pool.f[base + UV_V0] = f(f(Math.trunc(index / state.frameColumns)) * state.frameStepV);
  pool.f[base + UV_U1] = f(state.frameStepU + pool.f[base + UV_U0]);
  pool.f[base + UV_V1] = f(state.frameStepV + pool.f[base + UV_V0]);
}

/** Moves flagged particles from the live list to the free list. */
function retire(state: StarParticleState): void {
  const { pool } = state;
  let p = state.liveHead;
  while (p >= 0) {
    const base = p * PARTICLE_WORDS;
    const next = pool.i[base + NEXT];
    if ((pool.u[base + FLAGS] & DEAD) !== 0) {
      const previous = pool.i[base + PREVIOUS];
      if (previous >= 0) pool.i[previous * PARTICLE_WORDS + NEXT] = next;
      if (next >= 0) pool.i[next * PARTICLE_WORDS + PREVIOUS] = previous;
      if (p === state.liveHead) state.liveHead = next;
      pool.i[base + NEXT] = state.freeHead;
      state.freeHead = p;
    }
    p = next;
  }
}

function updateParticles(node: StageNode, state: StarParticleState): void {
  const { pool, settings } = state;
  const w = settings.w;
  const delta = node.delta;
  const nodeColor = colorOf(node);
  const world = node.world;
  const forceCount = w.u[4];
  const path = state.pathDelta;
  path.fill(0);
  if (w.u[6] > 0) pathStep(node, state, path);
  let scaleX = 1;
  let scaleY = 1;
  const scaled = w.i[45] !== 0;
  if (scaled) {
    scaleX = f(
      Math.sqrt(f(f(f(world[0] * world[0]) + f(world[1] * world[1])) + f(world[2] * world[2]))),
    );
    scaleY = f(
      Math.sqrt(f(f(f(world[4] * world[4]) + f(world[5] * world[5])) + f(world[6] * world[6]))),
    );
  }
  const pf = pool.f;
  const aligned =
    !screenParticle(state) && w.i[42] !== 0 && w.i[40] !== 0 ? viewOf(node.scene) : null;
  for (let p = state.liveHead; p >= 0; p = pool.i[p * PARTICLE_WORDS + NEXT]) {
    const b = p * PARTICLE_WORDS;
    pf[b] = 0;
    pf[b + 1] = 0;
    pf[b + 2] = 0;
    pf[b + 3] = 1;
    let ax = 0;
    let ay = 0;
    let az = 0;
    const age = pf[b + AGE];
    for (let i = 0; i < forceCount; i++) {
      const start = settings.forces.f[i * FORCE_WORDS + 9];
      // Screen particles gate forces with the first pool slot's age, not the current particle's.
      if (!(start <= (screenParticle(state) ? pf[AGE] : age))) continue;
      const at = (p * forceCount + i) * FORCE_SLOT_WORDS;
      const kind = settings.forces.i[i * FORCE_WORDS + 8];
      if (kind === 0 || kind === 2) {
        ax = f(ax + f(state.forces[at] * delta));
        ay = f(ay + f(state.forces[at + 1] * delta));
        az = f(az + f(state.forces[at + 2] * delta));
      } else if (kind === 1) {
        const t = f(age - start);
        ax = f(ax + f(state.forces[at] * t));
        ay = f(ay + f(state.forces[at + 1] * t));
        az = f(az + f(state.forces[at + 2] * t));
      } else {
        const period = state.forces[at + 4];
        let time = f(age - start);
        while (time >= period) time = f(time - period);
        const phase = f(f(time / period) * 360);
        for (let axis = 0; axis < 3; axis++) {
          let degrees = f(state.forces[at + 5 + axis] + phase);
          if (degrees > 360) degrees = f(degrees - f(Math.trunc(Math.trunc(degrees) / 360) * 360));
          const angle = Math.trunc(f(degrees * DEGREES_TO_CODE));
          pf[b + axis] = f(
            pf[b + axis] + f(sinAngleCode(angle, trigScratch) * state.forces[at + axis]),
          );
        }
      }
    }
    pf[b] = f(pf[b] + pf[b + START]);
    pf[b + 1] = f(pf[b + 1] + pf[b + START + 1]);
    pf[b + 2] = f(pf[b + 2] + pf[b + START + 2]);
    let scale: number;
    const curve = settings.curve;
    if (w.u[8] < 2) scale = curve.f[0];
    else {
      let index = pool.i[b + CURVE_INDEX];
      let time = pf[b + CURVE_TIME];
      if (time > curve.f[2 * index + 1]) {
        do {
          time = f(time - curve.f[2 * index + 1]);
          index++;
          pool.i[b + CURVE_INDEX] = index;
          pf[b + CURVE_TIME] = time;
          if (index >= w.u[8]) {
            if (w.i[53] !== 0) {
              index = 1;
              pool.i[b + CURVE_INDEX] = 1;
            } else {
              index = w.u[8] - 1;
              pool.i[b + CURVE_INDEX] = index;
              time = curve.f[2 * index + 1];
              pf[b + CURVE_TIME] = time;
            }
          }
        } while (time > curve.f[2 * index + 1]);
      }
      scale = lerp(
        curve.f[2 * index - 2],
        curve.f[2 * index],
        f(pf[b + CURVE_TIME] / curve.f[2 * index + 1]),
      );
    }
    const vx = f(ax * scale);
    const vy = f(ay * scale);
    const vz = f(az * scale);
    pf[b + OFFSET] = f(vx + pf[b + OFFSET]);
    pf[b + OFFSET + 1] = f(pf[b + OFFSET + 1] + vy);
    pf[b + OFFSET + 2] = f(pf[b + OFFSET + 2] + vz);
    if (w.u[6] > 0) {
      pf[b + OFFSET] = f(path[0] + pf[b + OFFSET]);
      pf[b + OFFSET + 1] = f(path[1] + pf[b + OFFSET + 1]);
      pf[b + OFFSET + 2] = f(path[2] + pf[b + OFFSET + 2]);
    }
    pf[b] = f(pf[b] + pf[b + OFFSET]);
    pf[b + 1] = f(pf[b + OFFSET + 1] + pf[b + 1]);
    pf[b + 2] = f(pf[b + OFFSET + 2] + pf[b + 2]);
    updateColor(node, state, p, nodeColor);
    updateSize(state, p);
    if (scaled) {
      pf[b + SIZE_X] = f(pf[b + SIZE_X] * scaleX);
      pf[b + SIZE_Y] = f(pf[b + SIZE_Y] * scaleY);
    }
    if (state.frameCount > 1) stepFrame(node, state, p);
    const death = w.i[30];
    const threshold = w.f[31];
    let expired = false;
    if (death === 1) expired = !(pf[b + AGE] < threshold);
    else if (death >= 4 && death <= 9) {
      const position = pf[b + Math.floor((death - 4) / 2)];
      expired = (death & 1) === 0 ? !(position < threshold) : !(threshold < position);
    } else if (death === 10 || death === 11) {
      // Native 0x12fb7bb squares only X; Y and Z are each added twice.
      const distance = f(f(f(f(f(pf[b] * pf[b]) + pf[b + 1]) + pf[b + 1]) + pf[b + 2]) + pf[b + 2]);
      const limit = f(threshold * threshold);
      expired = death === 10 ? !(distance < limit) : !(limit < distance);
    }
    if (expired) pool.u[b + FLAGS] |= DEAD;
    if (screenParticle(state) && w.i[42] !== 0) pool.i[b + ANGLE] = screenAlignedAngle(vx, vy);
    else if (aligned) pool.i[b + ANGLE] = alignedAngle(state, world, aligned, pf, b, vx, vy, vz);
    else pool.i[b + ANGLE] = (pool.i[b + ANGLE] + Math.trunc(f(f(pool.i[b + SPIN]) * delta))) | 0;
    pf[b + AGE] = f(delta + pf[b + AGE]);
    pf[b + COLOR_TIME] = f(delta + pf[b + COLOR_TIME]);
    pf[b + SIZE_TIME] = f(delta + pf[b + SIZE_TIME]);
    pf[b + FRAME_TIME] = f(delta + pf[b + FRAME_TIME]);
    pf[b + CURVE_TIME] = f(delta + pf[b + CURVE_TIME]);
  }
}

function spawn(node: StageNode, state: StarParticleState, ordinal: number, count: number): boolean {
  const { pool, settings } = state;
  const w = settings.w;
  const p = state.freeHead;
  if (p < 0) return false;
  const b = p * PARTICLE_WORDS;
  state.freeHead = pool.i[b + NEXT];
  const pf = pool.f;
  const delta = node.delta;
  if (w.f[33] >= 0)
    pf[b + SCALE_X] = floatRange(node, state.sizeHalf[1], state.sizeHalf[0], state, ordinal + 5);
  else pf[b + SCALE_X] = state.sizeHalf[0];
  if (w.f[34] >= 0) {
    if (w.f[35] >= 0)
      pf[b + SCALE_Y] = floatRange(node, state.sizeHalf[3], state.sizeHalf[2], state, ordinal + 6);
    else pf[b + SCALE_Y] = state.sizeHalf[2];
  } else pf[b + SCALE_Y] = pf[b + SCALE_X];
  const shape = w.i[12];
  const direction = pf.subarray(b + START, b + START + 3);
  const scratch = new Float32Array(3);
  if (shape === 0 || shape === 1 || shape === 6) {
    pf[b + 23] = 0;
    const x = floatRange(node, -1, 1, state, ordinal + 7);
    const y = floatRange(node, -1, 1, state, ordinal + 8);
    const z = screenParticle(state) ? 0 : floatRange(node, -1, 1, state, ordinal + 9);
    scratch.set([x, y, z]);
    normalise(scratch, 0);
    const speed = floatRange(node, w.f[14], w.f[13], state, ordinal + 10);
    direction[0] = f(speed * scratch[0]);
    direction[1] = f(speed * scratch[1]);
    direction[2] = f(speed * scratch[2]);
    if (shape === 1) direction[1] = f(Math.abs(direction[1]));
  } else if (shape === 2) {
    pf[b + 23] = 0;
    const x = f(floatRange(node, 0, w.f[13], state, ordinal + 7) - f(w.f[13] * 0.5));
    const y = f(floatRange(node, 0, w.f[14], state, ordinal + 8) - f(w.f[14] * 0.5));
    const z = screenParticle(state)
      ? -1
      : f(floatRange(node, 0, w.f[15], state, ordinal + 9) - f(w.f[15] * 0.5));
    direction[0] = x;
    direction[1] = y;
    direction[2] = z;
  } else {
    pf[b + 23] = 0;
    const radius = floatRange(node, w.f[14], w.f[13], state, ordinal + 10);
    const angle = intRange(node, 0, 0xffff, state, ordinal + 11);
    const cosine = sinAngleCode(angle + 0x4000, trigScratch);
    direction[0] = f(cosine * radius);
    direction[screenParticle(state) ? 1 : 2] = f(sinAngleCode(angle, trigScratch) * radius);
    direction[screenParticle(state) ? 2 : 1] = screenParticle(state) ? -1 : 0;
  }
  if (screenParticle(state)) direction[2] = -1;
  pf[b + OFFSET] = 0;
  pf[b + OFFSET + 1] = 0;
  pf[b + OFFSET + 2] = 0;
  pf[b + OFFSET + 3] = 1;
  pf[b + 12] = 0;
  pf[b + 13] = 0;
  pf[b + 14] = 0;
  pf[b + 15] = 1;
  const forceCount = w.u[4];
  const world = node.world;
  for (let i = 0; i < forceCount; i++) {
    const e = i * FORCE_WORDS;
    const at = (p * forceCount + i) * FORCE_SLOT_WORDS;
    const fr = settings.forces.f;
    state.forces[at] = floatRange(node, fr[e], fr[e + 4], state, ordinal + 12 + i);
    state.forces[at + 1] = floatRange(node, fr[e + 1], fr[e + 5], state, ordinal + 13 + i);
    state.forces[at + 2] = screenParticle(state)
      ? 0
      : floatRange(node, fr[e + 2], fr[e + 6], state, ordinal + 14 + i);
    state.forces[at + 3] = 0;
    const kind = settings.forces.i[e + 8];
    if (kind === 2) {
      const original = state.forces[at];
      state.forces[at] = pf[b + START];
      state.forces[at + 1] = pf[b + START + 1];
      state.forces[at + 2] = screenParticle(state) ? 0 : pf[b + START + 2];
      state.forces[at + 3] = pf[b + 23];
      const unit = state.forces.subarray(at, at + 3);
      normalise(unit, 0);
      state.forces[at] = f(state.forces[at] * original);
      state.forces[at + 1] = f(state.forces[at + 1] * original);
      state.forces[at + 2] = f(state.forces[at + 2] * original);
      pf[b + OFFSET] = f(pf[b + OFFSET] + f(delta * state.forces[at]));
      pf[b + OFFSET + 1] = f(pf[b + OFFSET + 1] + f(state.forces[at + 1] * delta));
      pf[b + OFFSET + 2] = f(pf[b + OFFSET + 2] + f(state.forces[at + 2] * delta));
    } else if (kind === 3) {
      const phase = settings.forces.i[e + 11];
      const slot = ordinal + (screenParticle(state) ? 14 : 15) + i;
      if (phase === 0) {
        state.forces[at + 5] = 0;
        state.forces[at + 6] = 0;
        state.forces[at + 7] = 0;
      } else if (phase === 1) {
        const degrees = floatRange(node, 0, 360, state, slot);
        state.forces.fill(degrees, at + 5, at + 8);
      } else {
        for (let axis = 0; axis < 3; axis++)
          state.forces[at + 5 + axis] = floatRange(node, 0, 360, state, slot + axis);
      }
    } else if (kind === 0) {
      if (settings.forces.i[e + 11] === 1) {
        const x = state.forces[at];
        const y = state.forces[at + 1];
        const z = state.forces[at + 2];
        state.forces[at] = f(f(f(world[0] * x) + f(world[4] * y)) + f(world[8] * z));
        state.forces[at + 1] = f(f(f(x * world[1]) + f(y * world[5])) + f(world[9] * z));
        state.forces[at + 2] = f(f(f(world[2] * x) + f(world[6] * y)) + f(world[10] * z));
      }
      pf[b + OFFSET] = f(pf[b + OFFSET] + f(delta * state.forces[at]));
      pf[b + OFFSET + 1] = f(f(state.forces[at + 1] * delta) + pf[b + OFFSET + 1]);
      pf[b + OFFSET + 2] = f(f(state.forces[at + 2] * delta) + pf[b + OFFSET + 2]);
    }
  }
  if (shape === 6) {
    const history = state.emitterHistory!;
    if (state.emitterSamples === 1) {
      for (let c = 0; c < 3; c++) direction[c] = f(direction[c] + history[c]);
    } else {
      const ratio = f(f(ordinal + 1) / count);
      const curve = f(0.25 - f(f(ratio - 0.5) * f(ratio - 0.5)));
      for (let c = 0; c < 3; c++) {
        const position = f(f(history[c] * ratio) + f(history[c + 3] * f(1 - ratio)));
        direction[c] = f(direction[c] + position);
        if (curve > 0) direction[c] = f(direction[c] + f(state.emitterTangent![c] * curve));
      }
    }
  } else if (w.i[17] >= 2) {
    const y = pf[b + START + 1];
    const x = pf[b + START];
    const z = pf[b + START + 2];
    const nz = f(f(f(world[2] * x) + f(world[6] * y)) + f(world[10] * z)) + 0;
    const nx = f(f(f(world[4] * y) + f(x * world[0])) + f(world[8] * z));
    pf[b + START + 1] = f(f(f(f(world[1] * x) + f(world[5] * y)) + f(world[9] * z)) + world[13]);
    pf[b + START + 2] = f(nz + world[14]);
    pf[b + START] = f(nx + world[12]);
  }
  pf[b] = pf[b + START];
  pf[b + 1] = pf[b + START + 1];
  pf[b + 2] = pf[b + START + 2];
  if (screenParticle(state)) pf[b + 3] = 1;
  if (screenParticle(state) && w.i[42] !== 0)
    pool.i[b + ANGLE] = screenAlignedAngle(pf[b + OFFSET], pf[b + OFFSET + 1]);
  else if (w.i[42] !== 0 && w.i[40] !== 0)
    pool.i[b + ANGLE] = alignedAngle(
      state,
      world,
      viewOf(node.scene),
      pf,
      b,
      pf[b + OFFSET],
      pf[b + OFFSET + 1],
      pf[b + OFFSET + 2],
    );
  else {
    const slot = screenParticle(state) ? 17 : 18;
    pool.i[b + ANGLE] = intRange(node, w.i[37], w.i[36], state, ordinal + slot);
    pool.i[b + SPIN] = intRange(node, w.i[39], w.i[38], state, ordinal + slot + 1);
  }
  pf[b + OFFSET] = 0;
  pf[b + OFFSET + 1] = 0;
  pf[b + OFFSET + 2] = 0;
  pf[b + OFFSET + 3] = 1;
  pf[b + 35] = 0;
  pool.u[b + SIZE_INDEX] = 0;
  pf[b + AGE] = delta;
  pf[b + COLOR_TIME] = delta;
  pf[b + SIZE_TIME] = 0;
  pf[b + FRAME_TIME] = delta;
  pf[b + CURVE_TIME] = 0;
  pool.u[b + CURVE_INDEX] = 1;
  pool.u[b + FLAGS] = FRESH_COLOR;
  const keys = settings.colorKeys;
  const colorCount = w.u[0];
  const nodeColor = colorOf(node);
  let color: number;
  if (colorCount <= 1) {
    evalColorKey(node, state, p, 0);
    color = pool.u[b + BASE_COLOR];
  } else {
    const last = (colorCount - 1) * COLOR_KEY_WORDS;
    let previous: number;
    if (keys.i[last] === 1) previous = randomColor(node, keys.u[last + 2], keys.u[last + 1]);
    else if (keys.i[last] === 4)
      previous = screenParticle(state)
        ? lerpColor(keys.u[last + 2], keys.u[last + 1], 0.5)
        : oscillatingColor(keys.u[last + 2], keys.u[last + 1], 0x8000);
    else previous = keys.u[last + 1];
    pool.u[b + PREVIOUS_COLOR] = previous;
    evalColorKey(node, state, p, 0);
    color = pool.u[b + BASE_COLOR];
    if (keys.i[3] === 1) {
      const span = keys.f[4];
      if (span > EPSILON)
        color = lerpColor(
          pool.u[b + PREVIOUS_COLOR],
          pool.u[b + BASE_COLOR],
          f(pf[b + COLOR_TIME] / span),
        );
    }
  }
  pool.u[b + COLOR] = blendColor(nodeColor, color, w.i[43]);
  const sizes = settings.sizeKeys;
  const sizeCount = w.u[2];
  let done = false;
  if (sizeCount > 1) {
    pf[b + SIZE_TIME] = sizes.f[(sizeCount - 1) * SIZE_KEY_WORDS + 5];
    evalSizeKey(state, p, sizeCount - 1);
    pool.u[b + SIZE_X_PREVIOUS] = pool.u[b + SIZE_X_NOW];
    pool.u[b + SIZE_Y_PREVIOUS] = pool.u[b + SIZE_Y_NOW];
    pf[b + SIZE_TIME] = 0;
    evalSizeKey(state, p, 0);
    const span = sizes.f[5];
    if (span > EPSILON) {
      const t = f(pf[b + COLOR_TIME] / span);
      pf[b + SIZE_X] = f(lerp(pf[b + SIZE_X_PREVIOUS], pf[b + SIZE_X_NOW], t) * pf[b + SCALE_X]);
      pf[b + SIZE_Y] = f(lerp(pf[b + SIZE_Y_PREVIOUS], pf[b + SIZE_Y_NOW], t) * pf[b + SCALE_Y]);
      done = true;
    }
  } else {
    evalSizeKey(state, p, 0);
  }
  if (!done) {
    pf[b + SIZE_X] = f(pf[b + SIZE_X_NOW] * pf[b + SCALE_X]);
    pf[b + SIZE_Y] = f(pf[b + SIZE_Y_NOW] * pf[b + SCALE_Y]);
  }
  pf[b + SIZE_TIME] = delta;
  if (state.frameCount > 1 && (w.i[49] === 1 || w.i[49] === 10)) {
    pool.i[b + FRAME_INDEX] = intBelow(node, state.frameCount);
    setFrameRect(state, p);
  } else {
    pool.i[b + FRAME_INDEX] = 0;
    pf[b + UV_U0] = 0;
    pf[b + UV_V0] = 0;
    pf[b + UV_U1] = f(state.frameStepU + pf[b + UV_U0]);
    pf[b + UV_V1] = f(state.frameStepV + pf[b + UV_V0]);
  }
  pool.i[b + PREVIOUS] = -1;
  pool.i[b + NEXT] = state.liveHead;
  if (state.liveHead >= 0) pool.i[state.liveHead * PARTICLE_WORDS + PREVIOUS] = p;
  state.liveHead = p;
  state.spawned++;
  if (w.i[28] === 1 && state.spawned >= Math.trunc(w.f[29])) state.emitState = 0;
  else if (!settings.screenSpace) {
    const m = node.world;
    for (let trail = 0; trail < w.u[54]; trail++) {
      const at = (p * w.u[54] + trail) * 4;
      const x = node.scene.random.floatRange(w.f[59], w.f[55]);
      const y = node.scene.random.floatRange(w.f[60], w.f[56]);
      const z = node.scene.random.floatRange(w.f[61], w.f[57]);
      state.trails[at] = w.i[17] === 2 ? f(f(f(x * m[0]) + f(y * m[4])) + f(z * m[8])) : x;
      state.trails[at + 1] = w.i[17] === 2 ? f(f(f(x * m[1]) + f(y * m[5])) + f(z * m[9])) : y;
      state.trails[at + 2] = w.i[17] === 2 ? f(f(f(x * m[2]) + f(y * m[6])) + f(z * m[10])) : z;
    }
  }
  return state.emitState !== 0;
}

function canEmit(node: StageNode, state: StarParticleState): boolean {
  const w = state.settings.w;
  if (
    state.freeHead < 0 ||
    !(state.emitWait < state.sinceEmit) ||
    node.delta < EPSILON ||
    state.emitState === 0
  )
    return false;
  if (w.i[28] === 2 && state.age >= 0 && state.age >= w.f[29]) {
    state.emitState = 0;
    return false;
  }
  return true;
}

function emit(node: StageNode, state: StarParticleState): void {
  const w = state.settings.w;
  state.sinceEmit = f(state.sinceEmit + node.delta);
  const history = state.emitterHistory;
  if (!canEmit(node, state)) {
    if (history) history.set(node.world.subarray(12, 15));
    return;
  }
  let count: number;
  if (history) {
    const x = f(history[0] - node.world[12]);
    const y = f(history[1] - node.world[13]);
    const z = f(history[2] - node.world[14]);
    const distance = f(Math.sqrt(f(f(f(y * y) + f(x * x)) + f(z * z))));
    if (w.f[16] >= EPSILON && distance < w.f[16] && state.emitterSamples !== 0) count = 0;
    else {
      history.copyWithin(3, 0, 6);
      history.set(node.world.subarray(12, 15));
      state.emitterSamples = Math.min(state.emitterSamples + 1, 3);
      if (state.emitterSamples === 1) count = 1;
      else {
        count = w.i[27] < 0 ? w.i[26] : intRange(node, w.i[27], w.i[26], state, 4);
        if (w.f[16] > EPSILON) count = Math.trunc(f(f(count * distance) / w.f[16]));
        const tangent = state.emitterTangent!;
        for (let c = 0; c < 3; c++) tangent[c] = f(history[c + 3] - history[c + 6]);
        normalise(tangent, 0);
        const dx = f(history[0] - history[3]);
        const dy = f(history[1] - history[4]);
        const dz = f(history[2] - history[5]);
        const span = f(Math.sqrt(f(f(f(dy * dy) + f(dx * dx)) + f(dz * dz))));
        const scale = f(w.f[15] * span);
        for (let c = 0; c < 3; c++) tangent[c] = f(tangent[c] * scale);
      }
    }
  } else count = w.i[27] < 0 ? w.i[26] : intRange(node, w.i[27], w.i[26], state, 4);
  const delta = node.delta;
  let spawnCount: number;
  if (delta >= 1) {
    const emissionDelta =
      !state.settings.screenSpace && halfRateEmitter(node) ? f(delta * 0.5) : delta;
    spawnCount = Math.trunc(f(f(count) * emissionDelta));
  } else if (state.fraction < 1) {
    state.fraction = f(state.fraction + delta);
    spawnCount = 0;
  } else {
    const held = state.fraction;
    state.fraction = 0;
    spawnCount = Math.trunc(f(f(count) * held));
  }
  for (let i = 0; i < spawnCount; i++) if (!spawn(node, state, i, spawnCount)) break;
  if (w.f[25] < 0) {
    state.emitWait = w.f[24];
    state.sinceEmit = 0;
    return;
  }
  state.emitWait = floatRange(node, w.f[25], w.f[24], state, 0);
  state.sinceEmit = 0;
}

function step(node: StageNode, state: StarParticleState): void {
  state.drawData = null;
  state.seed = particleSeed(node, state.settings);
  retire(state);
  updateParticles(node, state);
  emit(node, state);
  if (screenParticle(state)) {
    const { pool } = state;
    for (let p = state.liveHead; p >= 0; p = pool.i[p * PARTICLE_WORDS + NEXT]) {
      const b = p * PARTICLE_WORDS;
      pool.u.set(pool.u.subarray(b, b + 4), b + 12);
    }
  }
  state.age = f(state.age + node.delta);
}

/** Simulates CPU particles shared by the quad and point-sprite draw paths. */
export const starParticleNode: NodeBehavior = {
  type: STAR_PARTICLE_TYPE,
  construct(node) {
    try {
      const texture = nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0);
      if (!texture || !nthElement<ColorElement>(node, COLOR_ELEMENT, 0))
        fail("particle node without colour or texture element");
      node.extension = createState(node) satisfies Extension;
    } catch (error) {
      if (!(error instanceof RangeError) || !node.scene.options.skipUnregistered) throw error;
      node.scene.missing.add(`node ${STAR_PARTICLE_TYPE}: ${error.message}`);
      node.extension = { unsupported: error.message } satisfies Extension;
    }
  },
  update(node) {
    const state = starParticleState(node);
    if (!state) {
      computeWorld(node);
      applyMotions(node);
      return;
    }
    try {
      if (!state.warmed) {
        state.warmed = true;
        const delta = node.delta;
        node.delta = 1;
        for (let i = 0; i < state.settings.w.i[23]; i++) {
          computeWorld(node);
          applyMotions(node);
          step(node, state);
        }
        node.delta = delta;
      }
      computeWorld(node);
      applyMotions(node);
      step(node, state);
    } catch (error) {
      if (!(error instanceof RangeError) || !node.scene.options.skipUnregistered) throw error;
      node.scene.missing.add(`node ${STAR_PARTICLE_TYPE}: ${error.message}`);
      node.extension = { unsupported: error.message } satisfies Extension;
    }
  },
};

/** Screen-space counterpart to node 205, with its own authored layout and emitter geometry. */
export const screenParticleNode: NodeBehavior = {
  type: SCREEN_PARTICLE_TYPE,
  construct(node) {
    try {
      if (
        !nthElement<TextureElement>(node, TEXTURE_ELEMENT, 0) ||
        !nthElement<ColorElement>(node, COLOR_ELEMENT, 0)
      )
        fail("particle node without colour or texture element");
      node.extension = createState(node, readScreenParticleSettings(node)) satisfies Extension;
    } catch (error) {
      if (!(error instanceof RangeError) || !node.scene.options.skipUnregistered) throw error;
      node.scene.missing.add(`node ${SCREEN_PARTICLE_TYPE}: ${error.message}`);
      node.extension = { unsupported: error.message } satisfies Extension;
    }
  },
  update(node) {
    const state = starParticleState(node);
    if (!state) {
      computeWorld(node);
      applyMotions(node);
      return;
    }
    try {
      if (!state.warmed) {
        state.warmed = true;
        const delta = node.delta;
        node.delta = 1;
        for (let i = 0; i < state.settings.w.i[23]; i++) {
          computeWorld(node);
          applyMotions(node);
          step(node, state);
        }
        node.delta = delta;
      }
      computeWorld(node);
      applyMotions(node);
      step(node, state);
    } catch (error) {
      if (!(error instanceof RangeError) || !node.scene.options.skipUnregistered) throw error;
      node.scene.missing.add(`node ${SCREEN_PARTICLE_TYPE}: ${error.message}`);
      node.extension = { unsupported: error.message } satisfies Extension;
    }
  },
};

const screenTrig = new Float64Array(2);

/** Screen quads in draw order: centre XYZ, RGBA, four rotated extents and a UV rectangle. */
export function screenParticleInstances(node: StageNode, state: StarParticleState): Float32Array {
  const { pool, settings } = state;
  let count = 0;
  for (let p = state.liveHead; p >= 0; p = pool.i[p * PARTICLE_WORDS + NEXT]) count++;
  const trails = settings.screenTrails?.count ?? 0;
  const instances = new Float32Array(count * (trails + 1) * 15);
  const m = node.world;
  const transformed = settings.w.i[17] !== 2 && settings.w.i[12] !== 6;
  let at = 0;
  for (let p = state.liveHead; p >= 0; p = pool.i[p * PARTICLE_WORDS + NEXT]) {
    const b = p * PARTICLE_WORDS;
    for (let copy = 0; copy <= trails; copy++) {
      const offset = (p * trails + copy - 1) * 4;
      const x = copy === 0 ? pool.f[b] : f(state.trails[offset] + pool.f[b]);
      const y = copy === 0 ? pool.f[b + 1] : f(state.trails[offset + 1] + pool.f[b + 1]);
      const z = pool.f[b + 2];
      const px = transformed ? f(f(f(f(m[4] * y) + f(m[0] * x)) + f(m[8] * z)) + m[12]) : x;
      const py = transformed ? f(f(f(f(m[5] * y) + f(m[1] * x)) + f(m[9] * z)) + m[13]) : y;
      const pz = transformed ? f(f(f(f(m[6] * y) + f(m[2] * x)) + f(m[10] * z)) + m[14]) : z;
      const halfX = f(pool.f[b + SIZE_X] * 0.5);
      const halfY = f(pool.f[b + SIZE_Y] * 0.5);
      let a = halfX;
      let bb = halfX;
      let c = halfY;
      let d = halfY;
      if (pool.i[b + ANGLE] !== 0) {
        sinAngleCode(pool.i[b + ANGLE], screenTrig);
        const sin = screenTrig[0];
        const cos = screenTrig[1];
        a = f(f(cos * halfX) + f(sin * halfY));
        bb = f(f(cos * halfX) - f(sin * halfY));
        c = f(f(sin * halfX) + f(cos * halfY));
        d = f(f(cos * halfY) - f(sin * halfX));
      }
      const color = pool.u[b + COLOR];
      const u0 = pool.f[b + UV_U0];
      const v0 = pool.f[b + UV_V0];
      const u1 = pool.f[b + UV_U1];
      const v1 = pool.f[b + UV_V1];
      instances[at] = px;
      instances[at + 1] = py;
      instances[at + 2] = pz;
      for (let channel = 0; channel < 4; channel++)
        instances[at + 3 + channel] = f(((color >>> (channel * 8)) & 255) * f(1 / 255));
      instances[at + 7] = a;
      instances[at + 8] = bb;
      instances[at + 9] = c;
      instances[at + 10] = d;
      instances[at + 11] = u0;
      instances[at + 12] = v0;
      instances[at + 13] = u1;
      instances[at + 14] = v1;
      at += 15;
    }
  }
  return instances;
}

/** The simulation state of a node whose class could be built, or null. */
export function starParticleState(node: StageNode): StarParticleState | null {
  const extension = node.extension as Extension | undefined;
  return extension && "pool" in extension ? extension : null;
}

function prepareStarParticleDrawOrder(
  state: StarParticleState,
  placement: ArrayLike<number>,
): void {
  const { pool, settings } = state;
  if (settings.w.i[41] === 0 || settings.w.i[40] === 0) return;
  const live: number[] = [];
  for (let p = state.liveHead; p >= 0; p = pool.i[p * PARTICLE_WORDS + NEXT]) {
    const b = p * PARTICLE_WORDS;
    for (let axis = 0; axis < 3; axis++)
      pool.f[b + 12 + axis] = f(
        f(
          f(f(pool.f[b] * placement[axis]) + f(pool.f[b + 1] * placement[4 + axis])) +
            f(pool.f[b + 2] * placement[8 + axis]),
        ) + placement[12 + axis],
      );
    live.push(p);
  }
  live.sort((a, b) => pool.f[a * PARTICLE_WORDS + 14] - pool.f[b * PARTICLE_WORDS + 14]);
  state.liveHead = live[0] ?? -1;
  for (let i = 0; i < live.length; i++) {
    const b = live[i] * PARTICLE_WORDS;
    pool.i[b + PREVIOUS] = i === 0 ? -1 : live[i - 1];
    pool.i[b + NEXT] = i + 1 === live.length ? -1 : live[i + 1];
  }
}

/** Retains the five-word point or eleven-word quad payload until the next simulation update. */
export function starParticleDrawData(
  state: StarParticleState,
  placement: ArrayLike<number>,
): Float32Array {
  if (state.drawData) return state.drawData;
  prepareStarParticleDrawOrder(state, placement);
  const { pool } = state;
  let count = 0;
  for (let p = state.liveHead; p >= 0; p = pool.i[p * PARTICLE_WORDS + NEXT]) count++;
  const trails = state.settings.w.u[54];
  const point = state.settings.w.i[19] === 7;
  const stride = point ? 5 : 11;
  const data = new Float32Array(count * (trails + 1) * stride);
  const words = new Uint32Array(data.buffer);
  let at = 0;
  for (let p = state.liveHead; p >= 0; p = pool.i[p * PARTICLE_WORDS + NEXT]) {
    const b = p * PARTICLE_WORDS;
    for (let copy = 0; copy <= trails; copy++) {
      for (let axis = 0; axis < 3; axis++)
        data[at + axis] =
          copy === 0
            ? pool.f[b + axis]
            : f(pool.f[b + axis] + state.trails[(p * trails + copy - 1) * 4 + axis]);
      words[at + 3] = pool.u[b + COLOR];
      if (point) {
        data[at + 4] = trails > 0 && copy === 0 ? 1 : pool.f[b + SIZE_X];
        at += stride;
        continue;
      }
      data[at + 4] = f(pool.f[b + SIZE_X] + pool.f[b + SIZE_X]);
      data[at + 5] = f(pool.f[b + SIZE_Y] + pool.f[b + SIZE_Y]);
      words.set(pool.u.subarray(b + UV_U0, b + ANGLE + 1), at + 6);
      at += 11;
    }
  }
  state.drawData = data;
  return data;
}

/** Whether the draw pass submits the node: it has been updated and no blocking flag is set. */
export function starParticleDrawable(node: StageNode): boolean {
  return stageNodeDrawable(node);
}

/** The node's colour as the packed word its colour element holds. */
export function starParticleColor(node: StageNode): number {
  return colorOf(node);
}
