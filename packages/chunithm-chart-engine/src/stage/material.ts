import type { StageField, StageFields, StageShape } from "./pack";
import type { StageMaterialUvState } from "./model/materialUv";

const f = Math.fround;

export type StageLighting = "constant" | "lambert" | "phong";

/** The default-shader inputs of one shape. */
export interface StageMaterial {
  readonly lighting: StageLighting;
  /** Default, squared half-Lambert, or 75% front / 25% back diffuse lighting. */
  readonly lightModel: 0 | 1 | 2;
  readonly hasNormals: boolean;
  readonly hasTexcoords: boolean;
  /** The source-backed eight-texture Blend permutation, or null for the default shader. */
  readonly blendMaps: readonly { readonly slot: number; readonly uv: number }[] | null;
  /** Material-defined default-shader UV offset/scale feature bits. */
  readonly uvOffsetMask: number;
  readonly diffuseBase: readonly number[];
  readonly specularBase: readonly number[];
  readonly incandescenceBase: readonly number[];
  /** Base layers: texture slot, coordinate set, and UV offset (xy) and scale (zw). */
  readonly layers: readonly {
    readonly slot: number;
    readonly uv: number;
    readonly offsetScale: readonly number[];
  }[];
  readonly environment: {
    readonly slot: number;
    readonly mapType: number;
    readonly kind: "sphere" | "cube";
  } | null;
  readonly reflectionOverride: boolean;
  readonly shadowCaster: boolean;
  readonly shadowReceiver: boolean;
  readonly specularMap: {
    readonly slot: number;
    readonly uv: number;
    readonly offsetScale: readonly number[];
    /** 0: RGB mask; 1: alpha shininess; 2: alpha environment mask; 3: alpha colour modulation. */
    readonly mapType: number;
  } | null;
  /** A tangent-space normal map: texture slot, coordinate set, and UV offset (xy) and scale (zw). */
  readonly normalMap: {
    readonly slot: number;
    readonly uv: number;
    readonly offsetScale: readonly number[];
    /** A/G normals with positive Z reconstruction, selected by flag 0x10 or a DXT5 image. */
    readonly compressed: boolean;
  } | null;
  /** An incandescence map added to the emissive colour: texture slot, coordinate set, UV transform and map type. */
  readonly incandescenceMap: {
    readonly slot: number;
    readonly uv: number;
    readonly offsetScale: readonly number[];
    readonly mapType: number;
  } | null;
  readonly layerBlend: readonly [number, number, number];
  readonly baseMapType: number;
  readonly pixelAlphaTest: boolean;
  readonly pixelAlphaRef: number;
  /** How strongly the rim light reaches the shape; zero leaves it out. */
  readonly rimRate: number;
  /** The native material scattering scale also gates and scales fog. */
  readonly fogRate: number;
  /** Scale, bias and power of the silhouette fade of the alpha, or null without it. */
  readonly edgeAlpha: readonly [number, number, number] | null;
  /** Scale, bias and power of view-dependent specular and environment reflection. */
  readonly fresnel: readonly [number, number, number] | null;
  /** Whether the material selects the native vertex-shake shader. */
  readonly vertexShake: boolean;
}

export interface StageUvTransforms {
  layers: number[][];
  specular: number[];
  normal: number[];
  incandescence: number[];
  blend: Float32Array | null;
}

/** Resolves UV transforms, overwriting caller-owned output when supplied. */
export function stageUvTransforms(
  material: StageMaterial,
  offsets: ArrayLike<number> | null,
  animation: { readonly state: StageMaterialUvState; readonly draw: number } | null = null,
  drawMask: number = material.uvOffsetMask,
  out: StageUvTransforms = {
    layers: [new Array(4), new Array(4)],
    specular: new Array(4),
    normal: new Array(4),
    incandescence: new Array(4),
    blend: null,
  },
): StageUvTransforms {
  const slot = (
    i: number,
    fallback: readonly number[],
    target: number[] | Float32Array,
    at = 0,
  ): void => {
    const enabled = offsets || animation?.state.offsetsPublished || drawMask & (1 << i);
    const value = enabled ? animation?.state.parameter(animation.draw, i) : null;
    const source = !enabled ? IDENTITY_TRANSFORM : (value ?? fallback);
    target[at] = enabled && !value && offsets ? offsets[i * 2] : source[0];
    target[at + 1] = enabled && !value && offsets ? offsets[i * 2 + 1] : source[1];
    target[at + 2] = enabled && !value && offsets ? 1 : source[2];
    target[at + 3] = enabled && !value && offsets ? 1 : source[3];
  };
  const blendMaps = material.blendMaps;
  const blend = blendMaps
    ? out.blend?.length === blendMaps.length * 4
      ? out.blend
      : new Float32Array(blendMaps.length * 4)
    : null;
  if (blend)
    for (let i = 0; i < blend.length / 4; i++) slot(6 + i, IDENTITY_TRANSFORM, blend, i * 4);
  slot(0, material.layers[0]?.offsetScale ?? IDENTITY_TRANSFORM, out.layers[0]);
  slot(1, material.layers[1]?.offsetScale ?? IDENTITY_TRANSFORM, out.layers[1]);
  slot(SPECULAR_SLOT, material.specularMap?.offsetScale ?? IDENTITY_TRANSFORM, out.specular);
  slot(NORMAL_SLOT, material.normalMap?.offsetScale ?? IDENTITY_TRANSFORM, out.normal);
  slot(
    INCANDESCENCE_SLOT,
    material.incandescenceMap?.offsetScale ?? IDENTITY_TRANSFORM,
    out.incandescence,
  );
  out.blend = blend;
  return out;
}

const bitsView = new DataView(new ArrayBuffer(4));
const asFloat = (word: number) => (
  bitsView.setUint32(0, word >>> 0, true),
  bitsView.getFloat32(0, true)
);

function word(field: StageField | undefined): number {
  if (typeof field !== "object" || field === null || !("u32" in field))
    throw new RangeError("Stage material: missing word");
  return field.u32;
}

function scalar(fields: StageFields | undefined): number {
  if (!fields) throw new RangeError("Stage material: missing scalar");
  const kind = word(fields._variantType);
  if (kind === 0) return asFloat(word(fields._valueF32));
  if (kind === 1) return word(fields._valueS32) | 0;
  throw new RangeError("Stage material: scalar variant");
}

function color(fields: StageFields | undefined): number[] {
  const value = fields?._valueColor;
  if (
    !fields ||
    word(fields._variantType) !== 2 ||
    typeof value !== "object" ||
    value === null ||
    !("words" in value) ||
    value.words.length !== 4
  )
    throw new RangeError("Stage material: colour variant");
  return value.words.map(asFloat);
}

const SPECULAR_SLOT = 2;
const NORMAL_SLOT = 3;
const INCANDESCENCE_SLOT = 4;
const TANGENT = 6;
const UBYTE4 = 8;
const IDENTITY_TRANSFORM: readonly number[] = [0, 0, 1, 1];

/** The native default shader chooses UV1 only when exactly bit 0 of the four-bit set is present. */
function shaderUv(index: number): number {
  return index === 1 ? 1 : 0;
}

// TODO: Implement these features when a Stage resource enables them.
const UNSUPPORTED_FEATURES = [
  "seaRamp",
  "seaDetailMap",
  "seaSoftEdge",
  "seaReduction",
  "seaExtUvScroll",
  "tsEnableUVScale",
];

/**
 * The default-shader inputs of a shape: base colours from the ordered parameters, up to two base
 * layers, a sphere or cube environment map and a specular map.
 *
 * @throws RangeError for a shader feature, texture role or parameter form outside that set.
 */
export function stageMaterial(shape: StageShape): StageMaterial {
  const parameters = new Map(shape.parameters.map((p) => [p.name, p.value]));
  if (parameters.size !== shape.parameters.length)
    throw new RangeError("Stage material: repeated parameter");
  const lighting = shape.state._lighting;
  if (lighting !== "constant" && lighting !== "lambert" && lighting !== "phong")
    throw new RangeError(`Stage material: lighting ${String(lighting)}`);
  if (shape.state._shaderName !== "") throw new RangeError("Stage material: custom shader");
  const integer = (name: string, absent = 0) => {
    const value = parameters.has(name) ? scalar(parameters.get(name)) : absent;
    if (!Number.isInteger(value)) throw new RangeError(`Stage material: ${name} is not an integer`);
    return value;
  };
  for (const name of UNSUPPORTED_FEATURES)
    if (integer(name) !== 0) throw new RangeError(`Stage material: feature ${name}`);
  const shaderType = integer("seaShaderType") & 15;
  if (![0, 5, 6, 9].includes(shaderType) && shaderType < 11)
    throw new RangeError("Stage material: feature seaShaderType");
  const blendShader = shaderType === 5;
  if (integer("tsUserShader") !== 0 && integer("tsUserShader") !== 1)
    throw new RangeError("Stage material: feature tsUserShader");
  const vertexShakeValue = integer("seaVertexShake");
  if (vertexShakeValue !== 0 && vertexShakeValue !== 1)
    throw new RangeError("Stage material: feature seaVertexShake");
  const vertexShake = vertexShakeValue === 1;
  for (const name of ["diffuseBase", "specularBase", "incandescenceBase"])
    if (parameters.has(name)) throw new RangeError(`Stage material: explicit ${name}`);
  let diffuseBase = [1, 1, 1, 1];
  const specularBase = [1, 1, 1, 20];
  const incandescenceBase = [0, 0, 0];
  let fresnel = [1, 0, 4, 0];
  for (const { name, value } of shape.parameters) {
    if (name === "diffuse" || name === "specular") {
      const target = name === "diffuse" ? diffuseBase : specularBase;
      const input = color(value);
      for (let i = 0; i < 3; i++) target[i] = f(f(target[i]) * f(input[i]));
    } else if (name === "tsDiffuseScale" || name === "tsSpecularScale") {
      const target = name === "tsDiffuseScale" ? diffuseBase : specularBase;
      for (let i = 0; i < 3; i++) target[i] = f(f(target[i]) * f(scalar(value)));
    } else if (name === "shininess") specularBase[3] = f(scalar(value));
    else if (name === "emissive")
      color(value)
        .slice(0, 3)
        .forEach((v, i) => (incandescenceBase[i] = f(v)));
    else if (name === "tsIncandescenceScale")
      for (let i = 0; i < 3; i++)
        incandescenceBase[i] = f(f(incandescenceBase[i]) * f(scalar(value)));
  }
  for (const [index, name] of ["tsFresnelScale", "tsFresnelBias", "tsFresnelPower"].entries()) {
    if (!parameters.has(name)) continue;
    const value = index === 2 ? integer(name) : f(scalar(parameters.get(name)));
    fresnel[index] = index === 2 && value <= 0 ? 4 : value;
  }
  if (parameters.has("fresnel")) fresnel = color(parameters.get("fresnel"));
  if (lighting === "constant") diffuseBase = [1, 1, 1, 1];
  const uvMask = integer("tsEnableUVOffset");
  if (uvMask < 0 || uvMask > 63) throw new RangeError("Stage material: UV offset mask");
  const uvTransform = (name: string) => {
    const value = parameters.has(name) ? color(parameters.get(name)) : IDENTITY_TRANSFORM;
    if (!value.every(Number.isFinite)) throw new RangeError("Stage material: non-finite UV value");
    return value;
  };
  const hasCoordinates = (uv: number) =>
    shape.layout.some((e) => e.semantic === 5 && e.index === uv && e.type === 1);
  let environment: StageMaterial["environment"] = null;
  let specularMap: StageMaterial["specularMap"] = null;
  let normalMap: StageMaterial["normalMap"] = null;
  let incandescenceMap: StageMaterial["incandescenceMap"] = null;
  const layers: { slot: number; uv: number; offsetScale: readonly number[] }[] = [];
  const blendMaps: ({ slot: number; uv: number } | undefined)[] = [];
  shape.textures.forEach((binding, slot) => {
    if (binding.ordinal !== slot) throw new RangeError("Stage material: texture slot order");
    const t = binding.texture;
    const role = t._textureType;
    const flag = word(t._flag);
    const uv = shaderUv(word(t._uvSetIndex) & 15);
    if (blendShader && typeof role === "string" && /^ex[0-6]$/.test(role) && flag === 0) {
      const index = Number(role.slice(2));
      if (blendMaps[index] || !hasCoordinates(uv))
        throw new RangeError("Stage material: Blend texture form");
      blendMaps[index] = { slot, uv };
      return;
    }
    if (role === "specular" && flag === 0) {
      const mapType = integer("seaSpecularMapType");
      if (specularMap || mapType < 0 || mapType > 3 || !hasCoordinates(uv))
        throw new RangeError("Stage material: specular map form");
      specularMap = {
        slot,
        uv,
        mapType,
        offsetScale: uvTransform("tsUVScrollSpecular"),
      };
      return;
    }
    if (role === "environment" && (flag === 0 || flag === 8)) {
      if (environment) throw new RangeError("Stage material: second environment map");
      const mapType = integer("seaEnvironmentMapType");
      if (mapType < 0 || mapType > 2) throw new RangeError("Stage material: environment map type");
      environment = { slot, mapType, kind: flag === 8 ? "sphere" : "cube" };
      return;
    }
    if (role === "normal" && (flag === 0 || flag === 0x10)) {
      if (
        normalMap ||
        !shape.layout.some((e) => e.semantic === 3) ||
        !shape.layout.some((e) => e.semantic === TANGENT && e.index === 0 && e.type === UBYTE4) ||
        !hasCoordinates(uv)
      )
        throw new RangeError("Stage material: normal map form");
      normalMap = {
        slot,
        uv,
        offsetScale: uvTransform("tsUVScrollNormal"),
        compressed: flag === 0x10,
      };
      return;
    }
    if (role === "incandescence" && flag === 0) {
      const mapType = integer("seaIncandescenceMapType");
      if (incandescenceMap || mapType < 0 || mapType > 2 || !hasCoordinates(uv))
        throw new RangeError("Stage material: incandescence map form");
      incandescenceMap = {
        slot,
        uv,
        mapType,
        offsetScale: uvTransform("tsUVScrollIncandescence"),
      };
      return;
    }
    if (role !== "base" || flag !== 0)
      throw new RangeError(`Stage material: texture role ${String(role)}/${flag}`);
    const layer = layers.length;
    if (layer >= 2) throw new RangeError("Stage material: third base layer");
    if (!hasCoordinates(uv)) throw new RangeError("Stage material: base layer coordinates");
    layers.push({
      slot,
      uv,
      offsetScale: uvTransform(`tsUVScrollUV${layer}`),
    });
  });
  if (
    blendShader &&
    (shape.textures.length !== 8 ||
      shape.textures[0].texture._textureType !== "normal" ||
      !shape.textures
        .slice(1)
        .every((binding, index) => binding.texture._textureType === `ex${index}`) ||
      uvMask !== 0 ||
      !normalMap ||
      layers.length !== 0 ||
      environment ||
      specularMap ||
      incandescenceMap ||
      Array.from({ length: 7 }, (_, index) => blendMaps[index]).some((map) => !map))
  )
    throw new RangeError("Stage material: Blend texture form");
  const layerBlend: [number, number, number] = [
    integer("tsLayerBlendFactorSrc", 2),
    integer("tsLayerBlendFactorDst", 3),
    integer("tsLayerBlendFunction"),
  ];
  if (
    layers.length === 2 &&
    (layerBlend[0] > 5 || layerBlend[1] > 5 || layerBlend[2] > 2 || layerBlend.some((v) => v < 0))
  )
    throw new RangeError("Stage material: layer equation");
  const baseMapType = integer("seaBaseMapType");
  if (baseMapType < 0 || baseMapType > 2) throw new RangeError("Stage material: base map type");
  const fill = word(shape.state._fillType);
  if (fill > 2) throw new RangeError(`Stage material: fill ${fill}`);
  let edgeAlpha: [number, number, number] | null = null;
  if (integer("seaEdgeAlpha") & 1) {
    const edge = (name: string) => {
      if (!parameters.has(name)) throw new RangeError(`Stage material: missing ${name}`);
      return scalar(parameters.get(name));
    };
    edgeAlpha = [edge("seaEdgeAlphaScale"), edge("seaEdgeAlphaBias"), edge("seaEdgeAlphaPower")];
  }
  const alphaRef = word(shape.state._alphaRef) & 255;
  const fogRate = parameters.has("tsScatteringScale")
    ? f(scalar(parameters.get("tsScatteringScale")))
    : 0;
  const values = [
    ...diffuseBase,
    ...specularBase,
    ...incandescenceBase,
    ...layers.flatMap((l) => l.offsetScale),
    ...(edgeAlpha ?? []),
    ...fresnel,
    fogRate,
  ];
  if (!values.every(Number.isFinite)) throw new RangeError("Stage material: non-finite value");
  return {
    lighting,
    lightModel: shaderType === 6 ? 1 : shaderType === 9 ? 2 : 0,
    hasNormals: shape.layout.some((e) => e.semantic === 3),
    hasTexcoords: hasCoordinates(0) || hasCoordinates(1),
    blendMaps: blendShader ? (blendMaps as { slot: number; uv: number }[]) : null,
    uvOffsetMask: uvMask,
    diffuseBase,
    specularBase,
    incandescenceBase,
    layers,
    environment,
    reflectionOverride: (integer("seaNoOverrideEnvironmentMap") & 1) === 0,
    shadowCaster: (integer("tsShadowCaster") & 1) !== 0,
    shadowReceiver: (integer("tsShadowReceiver") & 1) !== 0,
    specularMap,
    normalMap,
    incandescenceMap,
    layerBlend,
    baseMapType,
    pixelAlphaTest: fill !== 0,
    pixelAlphaRef: Math.max(f(f(alphaRef) * f(1 / 255)), f(0.0001)),
    edgeAlpha,
    fresnel:
      integer("seaUseFresnel") !== 0 && fresnel[0] > 1.1920928955078125e-7
        ? [fresnel[0], fresnel[1], fresnel[2]]
        : null,
    rimRate: parameters.has("seaRimLightRate") ? f(scalar(parameters.get("seaRimLightRate"))) : 0,
    fogRate,
    vertexShake,
  };
}
