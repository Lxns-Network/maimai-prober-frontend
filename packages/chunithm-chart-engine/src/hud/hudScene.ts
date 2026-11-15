import { packSlice, type Pack } from "../assets/packFormat";
import { decodeHudFont, type HudFontMeta } from "./hudFont";
import {
  layoutHudTagLine,
  layoutHudTextLine,
  type HudFont,
  type HudTextGlyph,
  type HudTextProfile,
} from "./textLayout";
import {
  createHudDigitRun,
  layoutHudDigits,
  resolveHudGauge,
  type HudNumberProfile,
} from "./values";

export const HUD_SCENE_ENTRY = "hud/scene";

export interface HudSampling {
  minFilter: "nearest" | "linear";
  magFilter: "nearest" | "linear";
  wrapS: "repeat" | "clamp";
  wrapT: "repeat" | "clamp";
}

/** A texture the interface samples: a published image, the chart's jacket or bytes in the scene. */
export interface HudTexture {
  id: string;
  width: number;
  height: number;
  source:
    | { kind: "file"; url: string }
    | { kind: "jacket" }
    | { kind: "encoded"; offset: number; length: number }
    | { kind: "packed"; offset: number; length: number };
  /** Stored as grey level and alpha, sampled as (grey, grey, grey, alpha). */
  channels?: "luminance-alpha";
}

export interface HudMaterial {
  /** Texture index, or -1 for an untextured draw. */
  texture: number;
  sampling: HudSampling | null;
  /** 0 blends a premultiplied fragment over; 3 and 4 blend a straight fragment, 4 additively. */
  blend: 0 | 3 | 4;
  secondary: { texture: number; blendMode: 9 | 10 | 11 | 12; sampling: HudSampling | null } | null;
}

export type HudChoiceKey = "difficulty" | "mirror" | "speed" | "level" | "jacket" | "stock";
export type HudCountValue = "justiceCritical" | "justice" | "attack" | "miss";
export type HudNumberValue = "score" | "combo" | HudCountValue;

/** Four vertex colors of a quad, or six of a glyph's two triangles, as RGBA bytes. */
interface HudVertexColors {
  multiply: number[][];
  add: number[][];
}

/** The cast leading the gauge fill, which the fill animation moves and stretches along x. */
export interface HudGaugeHead {
  first: number;
  /** Matrix of the head's parent, three rows of four. */
  parent: number[];
  /** Local corners in TL, BL, TR, BR order, xyz each. */
  vertices: number[];
  /** Position and scale along y, which the animation leaves alone. */
  y: number;
  scaleY: number;
  /** Keyframes of the x position and x scale: time, value, and 1 to interpolate to the next. */
  x: [time: number, value: number, interpolation: number][];
  scaleX: [time: number, value: number, interpolation: number][];
}

export type HudSlot =
  | { type: "fixed"; first: number; count: number }
  | { type: "choice"; key: HudChoiceKey; variants: Record<string, [first: number, count: number]> }
  | {
      type: "zero";
      /** Primitives drawn only while this count is zero. */
      value: HudCountValue;
      first: number;
      count: number;
    }
  | {
      type: "clear";
      /** Primitives drawn only while the gauge reads as cleared. */
      first: number;
      count: number;
    }
  | {
      type: "gauge";
      /** The fill primitive, whose secondary UVs follow the gauge. */
      first: number;
      /** Corner UVs of the fill while the gauge is not cleared; absent when they never change. */
      unclearedUvs?: number[];
      /** Keyframes of the fill animation: time, reference, and 1 to interpolate to the next. */
      keys: [time: number, reference: number, interpolation: number][];
      /** Normalized left, top, right and bottom of each secondary reference. */
      rectangles: number[][];
      /** Rectangle component behind each of the four corner UV pairs. */
      corners: number[];
      /** The cast drawn right after the fill, which the fill animation moves and stretches along x. */
      head?: HudGaugeHead;
    }
  | ({
      type: "number";
      value: HudNumberValue | "level";
      profile: HudNumberProfile;
      /** Cast matrix, three rows of four. */
      matrix: number[];
      yDown: boolean;
      /** Material and corner UVs of each glyph reference. */
      references: { material: number; uvs: number[] }[];
      /** Level modes the cast is shown in; absent when it always is. */
      levels?: string[];
    } & HudVertexColors)
  | ({
      type: "text";
      value: "title" | "artist" | "worldsEndTag";
      registered: boolean;
      /** Level modes the cast is shown in; absent when it always is. */
      levels?: string[];
      /** Width of a monospaced glyph cell; set for a cast laid out as one wrapping, aligned line. */
      cell?: number;
      font: number;
      profile: HudTextProfile;
      matrix: number[];
      /** Material of each font page. */
      materials: number[];
      /** Colors of a line the registered layout could not hold. */
      fallback: HudVertexColors;
    } & HudVertexColors);

export interface HudSceneMeta {
  /** Interface space the casts are laid out in, mapped onto the whole target. */
  view: { width: number; height: number };
  textures: HudTexture[];
  materials: HudMaterial[];
  fonts: HudFontMeta[];
  primitives: { count: number; offset: number };
  gaugeLimit: number;
  slots: HudSlot[];
  /** What the interface could not draw, for the charts that make any of the `choice:value` picks. */
  missing?: { reason: string; choices: string[] }[];
}

/** Floats and bytes per drawn primitive, expanded to two triangles. */
export const HUD_VERTICES = 6;

export interface HudScene {
  meta: HudSceneMeta;
  positions: Float32Array;
  uvs: Float32Array;
  secondaryUvs: Float32Array;
  multiply: Uint8Array;
  add: Uint8Array;
  materials: Uint16Array;
  fonts: HudFont[];
  /** Most primitives one frame can draw. */
  capacity: number;
  /** The scene entry, holding the pixels of packed textures. */
  bytes: Uint8Array;
}

/**
 * Primitive columns from `meta.primitives.offset`: positions (18 f32), UVs and secondary UVs (12 f32
 * each), multiply and add colors (24 u8 each), then the material as u16, each column for every
 * primitive before the next.
 */
export function primitiveColumns(count: number) {
  const positions = 0;
  const uvs = positions + count * 18 * 4;
  const secondaryUvs = uvs + count * 12 * 4;
  const multiply = secondaryUvs + count * 12 * 4;
  const add = multiply + count * 24;
  const materials = add + count * 24;
  return { positions, uvs, secondaryUvs, multiply, add, materials, end: materials + count * 2 };
}

const NUMBER_GLYPHS = 17;
const TEXT_GLYPHS = 2048;

export function readHudScene(pack: Pack): HudScene {
  const entry = pack.entries.get(HUD_SCENE_ENTRY);
  if (!entry || entry.kind !== "hud") throw new RangeError("The pack holds no interface scene");
  const meta = entry.meta as unknown as HudSceneMeta;
  const bytes = packSlice(pack, HUD_SCENE_ENTRY);
  const { count, offset } = meta.primitives;
  const at = primitiveColumns(count);
  const slice = (from: number, to: number) => bytes.slice(offset + from, offset + to).buffer;
  let capacity = 0;
  for (const slot of meta.slots)
    if (slot.type === "fixed") capacity += slot.count;
    else if (slot.type === "choice")
      capacity += Math.max(...Object.values(slot.variants).map(([, n]) => n));
    else if (slot.type === "gauge") capacity += slot.head ? 2 : 1;
    else if (slot.type === "zero" || slot.type === "clear") capacity += slot.count;
    else if (slot.type === "number") capacity += NUMBER_GLYPHS;
    else capacity += TEXT_GLYPHS;
  return {
    meta,
    positions: new Float32Array(slice(at.positions, at.uvs)),
    uvs: new Float32Array(slice(at.uvs, at.secondaryUvs)),
    secondaryUvs: new Float32Array(slice(at.secondaryUvs, at.multiply)),
    multiply: new Uint8Array(slice(at.multiply, at.add)),
    add: new Uint8Array(slice(at.add, at.materials)),
    materials: new Uint16Array(slice(at.materials, at.end)),
    fonts: meta.fonts.map((font) => decodeHudFont(font, bytes)),
    capacity,
    bytes,
  };
}

/** What the interface shows about the chart being played, fixed for the chart's lifetime. */
export interface HudChart {
  title: string;
  artist: string;
  difficulty: string;
  rawLevel: number;
  levelDecimal: number;
  exType: number;
  /** The star frame of a WORLD'S END song's level box. */
  starDifType?: number;
  /** The tag a WORLD'S END song's level box shows. */
  worldsEndTag?: string;
  jacket: boolean;
  speedRow: number;
  mirror?: boolean;
}

export interface HudValues {
  score: number;
  combo: number;
  gauge: number;
  /** Justice critical, justice, attack and miss counts. */
  counts: readonly number[];
}

/** Vertex streams of one interface frame, in draw order. */
export interface HudGeometry {
  count: number;
  positions: Float32Array;
  uvs: Float32Array;
  secondaryUvs: Float32Array;
  multiply: Uint8Array;
  add: Uint8Array;
  materials: Uint16Array;
}

export function createHudGeometry(scene: HudScene): HudGeometry {
  const n = scene.capacity;
  return {
    count: 0,
    positions: new Float32Array(n * 18),
    uvs: new Float32Array(n * 12),
    secondaryUvs: new Float32Array(n * 12),
    multiply: new Uint8Array(n * 24),
    add: new Uint8Array(n * 24),
    materials: new Uint16Array(n),
  };
}

/** Choices and laid-out text the chart fixes, resolved once per chart. */
export interface HudChartState {
  choices: Record<HudChoiceKey, string>;
  level: number;
  texts: Map<HudSlot, { glyphs: HudTextGlyph[]; registered: boolean }>;
  /** What the interface cannot draw for this chart. */
  missing: string[];
}

function levelChoice(scene: HudScene, chart: HudChart): { mode: string; integer: number } {
  if (chart.exType === 2) {
    const star = `worlds-end:${chart.starDifType}`;
    const known = scene.meta.slots.some(
      (slot) => slot.type === "choice" && slot.key === "level" && star in slot.variants,
    );
    return { mode: known ? star : "worlds-end", integer: -1 };
  }
  const encoded = (Math.imul(chart.rawLevel, 100) + (chart.levelDecimal % 100)) | 0;
  return {
    mode: (encoded >>> 0) % 100 >= 50 ? "plus" : "normal",
    integer: Math.trunc(encoded / 100) || 0,
  };
}

export function prepareHudChart(scene: HudScene, chart: HudChart): HudChartState {
  const level = levelChoice(scene, chart);
  const choices: Record<HudChoiceKey, string> = {
    difficulty: chart.difficulty.toUpperCase(),
    mirror: chart.mirror === undefined ? "none" : String(chart.mirror),
    speed: String(chart.speedRow),
    level: level.mode,
    jacket: chart.jacket ? "jacket" : "none",
    stock: "0",
  };
  const texts = new Map<HudSlot, { glyphs: HudTextGlyph[]; registered: boolean }>();
  const picked = new Set(Object.entries(choices).map(([key, value]) => `${key}:${value}`));
  const missing = (scene.meta.missing ?? [])
    .filter((item) => item.choices.some((choice) => picked.has(choice)))
    .map((item) => item.reason);
  for (const slot of scene.meta.slots) {
    if (slot.type === "choice" && slot.key !== "stock" && !(choices[slot.key] in slot.variants))
      throw new RangeError(`The interface has no ${slot.key} ${choices[slot.key]}`);
    if (slot.type !== "text") continue;
    if (slot.levels && !slot.levels.includes(choices.level)) continue;
    const text = chart[slot.value];
    if (text === undefined) {
      missing.push(`WORLD'S END tag: the chart names no tag`);
      continue;
    }
    const font = scene.fonts[slot.font];
    const layout =
      slot.cell === undefined
        ? layoutHudTextLine(slot.profile, font, text, slot.registered)
        : layoutHudTagLine(slot.profile, font, text, slot.cell);
    if (layout.status !== "ready")
      missing.push(
        `${slot.value === "worldsEndTag" ? "WORLD'S END tag" : slot.value}: ${layout.reason}`,
      );
    texts.set(slot, layout.status === "ready" ? layout : { glyphs: [], registered: false });
  }
  return { choices, level: level.integer, texts, missing };
}

/** Applies a cast matrix to xyz vertices, rounding every product and sum to float32. */
function transform(
  matrix: ArrayLike<number>,
  local: ArrayLike<number>,
  out: Float32Array,
  at: number,
) {
  const f = Math.fround;
  for (let v = 0; v < local.length; v += 3) {
    const x = f(local[v]);
    const y = f(local[v + 1]);
    const z = f(local[v + 2]);
    for (let row = 0; row < 3; row++) {
      const m = row * 4;
      out[at + v + row] = f(
        f(f(f(y * f(matrix[m + 1])) + f(x * f(matrix[m]))) + f(z * f(matrix[m + 2]))) +
          f(matrix[m + 3]),
      );
    }
  }
}

/** Corner order of a quad's two triangles. */
const QUAD = [0, 1, 2, 2, 1, 3];

/** Evaluates keyframes of time, value, and 1 to interpolate to the next at an animation frame. */
function keyValue(keys: readonly (readonly [number, number, number])[], time: number): number {
  const f = Math.fround;
  const frame = f(time);
  if (frame <= f(keys[0][0])) return f(keys[0][1]);
  if (frame >= f(keys[keys.length - 1][0])) return f(keys[keys.length - 1][1]);
  let next = 1;
  while (f(keys[next][0]) <= frame) next++;
  const [previousTime, previous, interpolation] = keys[next - 1];
  if (interpolation === 0) return f(previous);
  const amount = f(f(frame - f(previousTime)) / f(keys[next][0] - previousTime));
  return f(f(f(previous) * f(1 - amount)) + f(f(keys[next][1]) * amount));
}

const headMatrix = new Float32Array(12);
const headLocal = new Float32Array(12);

/** Composes the head's matrix at an animation frame into `headMatrix`. */
function placeHead(head: HudGaugeHead, time: number): void {
  const f = Math.fround;
  headLocal.set([keyValue(head.scaleX, time), 0, 0, keyValue(head.x, time)]);
  headLocal.set([0, f(head.scaleY), 0, f(head.y), 0, 0, 1, 0], 4);
  const p = head.parent;
  for (let index = 0; index < 12; index++) {
    const row = index - (index % 4);
    const column = index % 4;
    headMatrix[index] = f(
      f(f(f(p[row + 3]) * (column === 3 ? 1 : 0)) + f(f(p[row + 2]) * headLocal[8 + column])) +
        f(f(f(p[row + 1]) * headLocal[4 + column]) + f(f(p[row]) * headLocal[column])),
    );
  }
}

const digitRun = createHudDigitRun();
const rectangle = new Float32Array(4);

/** Evaluates the fill animation's secondary rectangle at an animation frame into `rectangle`. */
function fillRectangle(slot: Extract<HudSlot, { type: "gauge" }>, time: number): void {
  const f = Math.fround;
  const frame = f(time);
  const keys = slot.keys;
  const set = (reference: number) => rectangle.set(slot.rectangles[reference]);
  if (frame <= f(keys[0][0])) return set(keys[0][1]);
  if (frame >= f(keys[keys.length - 1][0])) return set(keys[keys.length - 1][1]);
  let next = 1;
  while (f(keys[next][0]) <= frame) next++;
  const [previousTime, previousReference, interpolation] = keys[next - 1];
  if (interpolation === 0) return set(previousReference);
  const start = slot.rectangles[previousReference];
  const end = slot.rectangles[keys[next][1]];
  const amount = f(f(frame - f(previousTime)) / f(keys[next][0] - previousTime));
  const complement = f(1 - amount);
  for (let i = 0; i < 4; i++) rectangle[i] = f(f(start[i] * complement) + f(end[i] * amount));
}
const quad = new Float32Array(12);
const expanded = new Float32Array(18);

/**
 * Writes every primitive of one frame into `out`, in draw order. Glyph counts follow `values`;
 * everything else follows the prepared chart.
 */
export function assembleHud(
  scene: HudScene,
  chart: HudChartState,
  values: HudValues,
  out: HudGeometry,
): void {
  let n = 0;
  const copy = (first: number, count: number) => {
    out.positions.set(scene.positions.subarray(first * 18, (first + count) * 18), n * 18);
    out.uvs.set(scene.uvs.subarray(first * 12, (first + count) * 12), n * 12);
    out.secondaryUvs.set(scene.secondaryUvs.subarray(first * 12, (first + count) * 12), n * 12);
    out.multiply.set(scene.multiply.subarray(first * 24, (first + count) * 24), n * 24);
    out.add.set(scene.add.subarray(first * 24, (first + count) * 24), n * 24);
    out.materials.set(scene.materials.subarray(first, first + count), n);
    n += count;
  };
  const colors = (slot: HudVertexColors, corners: readonly number[] | null) => {
    for (let v = 0; v < HUD_VERTICES; v++) {
      const corner = corners ? corners[v] : v;
      for (let c = 0; c < 4; c++) {
        out.multiply[n * 24 + v * 4 + c] = slot.multiply[corner][c];
        out.add[n * 24 + v * 4 + c] = slot.add[corner][c];
      }
    }
  };
  const gauge = resolveHudGauge({ value: values.gauge, limit: scene.meta.gaugeLimit });
  const stock = String(gauge.stockCount);
  for (const slot of scene.meta.slots) {
    if (slot.type === "fixed") copy(slot.first, slot.count);
    else if (slot.type === "zero") {
      if (numberValue(slot.value, chart, values) === 0) copy(slot.first, slot.count);
    } else if (slot.type === "clear") {
      if (gauge.clear) copy(slot.first, slot.count);
    } else if (slot.type === "gauge") {
      copy(slot.first, 1);
      if (!gauge.clear && slot.unclearedUvs)
        for (let v = 0; v < HUD_VERTICES; v++) {
          out.uvs[(n - 1) * 12 + v * 2] = slot.unclearedUvs[QUAD[v] * 2];
          out.uvs[(n - 1) * 12 + v * 2 + 1] = slot.unclearedUvs[QUAD[v] * 2 + 1];
        }
      fillRectangle(slot, gauge.animationFrame);
      for (let v = 0; v < HUD_VERTICES; v++) {
        out.secondaryUvs[(n - 1) * 12 + v * 2] = rectangle[slot.corners[QUAD[v] * 2]];
        out.secondaryUvs[(n - 1) * 12 + v * 2 + 1] = rectangle[slot.corners[QUAD[v] * 2 + 1]];
      }
      if (slot.head) {
        copy(slot.head.first, 1);
        placeHead(slot.head, gauge.animationFrame);
        for (let v = 0; v < HUD_VERTICES; v++)
          for (let k = 0; k < 3; k++) expanded[v * 3 + k] = slot.head.vertices[QUAD[v] * 3 + k];
        transform(headMatrix, expanded, out.positions, (n - 1) * 18);
      }
    } else if (slot.type === "choice") {
      const variant = slot.variants[slot.key === "stock" ? stock : chart.choices[slot.key]];
      if (!variant) throw new RangeError(`The interface has no ${slot.key} variant`);
      copy(variant[0], variant[1]);
    } else if (slot.type === "number") {
      if (slot.levels && !slot.levels.includes(chart.choices.level)) continue;
      layoutHudDigits(slot.profile, numberValue(slot.value, chart, values), digitRun);
      for (let g = 0; g < digitRun.count; g++) {
        for (let k = 0; k < 12; k++)
          quad[k] =
            k % 3 === 1 && slot.yDown
              ? -digitRun.vertices[g * 12 + k]
              : digitRun.vertices[g * 12 + k];
        for (let v = 0; v < HUD_VERTICES; v++)
          for (let k = 0; k < 3; k++) expanded[v * 3 + k] = quad[QUAD[v] * 3 + k];
        transform(slot.matrix, expanded, out.positions, n * 18);
        const reference = slot.references[digitRun.references[g]];
        for (let v = 0; v < HUD_VERTICES; v++) {
          out.uvs[n * 12 + v * 2] = reference.uvs[QUAD[v] * 2];
          out.uvs[n * 12 + v * 2 + 1] = reference.uvs[QUAD[v] * 2 + 1];
        }
        out.secondaryUvs.fill(0, n * 12, n * 12 + 12);
        colors(slot, QUAD);
        out.materials[n] = reference.material;
        n++;
      }
    } else {
      if (slot.levels && !slot.levels.includes(chart.choices.level)) continue;
      const text = chart.texts.get(slot);
      if (!text) continue;
      for (const glyph of text.glyphs) {
        transform(slot.matrix, glyph.vertices, out.positions, n * 18);
        out.uvs.set(glyph.uvs, n * 12);
        out.secondaryUvs.fill(0, n * 12, n * 12 + 12);
        colors(text.registered ? slot : slot.fallback, null);
        out.materials[n] = slot.materials[glyph.page];
        n++;
      }
    }
  }
  out.count = n;
}

function numberValue(value: HudNumberValue | "level", chart: HudChartState, values: HudValues) {
  switch (value) {
    case "level":
      return chart.level;
    case "score":
      return values.score;
    case "combo":
      return values.combo;
    case "justiceCritical":
      return values.counts[0];
    case "justice":
      return values.counts[1];
    case "attack":
      return values.counts[2];
    case "miss":
      return values.counts[3];
  }
}
