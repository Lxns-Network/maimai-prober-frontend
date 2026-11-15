import type { EffectNode } from "../afb";
import type { EffectProgram, NodeProgram } from "./program";
import {
  BLEND_ROWS,
  MATERIAL_CONTEXT_BYTES,
  SAMPLER_CONSTRUCTOR,
  SIMPLE_FLAGS_CONSTRUCTOR,
} from "./tables";

const f = Math.fround;

/** A texture reference an element can select: which resource texture, and the element's sampler words. */
export interface TextureBinding {
  readonly elementOffset: number;
  readonly referenceOrdinal: number;
  readonly resourceIndex: number;
  readonly referenceValue: number;
  /** The element's thirteen parameter words. */
  readonly parameterWords: readonly number[];
  readonly sampler: {
    readonly wrapU: number;
    readonly wrapV: number;
    readonly minFilter: number;
    readonly magFilter: number;
    readonly mipFilter: number;
    readonly anisoNumber: number;
    readonly lodBiasBits: number;
  };
}

/** The shader and state selections of a simple primitive's material, from its context. */
export interface SimpleMaterial {
  readonly context: Uint8Array;
  readonly sourceFlags: number;
  readonly featureWord96: number;
  readonly featureWord100: number;
  readonly materialKey: readonly [number, number];
  readonly environmentIndex: number;
  readonly fixedParam0: readonly [number, number, number, number];
  readonly slopeBias: number;
  readonly slopeBiasBits: number;
  readonly blendRow: readonly number[];
  readonly colorWrite: number;
}

/** Static draw description of a primitive or geometry node. */
export interface PrimitiveDraw {
  readonly node: NodeProgram;
  /** 4 for one texture coordinate set, 5 for two, or 10 for a normal and one set. */
  readonly layout: 4 | 5 | 10;
  readonly strip: boolean;
  readonly vertexCount: number;
  readonly elementOffsets: readonly number[];
  /** Per element, the bindings its texture references offer, by reference ordinal. */
  readonly slots: readonly (readonly TextureBinding[])[];
  readonly animatedTextureOffsets: boolean;
  readonly material: SimpleMaterial;
  readonly layer: number;
  readonly priority: number;
  readonly orderKey: number;
  readonly sortDistanceOffset: number;
}

/** What a particle draw needs from its node to be published and drawn. */
export interface ParticleDrawState {
  readonly binding: TextureBinding;
  readonly sourceFlags: number;
  readonly featureWord144: number;
  readonly softEdgeDistance?: number;
  readonly rgbScale?: number;
  readonly refractionMode?: 1 | 2;
  readonly refractionParameter?: number;
}

/** Static draw description of a particle node. */
export interface ParticleDraw extends ParticleDrawState {
  readonly node: NodeProgram;
  readonly blendRow: readonly number[];
  readonly layer: number;
  readonly priority: number;
  readonly orderKey: number;
}

/** The draw programs of one resource's nodes, and the order a player's layer gives them. */
export interface EffectDrawPrograms {
  primitive(node: NodeProgram): PrimitiveDraw;
  particle(node: NodeProgram): ParticleDraw;
  /** The layer, priority and order key of a node when its player publishes `layerParameter`. */
  order(
    node: NodeProgram,
    layerParameter: number | null,
    out: { layer: number; priority: number; key: number },
  ): void;
  /** Texture bindings of a node, in element then reference order. */
  bindings(node: NodeProgram): readonly TextureBinding[];
}

export const orderKey = (layer: number, priority: number) =>
  (layer !== 0 ? 0x8000 : 0) | ((layer & 0x7f) << 8) | ((priority + 128) & 255);

/** The sampler a texture element's thirteen parameter words select. */
export function elementSampler(words: readonly number[]): TextureBinding["sampler"] {
  return {
    ...SAMPLER_CONSTRUCTOR,
    wrapU: words[0] !== 0 ? 2 : 0,
    wrapV: words[1] !== 0 ? 2 : 0,
    minFilter: words[3] !== 0 ? 1 : 0,
    magFilter: words[5] !== 0 ? 1 : 0,
  };
}

/**
 * The source flags of a simple or particle draw: its blend mode, the depth and draw-order bits its
 * node flags select, and the blend selections of its second and third texture elements (null when
 * an element is absent or has no parameters).
 */
export function drawSourceFlags(
  blendMode: number,
  nodeFlags: number,
  textureBlends: readonly (number | null)[],
): number {
  let flags = SIMPLE_FLAGS_CONSTRUCTOR & ~0x800000;
  flags = (flags & ~0x3f) | Math.min(Math.max(blendMode, 0), 7);
  flags = (flags & ~0x40000) | ((nodeFlags & 0x20) === 0 ? 0x40000 : 0);
  flags = (flags & ~0x20000) | ((nodeFlags & 0x10) === 0 ? 0x20000 : 0);
  if (nodeFlags & 4) flags = (flags & ~0x1e000) | 0xe000;
  else if (nodeFlags & 0x80) flags = (flags & ~0x1e000) | 0x10000;
  if ((nodeFlags & 0x84) === 0x84) flags &= ~0x1e000;
  for (const [ordinal, shift, mask] of [
    [1, 6, 0x3c0],
    [2, 10, 0x1c00],
  ]) {
    const value = textureBlends[ordinal];
    if (value !== undefined && value !== null) flags = (flags & ~mask) | ((value << shift) & mask);
  }
  return flags >>> 0;
}

/** The particle draw's fog gate and two bits of its blend row. */
export function particleFeatureWord(drawCoordinateMode: number, row: readonly number[]): number {
  return (drawCoordinateMode === 2 ? 0 : 0x4000) | ((row[0] << 5) & 0x20) | ((row[16] << 6) & 0x40);
}

function initialMaterialContext(
  flags: number,
  priority: number,
  drawCoordinateMode: number,
): { bytes: Uint8Array; data: DataView } {
  const bytes = new Uint8Array(MATERIAL_CONTEXT_BYTES);
  const data = new DataView(bytes.buffer);
  const baseRow = BLEND_ROWS[Math.min(flags & 63, 61)];
  data.setUint32(0, flags, true);
  data.setFloat32(20, f(-priority | 0), true);
  data.setFloat32(36, 1, true);
  data.setUint32(88, (0xff & ~8) | (baseRow[0] === 0 ? 8 : 0), true);
  data.setUint32(
    96,
    (drawCoordinateMode === 2 ? 0 : 0x4000) |
      ((baseRow[0] << 5) & 0x20) |
      ((baseRow[16] << 6) & 0x40),
    true,
  );
  data.setUint32(104, 0xff, true);
  return { bytes, data };
}

function finishMaterial(
  bytes: Uint8Array,
  data: DataView,
  layout: number,
  textureCount: number,
): SimpleMaterial {
  const finalFlags = data.getUint32(0, true);
  const features = data.getUint32(96, true);
  const row = BLEND_ROWS[Math.min(finalFlags & 63, 61)];
  let key = ((features >>> 4) & 8) | (data.getUint32(44, true) & 7);
  key |=
    ((finalFlags >>> 12) & 0x20) |
    ((16 * ((row[0] & 1) | ((finalFlags & 0x3ff) << 16))) & 0xfff0603f);
  key |=
    ((features >>> 7) & 0x80) |
    (8 * ((features & 8) | (32 * ((data.getUint32(40, true) & 31) | ((layout & 31) << 7)))));
  for (let unit = 0; unit < 3; unit++)
    if (unit < textureCount) key ^= (key ^ ((key & 0xe000) + 0x2000)) & 0x6000;
  key >>>= 0;
  return {
    context: bytes,
    sourceFlags: finalFlags,
    featureWord96: features,
    featureWord100: data.getUint32(100, true),
    materialKey: [key, (finalFlags >>> 10) & 7],
    environmentIndex: key & 7,
    fixedParam0: [
      data.getFloat32(28, true),
      data.getFloat32(32, true),
      data.getFloat32(36, true),
      0,
    ],
    slopeBias: data.getFloat32(24, true),
    slopeBiasBits: data.getUint32(24, true),
    blendRow: row,
    colorWrite: ((finalFlags >>> 13) & 15) | (features & 0x2000 ? 8 : 0),
  };
}

/** The material of a simple primitive that has no material element. */
export function plainMaterial(
  flags: number,
  priority: number,
  drawCoordinateMode: number,
  layout: number,
  textureCount: number,
): SimpleMaterial {
  const { bytes, data } = initialMaterialContext(flags, priority, drawCoordinateMode);
  return finishMaterial(bytes, data, layout, textureCount);
}

/** Publishes one material element into an existing simple-material context. */
export function applySimpleMaterial(
  material: SimpleMaterial,
  settings: readonly number[],
  channels: ArrayLike<number>,
  layout: number,
  textureCount: number,
): SimpleMaterial {
  const bytes = material.context.slice();
  const data = new DataView(bytes.buffer);
  const mode = settings[0];

  const flags24 = settings[6];
  const blend32 = settings[8] | 0;
  const shadow40 = settings[10] | 0;
  const selector44 = settings[11] | 0;
  let features = data.getUint32(96, true);
  if (mode >= 1 && mode <= 3) {
    data.setUint32(44, mode, true);
    data.setFloat32(28, channels[0], true);
    features |= mode === 1 ? 0x420 : 0x220;
  }
  let blend: number | null = null;
  if (flags24 & 1) {
    features |= 0x2000;
    blend = data.getUint32(0, true) & 0x3f;
    if (blend < 10) blend += 10;
  } else if (blend32 > 0) blend = blend32;
  if (blend !== null) {
    const updated = (data.getUint32(0, true) & ~0x3f) | (blend & 0x3f);
    data.setUint32(0, updated, true);
    features = blend <= 32 ? features & ~0x800 : features | 0x800;
    const row = BLEND_ROWS[Math.min(updated & 0x3f, 61)];
    features = (features & ~0x60) | ((row[0] << 5) & 0x20) | ((row[16] << 6) & 0x40);
    data.setUint32(88, (data.getUint32(88, true) & ~8) | (row[0] === 0 ? 8 : 0), true);
    if (blend > 32) features |= 0x20;
  }
  data.setFloat32(24, channels[4], true);
  data.setFloat32(36, channels[5], true);
  data.setUint32(96, (features & ~8) | ((shadow40 << 3) & 8), true);
  data.setUint32(
    100,
    (data.getUint32(100, true) & ~0x1f0) | (selector44 >= 0 ? (selector44 << 4) & 0x1f0 : 0x160),
    true,
  );
  return finishMaterial(bytes, data, layout, textureCount);
}

export function createDrawPrograms(program: EffectProgram): EffectDrawPrograms {
  const r = program.resource;
  const sources = new Map<number, EffectNode>(r.nodes.map((n) => [n.offset, n]));
  const bindingCache = new Map<number, readonly TextureBinding[]>();
  const primitives = new Map<number, PrimitiveDraw>();
  const particles = new Map<number, ParticleDraw>();

  const priorityOf = (node: NodeProgram) => (node.prioritySource << 24) >> 24;
  const staticLayer = (node: NodeProgram): number => {
    let layer = node.layerSource;
    if (layer === -1) layer = node.parent === null ? 5 : staticLayer(program.node(node.parent));
    layer = (layer << 24) >> 24;
    return layer < 0 ? 5 : layer;
  };

  function bindings(node: NodeProgram): readonly TextureBinding[] {
    const cached = bindingCache.get(node.offset);
    if (cached) return cached;
    const source = sources.get(node.offset)!;
    const out: TextureBinding[] = [];
    for (const element of source.elements) {
      if (element.type !== 300) continue;
      if (element.data === null) throw new RangeError("Element300 parameters");
      const count = r.u32(element.offset + 12);
      const head = count ? r.pointer(element.offset + 8)! : 0;
      const words = Array.from({ length: 13 }, (_, i) => r.u32(element.data! + i * 4));
      for (let referenceOrdinal = 0; referenceOrdinal < count; referenceOrdinal++)
        out.push({
          elementOffset: element.offset,
          referenceOrdinal,
          resourceIndex: r.u32(head + referenceOrdinal * 8),
          referenceValue: r.u32(head + referenceOrdinal * 8 + 4),
          parameterWords: words,
          sampler: elementSampler(words),
        });
    }
    bindingCache.set(node.offset, out);
    return out;
  }

  function sourceFlags(node: NodeProgram): number {
    const source = sources.get(node.offset)!;
    const textures = source.elements.filter((e) => e.type === 300);
    return drawSourceFlags(
      r.i32(node.offset + 12),
      node.flags,
      textures.map((element) =>
        element.data !== undefined && element.data !== null ? r.u32(element.data + 8) : null,
      ),
    );
  }

  function material(
    node: NodeProgram,
    flags: number,
    layout: number,
    textureCount: number,
  ): SimpleMaterial {
    const source = sources.get(node.offset)!;
    let result = plainMaterial(flags, priorityOf(node), node.coordinateMode, layout, textureCount);
    for (const element of source.elements) {
      if (element.type !== 6003002) continue;
      if (element.data === null) throw new RangeError("Material element settings");
      const at = element.data;
      result = applySimpleMaterial(
        result,
        Array.from({ length: 12 }, (_, i) => r.u32(at + i * 4)),
        [4, 8, 12, 16, 20, 28].map((offset) => r.f32(at + offset)),
        layout,
        textureCount,
      );
    }
    return result;
  }

  function primitive(node: NodeProgram): PrimitiveDraw {
    const cached = primitives.get(node.offset);
    if (cached) return cached;
    const source = sources.get(node.offset)!;
    const all = bindings(node);
    const elementOffsets = [...new Set(all.map((b) => b.elementOffset))];
    if (elementOffsets.length < 1 || elementOffsets.length > 3)
      throw new RangeError("One to three texture elements required");
    const layout =
      node.type === 100 && source.elements.filter((e) => e.type === 300).length > 1 ? 5 : 4;
    const geometry = node.type === 204 ? source.elements.find((e) => e.type === 102) : undefined;
    const flags = sourceFlags(node);
    const layer = staticLayer(node);
    const priority = priorityOf(node);
    const draw: PrimitiveDraw = {
      node,
      layout,
      strip: node.type === 204,
      vertexCount: geometry ? r.u32(geometry.data!) : 6,
      elementOffsets,
      slots: elementOffsets.map((offset) => all.filter((b) => b.elementOffset === offset)),
      animatedTextureOffsets: source.states.some((state) =>
        state.motions.some((motion) => motion.type === 403),
      ),
      material: material(node, flags, layout, elementOffsets.length),
      layer,
      priority,
      orderKey: orderKey(layer, priority),
      sortDistanceOffset: -priority | 0,
    };
    primitives.set(node.offset, draw);
    return draw;
  }

  function particle(node: NodeProgram): ParticleDraw {
    const cached = particles.get(node.offset);
    if (cached) return cached;
    const all = bindings(node);
    const flags = sourceFlags(node);
    const blend = flags & 63;
    if (blend === 0) throw new RangeError("Particle blend mode 0 inherits the model state");
    const row = BLEND_ROWS[blend];
    const layer = staticLayer(node);
    const priority = priorityOf(node);
    const draw: ParticleDraw = {
      node,
      binding: all[0],
      sourceFlags: flags,
      featureWord144: particleFeatureWord(node.coordinateMode, row),
      blendRow: row,
      layer,
      priority,
      orderKey: orderKey(layer, priority),
    };
    particles.set(node.offset, draw);
    return draw;
  }

  function order(
    node: NodeProgram,
    layerParameter: number | null,
    out: { layer: number; priority: number; key: number },
  ): void {
    const priority = priorityOf(node);
    const layer =
      layerParameter === null
        ? staticLayer(node)
        : program.publishedLayers(layerParameter)[node.index];
    out.layer = layer;
    out.priority = priority;
    out.key = orderKey(layer, priority);
  }

  return { primitive, particle, order, bindings };
}
