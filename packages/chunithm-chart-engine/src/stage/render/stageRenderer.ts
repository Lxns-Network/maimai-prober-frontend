import type { StageFrame, StageDrawStats, StageShadowQueue, StageRenderer } from "./types";
import {
  rowsToColumns,
  transpose,
  affineRows,
  multiplyColumns,
  unpackColor,
  casterSphere,
} from "./modelTransforms";
import { createStageModelProgram, BLEND_TEXTURE_UNITS } from "./modelProgram";
import type { StageModel, StagePack, StageSampler, StageShape } from "../pack";
import { stageViewportRegion, withStageViewport } from "./stageViewport";
import { createColorSnapshot, type ColorSnapshot } from "../../gpu/colorSnapshot";
import { liveNodes, type StageNode } from "../runtime";
import { stageMaterial, stageUvTransforms, type StageMaterial } from "../material";
import { stageUvOffsets } from "../motions/uvScroll";
import {
  stageModelLive,
  stageModelPose,
  stageModelState,
  stageInstanceScenes,
  type StageModelState,
} from "../nodes/model";
import type { StageMaterialUvState } from "../model/materialUv";
import { lightingForGroup, stageLightScope, type StageGroupLighting } from "../nodes/lights";
import {
  STAGE_PASSES,
  sortStagePass,
  stageDrawKey,
  stageMeshPass,
  stageModelDepth,
} from "../order";
import { STAGE_ATTRIBUTES, STAGE_MAX_BONES } from "./stageShader";
import { stageBlendSortFlags, type StageBlend } from "../blend";
import {
  restPose,
  skinMeshWorld,
  skinPalette,
  stageShapeSkin,
  type StageShapeSkin,
} from "../model/skin";
import { skinBounds } from "../model/skinBounds";
import { createStageModelProvider, stageAnimation, type StageModelPose } from "../model/animation";
import {
  buildInstanceMotionSamples,
  instanceBoneLayout,
  packInstanceMotion,
} from "../model/instanceMotion";
import {
  STAGE_INSTANCE_CAPACITY,
  instanceBatchBounds,
  initialInstanceBounds,
  instanceCullSphere,
  instanceGroupSphere,
  instanceSphereVisible,
  type StageInstanceBounds,
} from "../model/instanceBounds";
import {
  instancePreprocessMatrices,
  preprocessInstanceVertices,
} from "../model/instanceVertexPreprocess";
import {
  compileDeviceState,
  createDeviceState,
  mirrorDeviceState,
  type DeviceStateSet,
  type PackedStateCommand,
} from "../../gpu/deviceState";
import {
  createSamplerCache,
  createStageSamplerState,
  stageSamplerParameters,
} from "../../gpu/samplers";
import { createStageParticles, type StageParticleEntry } from "./stageParticles";
import { createStagePrimitives, type StagePrimitiveEntry } from "./stagePrimitives";
import { createStageStarParticles } from "./stageStarParticles";
import { createStagePrimitives3d } from "./stagePrimitives3d";
import { createStageCameraDebug } from "./stageCameraDebug";
import type { EffectDrawContext } from "../../effects/render";
import { DEPTH_SNAPSHOT_FIRST_PASS } from "../../render/passOrder";
import { stageGroupShadow, type StageShadowFrame } from "./stageShadowFrame";
import { stageGroupReflection, type StageReflectionFrame } from "./stageReflectionFrame";
import type { StageShadowCamera } from "../nodes/shadowCamera";
import { shadowBoxVisible, shadowCullBox } from "../nodes/shadowCull";
import { shadowFrustumPlanes } from "../nodes/shadowFrustum";
import { stageWindPhases } from "../nodes/wind";

const f = Math.fround;
const FRONT_PASS = 24;
const BACK_PASSES = STAGE_PASSES.filter((pass) => pass.index !== FRONT_PASS);
const FRONT_PASSES = STAGE_PASSES.filter((pass) => pass.index === FRONT_PASS);
const POSITION = 0;
const BLEND_WEIGHTS = 1;
const SECOND_BLEND_WEIGHTS = 2;
const NORMAL = 3;
const TEXCOORD = 5;
const COLOR = 10;
const FLOAT3 = 2;
const FLOAT2 = 1;
const UBYTE4 = 8;
const MAX_TEXTURE_SLOTS = 6;
const ENVIRONMENT_CUBE_UNIT = 6;
const REFLECTION_UNIT = 7;
const INSTANCE_MOTION_UNIT = 8;
const SHADOW_UNITS = [11, 12, 14] as const;
const RIM_MASK_UNIT = 13;
const TEXTURE_UNITS = 13;
const TANGENT = 6;
const STATE_DEPTH_TEST = 7;
const STATE_ALPHA_TEST = 15;
const STATE_DEPTH_WRITE = 14;
const STATE_SOURCE = 19;
const STATE_DESTINATION = 20;
const STATE_BLEND = 27;
const STATE_OPERATION = 171;
const STATE_SEPARATE_ALPHA = 206;
const STATE_SOURCE_ALPHA = 207;
const STATE_DESTINATION_ALPHA = 208;
const STATE_OPERATION_ALPHA = 209;

/** A shape's device state under a node's forced blend and depth values. */
function blendedState(base: DeviceStateSet, blend: StageBlend): DeviceStateSet {
  const values = Float64Array.from(base.values);
  values[STATE_BLEND] = blend.enable;
  values[STATE_SOURCE] = blend.source;
  values[STATE_DESTINATION] = blend.destination;
  values[STATE_OPERATION] = blend.operation;
  values[STATE_SEPARATE_ALPHA] = 0;
  values[STATE_SOURCE_ALPHA] = 1;
  values[STATE_DESTINATION_ALPHA] = 1;
  values[STATE_OPERATION_ALPHA] = 1;
  values[STATE_ALPHA_TEST] = blend.alphaTest;
  values[STATE_DEPTH_TEST] = blend.depthTest;
  values[STATE_DEPTH_WRITE] = blend.depthWrite;
  return Object.freeze({ values });
}

interface ShapeProgram {
  readonly nodeIndices: readonly number[];
  readonly material: StageMaterial;
  readonly staticUv: ReturnType<typeof stageUvTransforms>;
  readonly state: DeviceStateSet;
  readonly vao: WebGLVertexArrayObject;
  readonly buffers: WebGLBuffer[];
  readonly indexType: number;
  readonly instanceBuffer: WebGLBuffer | null;
  readonly count: number;
  readonly hasColors: boolean;
  readonly hasColor1: boolean;
  readonly textures: (WebGLTexture | null)[];
  readonly samplers: (WebGLSampler | null)[];
  readonly samplerBindings: readonly (
    | {
        readonly unit: number;
        readonly image: string;
        readonly state: Exclude<StageSampler, { readonly unsupported: string }>;
      }
    | undefined
  )[];
  /** The name of the image bound at each unit, as the shape records it. */
  readonly unitNames: (string | null)[];
  readonly lodBias: number[];
  readonly sortDistanceOffset: number;
  readonly fill: number;
  /** How the shape binds to the model's nodes, or null for a rigid shape. */
  readonly skin: StageShapeSkin | null;
  readonly influences: number;
  readonly instanceHasWeight1: boolean;
  readonly instanceSingleWeight: boolean;
  readonly instanceMotion: InstanceMotion | null;
}

function stageSamplerImage(binding: StageShape["textures"][number]): string | null {
  const name = binding.image._fullName;
  const chunk = binding.image._chunkFileName;
  return typeof name === "string" && name && typeof chunk === "string" && chunk
    ? JSON.stringify(["image", name, chunk, binding.id])
    : null;
}

interface InstanceMotion {
  readonly texture: WebGLTexture;
  readonly width: number;
  readonly height: number;
  readonly bones: number;
  readonly clips: ReadonlyMap<Uint8Array, number>;
}

const bits = new DataView(new ArrayBuffer(4));
const asFloat = (word: number) => (bits.setUint32(0, word >>> 0, true), bits.getFloat32(0, true));

function word(value: unknown, label: string): number {
  if (
    typeof value !== "object" ||
    value === null ||
    typeof (value as { u32?: unknown }).u32 !== "number"
  )
    throw new RangeError(`Stage shape: missing ${label}`);
  return (value as { u32: number }).u32;
}

/** Draws the model nodes of stage scene files with the default material shader and device states. */
export function createStageRenderer(
  gl: WebGL2RenderingContext,
  pack: StagePack,
  textures: ReadonlyMap<string, WebGLTexture>,
  cubeTextures: ReadonlySet<WebGLTexture> = new Set(),
): StageRenderer {
  const initialized: (() => void)[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    initialized.push(() => resource.dispose());
    return resource;
  };
  try {
    let colorSnapshot: ColorSnapshot | null = null;
    const { program, locations, uniform: u } = createStageModelProgram(gl);
    initialized.push(() => gl.deleteProgram(program));
    const device = createDeviceState(gl);
    const samplerCache = own(createSamplerCache(gl));
    const samplerState = createStageSamplerState();
    const textures2d = new Map([...textures].filter(([, texture]) => !cubeTextures.has(texture)));
    const particles = own(createStageParticles(gl, pack, textures2d));
    const starParticles = own(createStageStarParticles(gl, pack, textures2d));
    const primitives = own(createStagePrimitives(gl, pack, textures2d));
    const primitives3d = own(createStagePrimitives3d(gl, pack, textures2d));
    const cameraDebug = own(createStageCameraDebug(gl));
    const programs = new Map<StageShape, ShapeProgram | string>();
    const geometryBuffers = new WeakMap<ArrayBufferLike, Map<string, WebGLBuffer>>();
    const uploadedGeometry = new Set<WebGLBuffer>();
    const releaseGeometry = () => {
      for (const buffer of uploadedGeometry) gl.deleteBuffer(buffer);
      uploadedGeometry.clear();
    };
    initialized.push(releaseGeometry);
    const bindGeometry = (target: number, bytes: Uint8Array | Uint16Array | Uint32Array) => {
      let ranges = geometryBuffers.get(bytes.buffer);
      if (!ranges) geometryBuffers.set(bytes.buffer, (ranges = new Map()));
      const key = `${target}:${bytes.byteOffset}:${bytes.byteLength}`;
      let buffer = ranges.get(key);
      if (buffer) {
        gl.bindBuffer(target, buffer);
        return;
      }
      buffer = gl.createBuffer()!;
      try {
        gl.bindBuffer(target, buffer);
        gl.bufferData(target, bytes, gl.STATIC_DRAW);
        ranges.set(key, buffer);
        uploadedGeometry.add(buffer);
      } catch (error) {
        gl.deleteBuffer(buffer);
        throw error;
      }
    };
    const instancePrograms = new Map<StageShape, Map<string, ShapeProgram | string>>();
    const instanceMotionTextures = new Map<StageModel, Map<string, InstanceMotion>>();
    const instanceSourceIds = new WeakMap<Uint8Array, number>();
    let nextInstanceSourceId = 0;
    const instanceSourceKey = (sources: readonly Uint8Array[]) =>
      sources
        .map((source) => {
          let id = instanceSourceIds.get(source);
          if (id === undefined) instanceSourceIds.set(source, (id = nextInstanceSourceId++));
          return id;
        })
        .join(",");
    const meshWorlds = new Map<StageModel, Map<number, Float32Array>>();
    const sourceBounds = new WeakMap<StageShape, Map<string, readonly number[]>>();
    const shapeBounds = (shape: StageShape, name: string, length: number): readonly number[] => {
      let fields = sourceBounds.get(shape);
      const cached = fields?.get(name);
      if (cached) return cached;
      const field = shape.fields[name];
      if (
        typeof field !== "object" ||
        field === null ||
        !("words" in field) ||
        field.words.length !== length
      )
        throw new RangeError(`Stage shadow: missing ${name}`);
      // Source bounds are immutable; animated skin and instance bounds are computed separately.
      const bounds = field.words.map(asFloat);
      if (!fields) sourceBounds.set(shape, (fields = new Map()));
      fields.set(name, bounds);
      return bounds;
    };
    const blended = new WeakMap<StageBlend, Map<ShapeProgram, DeviceStateSet>>();
    const stateOf = (shape: ShapeProgram, blend: StageBlend | null): DeviceStateSet => {
      if (!blend) return shape.state;
      let byShape = blended.get(blend);
      if (!byShape) blended.set(blend, (byShape = new Map()));
      let set = byShape.get(shape);
      if (!set) byShape.set(shape, (set = blendedState(shape.state, blend)));
      return set;
    };

    const poses = new Map<StageModel, Float32Array[]>();
    const poseColumns = new WeakMap<StageModelPose, (Float32Array | undefined)[]>();
    const animatedWorld = (pose: StageModelPose, index: number): Float32Array => {
      let worlds = poseColumns.get(pose);
      if (!worlds) poseColumns.set(pose, (worlds = []));
      // An update publishes a new pose; all draw passes share the current pose's matrices.
      return (worlds[index] ??= rowsToColumns(pose.worlds[index]));
    };
    const poseOf = (model: StageModel) => {
      let pose = poses.get(model);
      if (!pose) poses.set(model, (pose = restPose(model)));
      return pose;
    };
    const meshWorld = (model: StageModel, ref: number): Float32Array => {
      let byRef = meshWorlds.get(model);
      if (!byRef) meshWorlds.set(model, (byRef = new Map()));
      let world = byRef.get(ref);
      if (!world) {
        const node = model.nodes.find((n) => n.ref === ref);
        const words = (node?.fields._mtxWorld as { words?: number[] } | undefined)?.words;
        if (!words || words.length !== 12)
          throw new RangeError(`Stage model ${model.name}: node ${ref} has no world matrix`);
        byRef.set(ref, (world = rowsToColumns(words.map(asFloat))));
      }
      return world;
    };
    const instanceSpheres = new Map<StageModel, Float32Array>();
    // Shared draws retain the registered model provider, not an individual member's transform.
    const instanceSortWorlds = new Map<StageModel, Map<number, Float32Array>>();
    const instanceSortWorld = (model: StageModel, ref: number, skin: StageShapeSkin | null) => {
      let worlds = instanceSortWorlds.get(model);
      if (!worlds) instanceSortWorlds.set(model, (worlds = new Map()));
      let world = worlds.get(ref);
      if (!world) {
        const pose = poseOf(model);
        const mesh = pose[model.nodes.findIndex((node) => node.ref === ref)];
        worlds.set(ref, (world = rowsToColumns(skin ? skinMeshWorld(skin, pose, mesh) : mesh)));
      }
      return world;
    };
    const instanceSphere = (model: StageModel): Float32Array => {
      let sphere = instanceSpheres.get(model);
      if (!sphere) {
        const worlds = poseOf(model);
        const draws = model.shapes.flatMap((shape) =>
          shape.nodeRefs.map((ref) => {
            const at = model.nodes.findIndex((node) => node.ref === ref);
            if (at < 0) throw new RangeError(`Stage model ${model.name}: unknown node ${ref}`);
            return { sphere: shapeBounds(shape, "_boundingSphere", 4), world: worlds[at] };
          }),
        );
        instanceSpheres.set(model, (sphere = instanceGroupSphere(draws)));
      }
      return sphere;
    };

    const prepare = (
      model: StageModel,
      shape: StageShape,
      instance: {
        readonly key: string;
        readonly sources: readonly Uint8Array[];
      } | null,
    ): ShapeProgram => {
      const label = `${model.name}/${shape.name}@${shape.ref}`;
      const nodeIndices = shape.nodeRefs.map((ref) => model.nodes.findIndex((n) => n.ref === ref));
      const skin = stageShapeSkin(model, shape);
      if (skin) {
        if (!instance && skin.bones.length > STAGE_MAX_BONES)
          throw new RangeError(`${label}: ${skin.bones.length} bones`);
        if (nodeIndices.length !== 1 || nodeIndices[0] < 0)
          throw new RangeError(`${label}: skinned draw requires one model node`);
      }
      const sourceMaterial = stageMaterial(shape);
      const normalMap = sourceMaterial.normalMap;
      const normalFormat =
        normalMap && pack.meta.textures[shape.textures[normalMap.slot].id]?.format;
      const material =
        normalMap && normalFormat === "DXT5"
          ? { ...sourceMaterial, normalMap: { ...normalMap, compressed: true } }
          : sourceMaterial;
      if (material.blendMaps && !material.normalMap!.compressed && normalFormat !== "DXT1")
        throw new RangeError("Stage material: Blend normal texture format");
      const recorded = shape.renderState;
      if (!recorded || "unsupported" in recorded)
        throw new RangeError(
          `${label}: device state ${recorded ? recorded.unsupported : "missing"}`,
        );
      const state = compileDeviceState(recorded.commands as readonly PackedStateCommand[], label);
      const element = (semantic: number, index: number) =>
        shape.layout.find((e) => e.semantic === semantic && e.index === index);
      const position = element(POSITION, 0);
      if (position?.type !== FLOAT3) throw new RangeError(`${label}: position layout`);
      const color = element(COLOR, 0);
      if (color && color.type !== UBYTE4) throw new RangeError(`${label}: colour layout`);
      const color1 = element(COLOR, 1);
      if (color1 && color1.type !== UBYTE4)
        throw new RangeError(`${label}: secondary colour layout`);
      const normal = element(NORMAL, 0);
      if (material.hasNormals && normal?.type !== UBYTE4)
        throw new RangeError(`${label}: normal layout`);
      const textureSlots: (WebGLTexture | null)[] = new Array(TEXTURE_UNITS).fill(null);
      const samplers: (WebGLSampler | null)[] = new Array(TEXTURE_UNITS).fill(null);
      const samplerBindings: ShapeProgram["samplerBindings"][number][] = [];
      const lodBias = new Array<number>(TEXTURE_UNITS).fill(0);
      const unitNames = new Array<string | null>(TEXTURE_UNITS).fill(null);
      const bind = (unit: number, slot: number, cube = false) => {
        const binding = shape.textures[slot];
        const texture = textures.get(binding.id);
        if (!texture) throw new RangeError(`${label}: texture ${binding.name} is not loaded`);
        if (cubeTextures.has(texture) !== cube)
          throw new RangeError(`${label}: texture ${binding.name} has the wrong surface type`);
        const sampler = binding.sampler;
        if (!sampler || "unsupported" in sampler)
          throw new RangeError(`${label}: sampler ${sampler ? sampler.unsupported : "missing"}`);
        textureSlots[unit] = texture;
        unitNames[unit] = binding.name.replace(/^__HndToSvo__/, "");
        const parameters = stageSamplerParameters(
          gl,
          sampler.magFilter === null ? { ...sampler, magFilter: 2 } : sampler,
          label,
        );
        const object = samplerCache.samplerFor(parameters, label);
        const image = stageSamplerImage(binding);
        if (image !== null) {
          samplerBindings[slot] = { unit, image, state: sampler };
        } else if (sampler.magFilter === null) {
          throw new RangeError(`${label}: inherited magnification requires backing image identity`);
        } else samplers[unit] = object;
        lodBias[unit] = sampler.lodBias;
      };
      material.layers.forEach((layer, i) => bind(i, layer.slot));
      if (material.environment)
        bind(2, material.environment.slot, material.environment.kind === "cube");
      if (material.specularMap) bind(3, material.specularMap.slot);
      if (material.normalMap) bind(4, material.normalMap.slot);
      if (material.incandescenceMap) bind(5, material.incandescenceMap.slot);
      material.blendMaps?.forEach((map, index) => bind(BLEND_TEXTURE_UNITS[index], map.slot));
      let vertices = shape.vertices;
      let instanceMotion: InstanceMotion | null = null;
      let instanceBlending = false;
      if (instance && instance.sources.length) {
        const first = element(BLEND_WEIGHTS, 0);
        const second = element(SECOND_BLEND_WEIGHTS, 0);
        if (!skin || first?.type !== UBYTE4 || (second && second.type !== UBYTE4))
          throw new RangeError(`${label}: instanced skin layout is not supported`);
        const owner = instanceBoneLayout(model);
        if (owner.bones.length > 4095)
          throw new RangeError(`${label}: instanced bone layout is not supported`);
        const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
        const processed = preprocessInstanceVertices(
          vertices,
          shape.stride,
          position.offset,
          first.offset,
          instancePreprocessMatrices(skin, poseOf(model)),
          owner.mappings.get(shape)!,
          identity,
          second?.offset ?? null,
        );
        vertices = processed.vertices;
        instanceBlending = processed.blendingEnabled;
        let motions = instanceMotionTextures.get(model);
        if (!motions) instanceMotionTextures.set(model, (motions = new Map()));
        instanceMotion = motions.get(instance.key) ?? null;
        if (!instanceMotion) {
          const provider = createStageModelProvider(model);
          const samples = instance.sources.map((bytes) =>
            buildInstanceMotionSamples(
              model,
              bytes,
              owner,
              stageAnimation(bytes).cvu.frameCount + 1,
              provider,
            ),
          );
          const motionData = packInstanceMotion(samples);
          const maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
          if (motionData.width > maximum || motionData.height > maximum)
            throw new RangeError(`${label}: instanced motion texture exceeds device limits`);
          const texture = gl.createTexture()!;
          gl.activeTexture(gl.TEXTURE0 + INSTANCE_MOTION_UNIT);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA16F,
            motionData.width,
            motionData.height,
            0,
            gl.RGBA,
            gl.HALF_FLOAT,
            motionData.pixels,
          );
          instanceMotion = {
            texture,
            width: motionData.width,
            height: motionData.height,
            bones: owner.bones.length,
            clips: new Map(
              instance.sources.map((source, index) => [source, motionData.offsets[index]]),
            ),
          };
          motions.set(instance.key, instanceMotion);
        }
      }
      const vao = gl.createVertexArray()!;
      const allocatedBuffers: WebGLBuffer[] = [];
      try {
        gl.bindVertexArray(vao);
        bindGeometry(gl.ARRAY_BUFFER, vertices);
        const attribute = (
          location: number,
          size: number,
          type: number,
          normalized: boolean,
          offset: number,
        ) => {
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, type, normalized, shape.stride, offset);
        };
        attribute(STAGE_ATTRIBUTES.position, 3, gl.FLOAT, false, position.offset);
        for (const [index, location] of [
          [0, STAGE_ATTRIBUTES.uv0],
          [1, STAGE_ATTRIBUTES.uv1],
        ] as const) {
          const uv = element(TEXCOORD, index);
          if (uv?.type === FLOAT2) attribute(location, 2, gl.FLOAT, false, uv.offset);
        }
        if (color) attribute(STAGE_ATTRIBUTES.color, 4, gl.UNSIGNED_BYTE, true, color.offset);
        if (color1) attribute(STAGE_ATTRIBUTES.color1, 4, gl.UNSIGNED_BYTE, true, color1.offset);
        if (normal) attribute(STAGE_ATTRIBUTES.normal, 3, gl.UNSIGNED_BYTE, true, normal.offset);
        const tangent = element(TANGENT, 0);
        if (material.normalMap && tangent)
          attribute(STAGE_ATTRIBUTES.tangent, 4, gl.UNSIGNED_BYTE, true, tangent.offset);
        if (skin) {
          const first = element(BLEND_WEIGHTS, 0);
          const second = element(SECOND_BLEND_WEIGHTS, 0);
          if (first?.type !== UBYTE4 || (second && second.type !== UBYTE4))
            throw new RangeError(`${label}: blend weight layout`);
          attribute(STAGE_ATTRIBUTES.weight0, 4, gl.UNSIGNED_BYTE, true, first.offset);
          if (second) attribute(STAGE_ATTRIBUTES.weight1, 4, gl.UNSIGNED_BYTE, true, second.offset);
        }
        bindGeometry(gl.ELEMENT_ARRAY_BUFFER, shape.indices);
        const instanceBuffer = instance ? gl.createBuffer()! : null;
        if (instanceBuffer) {
          allocatedBuffers.push(instanceBuffer);
          gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, 108, gl.DYNAMIC_DRAW);
          for (const [location, size, offset] of [
            [8, 4, 0],
            [9, 4, 16],
            [10, 4, 32],
            [11, 4, 48],
            [12, 4, 64],
            [13, 4, 80],
            [14, 3, 96],
          ]) {
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, 108, offset);
            gl.vertexAttribDivisor(location, 1);
          }
        }
        gl.bindVertexArray(null);
        return {
          nodeIndices,
          material,
          staticUv: stageUvTransforms(material, null),
          state,
          vao,
          buffers: allocatedBuffers,
          indexType: shape.indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
          instanceBuffer,
          count: shape.indices.length,
          hasColors: !!color,
          hasColor1: !!color1,
          textures: textureSlots,
          samplers,
          samplerBindings,
          unitNames,
          lodBias,
          sortDistanceOffset: asFloat(
            word(shape.fields._sortDistanceOffset, "sort distance offset"),
          ),
          fill: word(shape.state._fillType, "fill type"),
          skin,
          influences: skin?.influences ?? 0,
          instanceHasWeight1: !!instance && !!element(SECOND_BLEND_WEIGHTS, 0),
          instanceSingleWeight: !!instance && !instanceBlending,
          instanceMotion,
        };
      } catch (error) {
        gl.deleteVertexArray(vao);
        for (const buffer of allocatedBuffers) gl.deleteBuffer(buffer);
        gl.bindVertexArray(null);
        throw error;
      }
    };

    const programOf = (
      model: StageModel,
      shape: StageShape,
      state: StageModelState,
      node: StageNode,
      skipped: Map<string, string>,
    ) => {
      const animation = state.instanceAnimation;
      const group = state.instanceGroup;
      if (animation && (!group || !group.ready)) {
        skipped.set(
          `${model.name}/${shape.name}@${shape.ref}`,
          "Stage animation: shared instance group is not ready",
        );
        return null;
      }
      const sources = group ? (animation ? group.sources : []) : null;
      const key = sources ? (animation ? instanceSourceKey(sources) : "rigid") : "";
      let byList: Map<string, ShapeProgram | string> | undefined;
      if (group) {
        byList = instancePrograms.get(shape);
        if (!byList) instancePrograms.set(shape, (byList = new Map()));
      }
      let entry = byList ? byList.get(key) : programs.get(shape);
      if (entry === undefined) {
        try {
          entry = prepare(model, shape, sources ? { key, sources } : null);
        } catch (error) {
          entry = String((error as Error).message);
        }
        if (byList) byList.set(key, entry);
        else programs.set(shape, entry);
      }
      if (typeof entry === "string") {
        skipped.set(`${model.name}/${shape.name}@${shape.ref}`, entry);
        return null;
      }
      const source = animation && node.scene.options.animation!(animation.ordinal);
      if (animation && (!source || !entry.instanceMotion?.clips.has(source))) {
        skipped.set(
          `${model.name}/${shape.name}@${shape.ref}`,
          "Stage animation: missing shared instance clip",
        );
        return null;
      }
      return entry;
    };

    interface Entry {
      readonly key: number;
      readonly depth: number;
      readonly pass: number;
      readonly node: StageNode;
      readonly shape: ShapeProgram;
      readonly world: Float32Array;
      readonly sortWorld: Float32Array;
      readonly blend: StageBlend | null;
      /** Mesh-local skinning rows for this draw, or null for a rigid shape. */
      readonly palette: Float32Array | null;
      /** Instance animation selected when this draw was queued. */
      readonly instanceAnimation: {
        readonly frame: number;
        readonly source: Uint8Array;
        readonly previousFrame: number;
        readonly previousSource: Uint8Array | null;
        readonly weight: number;
      } | null;
      /** Images bound in place of the shape's own, after texture swaps. */
      readonly textures: (WebGLTexture | null)[] | null;
      readonly samplerImages: (string | undefined)[] | null;
      /** The node's UV offsets per texture slot once a motion has written them. */
      readonly uvOffsets: Float32Array | null;
      readonly materialUv: { readonly state: StageMaterialUvState; readonly draw: number } | null;
      readonly instanceUv: Float32Array | null;
      readonly instanceUvFeature: boolean | null;
      readonly sphere: readonly [number, number, number, number] | null;
      readonly instances?: readonly Entry[];
    }

    const instanceStreams = new Map<ShapeProgram, Float32Array>();

    type DrawEntry = Entry | StageParticleEntry | StagePrimitiveEntry;

    const batchInstances = (entries: readonly DrawEntry[]): DrawEntry[] => {
      const result: DrawEntry[] = [];
      const batches = new Map<
        NonNullable<StageModelState["instanceGroup"]>,
        Map<ShapeProgram, Map<Float32Array, Entry[]>>
      >();
      for (const entry of entries) {
        if (
          "draw" in entry ||
          !entry.shape.instanceBuffer ||
          (entry.shape.skin && !entry.shape.instanceMotion) ||
          entry.textures
        ) {
          result.push(entry);
          continue;
        }
        const group = stageModelState(entry.node)!.instanceGroup!;
        let shapes = batches.get(group);
        if (!shapes) batches.set(group, (shapes = new Map()));
        let draws = shapes.get(entry.shape);
        if (!draws) shapes.set(entry.shape, (draws = new Map()));
        let members = draws.get(entry.sortWorld);
        if (!members) {
          draws.set(entry.sortWorld, (members = []));
          result.push({ ...entry, instances: members });
        }
        members.push(entry);
      }
      return result;
    };

    const drawFrame = (
      frame: StageFrame,
      selection?: { readonly camera: StageShadowCamera; queue?: StageShadowQueue },
      selectedEntries?: readonly Entry[],
    ): StageDrawStats => {
      const stats: StageDrawStats = { draws: 0, skipped: new Map() };
      const { camera, lighting } = frame;
      const entries: Entry[] = selectedEntries ? [...selectedEntries] : [];
      const planes = selection
        ? shadowFrustumPlanes(selection.camera.cullViewProjection)
        : shadowFrustumPlanes(
            Float32Array.from(camera.cullViewProjection ?? camera.viewProjection),
          );
      const instancePlanes = new Map<
        NonNullable<StageModelState["instanceGroup"]>,
        ReturnType<typeof shadowFrustumPlanes>
      >();
      const sceneNodes = selectedEntries ? [] : liveNodes(frame.scene);
      const sharedNodes = selectedEntries
        ? []
        : stageInstanceScenes(frame.scene).flatMap((scene) =>
            scene === frame.scene ? sceneNodes : liveNodes(scene),
          );
      const sceneMask = (1 << (frame.scene.options.drawIndex ?? 0)) & 0x7fffffff;
      const nodes = selectedEntries
        ? []
        : sharedNodes.filter((node) => {
            const group = stageModelState(node)?.instanceGroup;
            return group ? (group.drawMask & sceneMask) !== 0 : node.scene === frame.scene;
          });
      // Graph draws precede the instance-manager flush, including unsorted caster collection.
      nodes.sort(
        (a, b) =>
          (stageModelState(a)?.instanceGroup?.order ?? -1) -
          (stageModelState(b)?.instanceGroup?.order ?? -1),
      );
      const instanceBounds = new Map<
        NonNullable<StageModelState["instanceGroup"]>,
        { bounds: StageInstanceBounds | null; readonly visible: Set<StageNode> }
      >();
      if (!selectedEntries) {
        // Shared groups collect all player submissions before publishing their draw bounds.
        for (const node of sharedNodes) {
          const group = stageModelState(node)?.instanceGroup;
          if (!group || !stageModelLive(node)) continue;
          let sourcePlanes = instancePlanes.get(group);
          if (!sourcePlanes) {
            const source = frame.instanceCameras
              ? frame.instanceCameras.get(group.targetScene || "MainScene")
              : (frame.instanceCamera ?? camera);
            if (!source)
              throw new RangeError(`Stage instance: unavailable source scene ${group.targetScene}`);
            sourcePlanes = shadowFrustumPlanes(Float32Array.from(source.viewProjection));
            instancePlanes.set(group, sourcePlanes);
          }
          let batch = instanceBounds.get(group);
          if (!batch) instanceBounds.set(group, (batch = { bounds: null, visible: new Set() }));
          const sphere = instanceCullSphere(instanceSphere(group.model), affineRows(node.world), 1);
          if (
            instanceSphereVisible(sphere, sourcePlanes) &&
            batch.visible.size < STAGE_INSTANCE_CAPACITY
          )
            batch.visible.add(node);
        }
        for (const [group, batch] of instanceBounds)
          batch.bounds = instanceBatchBounds(
            [...batch.visible].map((node) => node.world.subarray(12, 15)),
            instanceSphere(group.model)[3],
            1,
          );
      }
      if (!selectedEntries)
        for (const node of nodes) {
          const state = stageModelState(node);
          if (!state || !stageModelLive(node)) continue;
          if (node.scene === frame.scene && frame.cameraScopes && !frame.cameraScopes.has(node))
            continue;
          if (state.instanceGroup && !instanceBounds.get(state.instanceGroup)!.visible.has(node))
            continue;
          if (state.materialUvError) {
            stats.skipped.set(`model node ${node.id}`, state.materialUvError);
            continue;
          }
          if (
            state.materialUv &&
            (state.materialUv.resources.length !== state.resources.length ||
              state.materialUv.resources.some(
                (ordinal, index) => ordinal !== state.resources[index],
              ))
          ) {
            stats.skipped.set(`model node ${node.id}`, "UV animation: stale model resources");
            continue;
          }
          const key = state.instanceGroup ? 0x8580 : stageDrawKey(node);
          const blend = state.blend;
          const role =
            node.scene === frame.scene
              ? frame.role
              : node.scene.graph === pack.graphs.field
                ? "field"
                : "base";
          const firstEntry = entries.length;
          let drawIndex = 0;
          for (const ordinal of state.resources) {
            const model = pack.model(role, ordinal);
            if (!model) throw new RangeError(`Stage model resource ${ordinal} is not a model`);
            let pose: StageModelPose | null = null;
            let poseError: string | null = null;
            try {
              pose = stageModelPose(node, model);
            } catch (error) {
              if (!(error instanceof RangeError)) throw error;
              poseError = error.message;
            }
            for (const shape of model.shapes) {
              const materialUv =
                node.record?.type !== 6001010 && state.materialUv
                  ? { state: state.materialUv.cells, draw: drawIndex }
                  : null;
              const instanceUvFeature =
                node.record?.type === 6001010 &&
                state.instanceGroup &&
                (state.instanceGroup.flags & 0x20) !== 0
                  ? state.instanceGroup.uvFeatures![drawIndex] !== 0
                  : null;
              const instanceUv = instanceUvFeature ? state.instanceUv : null;
              drawIndex++;
              const prepared = programOf(model, shape, state, node, stats.skipped);
              if (!prepared) continue;
              if ((frame.shadowPass || selection) && !prepared.material.shadowCaster) continue;
              if (prepared.material.vertexShake) {
                let owner: StageNode | null = node.parent;
                while (owner && owner.record?.type !== 6001010) owner = owner.parent;
                const record = node.record;
                const instance =
                  record?.type === 6001010 &&
                  state.instanceGroup?.model === model &&
                  prepared.hasColors;
                const shared =
                  !instance &&
                  (record?.type !== 6001001 ||
                    record.settings === null ||
                    node.scene.graph.u32(record.settings) !== 0);
                if (owner || shared) {
                  stats.skipped.set(
                    `${model.name}/${shape.name}@${shape.ref}`,
                    "Stage material: feature seaVertexShake with unverified model ownership",
                  );
                  continue;
                }
                if (prepared.hasColors && !frame.wind) {
                  stats.skipped.set(
                    `${model.name}/${shape.name}@${shape.ref}`,
                    "Stage wind: shared state is unavailable",
                  );
                  continue;
                }
              }
              if (poseError !== null) {
                stats.skipped.set(`${model.name}/${shape.name}@${shape.ref}`, poseError);
                continue;
              }
              if (frame.shadowPass && !selection && !selectedEntries && prepared.instanceMotion) {
                stats.skipped.set(
                  `${model.name}/${shape.name}@${shape.ref}`,
                  "Stage shadow: animated casters require a selected queue",
                );
                continue;
              }
              if (state.blendError) {
                stats.skipped.set(`${model.name}/${shape.name}@${shape.ref}`, state.blendError);
                continue;
              }
              const pass = stageMeshPass(
                blend ? stageBlendSortFlags(blend) : [0, 0x40, 0x60][prepared.fill],
                0,
                key,
              );
              if (pass === null) {
                stats.skipped.set(`${model.name}/${shape.name}@${shape.ref}`, "no default pass");
                continue;
              }
              let swapped: (WebGLTexture | null)[] | null = null;
              let samplerImages: (string | undefined)[] | null = null;
              let swapError = false;
              if (state.textureSwaps.length) {
                swapped = prepared.textures.slice();
                for (const swap of state.textureSwaps) {
                  const id = pack.texture(role, swap.ordinal);
                  const image = id === null ? undefined : textures.get(id);
                  prepared.unitNames.forEach((name, unit) => {
                    if (name !== swap.name) return;
                    if (
                      image &&
                      cubeTextures.has(image) === cubeTextures.has(prepared.textures[unit]!)
                    ) {
                      swapped![unit] = image;
                      samplerImages ??= new Array<string | undefined>(TEXTURE_UNITS);
                      samplerImages[unit] = JSON.stringify(["swap", role, swap.ordinal]);
                    } else if (image) {
                      stats.skipped.set(
                        `${model.name}/${shape.name}@${shape.ref}`,
                        `swapped texture ${swap.ordinal} has the wrong surface type`,
                      );
                      swapError = true;
                    } else {
                      stats.skipped.set(
                        `${model.name}/${shape.name}@${shape.ref}`,
                        `swapped texture ${swap.ordinal} is not loaded`,
                      );
                      swapError = true;
                    }
                  });
                }
              }
              if (swapError) continue;
              let palette: Float32Array | null = null;
              let meshWorldForSkin: Float32Array | null = null;
              let boundsForSkin: ReturnType<typeof skinBounds> = null;
              let boundsForInstance: StageInstanceBounds | null = null;
              if (!selectedEntries && state.instanceGroup) {
                const group = state.instanceGroup;
                boundsForInstance = instanceBounds.get(group)!.bounds;
                // Without distance/category variants each shape owns one persistent batch draw.
                if ((group.flags & (0x1e00 | 0x4000)) === 0) {
                  if (boundsForInstance) group.batchDrawBounds.set(shape.ref, boundsForInstance);
                  else {
                    boundsForInstance =
                      group.batchDrawBounds.get(shape.ref) ?? initialInstanceBounds(model, shape);
                    group.batchDrawBounds.set(shape.ref, boundsForInstance);
                  }
                }
                if (!boundsForInstance && selection) {
                  stats.skipped.set(
                    `${model.name}/${shape.name}@${shape.ref}`,
                    "Stage shadow: degenerate instance batch has no published bounds",
                  );
                  continue;
                }
              }
              if (prepared.skin && !prepared.instanceMotion) {
                const at = prepared.nodeIndices[0];
                if (pose && !pose.active[at]) continue;
                const worlds = pose?.worlds ?? poseOf(model);
                const meshWorld = skinMeshWorld(prepared.skin, worlds, worlds[at]);
                meshWorldForSkin = rowsToColumns(meshWorld);
                palette = new Float32Array(STAGE_MAX_BONES * 12);
                skinPalette(prepared.skin, worlds, meshWorld, palette);
                boundsForSkin = skinBounds(
                  prepared.skin,
                  worlds,
                  meshWorld,
                  shapeBounds(shape, "_boundingBoxCenter", 3),
                  shapeBounds(shape, "_boundingBoxSize", 3),
                );
              }
              for (let joint = 0; joint < shape.nodeRefs.length; joint++) {
                const ref = shape.nodeRefs[joint];
                const world = new Float32Array(16);
                const at = prepared.nodeIndices[joint];
                if (pose && at >= 0 && !pose.active[at]) continue;
                if (prepared.instanceMotion) world.set(node.world);
                else
                  multiplyColumns(
                    node.world,
                    meshWorldForSkin ??
                      (pose && at >= 0 ? animatedWorld(pose, at) : meshWorld(model, ref)),
                    world,
                  );
                // Shared instance owners disable batch clipping; admission uses the source camera.
                if (!state.instanceGroup) {
                  const center =
                    boundsForSkin?.center ?? shapeBounds(shape, "_boundingBoxCenter", 3);
                  const size = boundsForSkin?.size ?? shapeBounds(shape, "_boundingBoxSize", 3);
                  const box = shadowCullBox(center, size, affineRows(world), 1);
                  if (box[15] > 1.1920928955078125e-7 && !shadowBoxVisible(box, planes)) continue;
                }
                const sortWorld = state.instanceGroup
                  ? instanceSortWorld(model, ref, prepared.skin)
                  : world;
                const depth = selection
                  ? 0
                  : stageModelDepth(
                      sortWorld,
                      camera.view,
                      camera.projection,
                      prepared.sortDistanceOffset,
                    );
                // Initial instance spheres have already passed through their registered draw provider.
                const sphere = !selection
                  ? null
                  : boundsForInstance
                    ? boundsForInstance.world
                      ? (Array.from(boundsForInstance.sphere) as [number, number, number, number])
                      : casterSphere(boundsForInstance.sphere, sortWorld)
                    : casterSphere(
                        boundsForSkin?.sphere ?? shapeBounds(shape, "_boundingSphere", 4),
                        world,
                      );
                entries.push({
                  key,
                  depth,
                  pass,
                  node,
                  shape: prepared,
                  world,
                  sortWorld,
                  blend,
                  palette,
                  instanceAnimation: state.instanceAnimation && {
                    frame: state.instanceAnimation.frame,
                    source: node.scene.options.animation!(state.instanceAnimation.ordinal)!,
                    previousFrame: state.instanceAnimation.previousFrame ?? 0,
                    previousSource:
                      state.instanceAnimation.previousOrdinal === undefined
                        ? null
                        : node.scene.options.animation!(state.instanceAnimation.previousOrdinal),
                    weight: state.instanceAnimation.weight ?? 1,
                  },
                  textures: swapped,
                  samplerImages,
                  uvOffsets: node.record?.type === 6001010 ? null : stageUvOffsets(node),
                  materialUv,
                  instanceUv,
                  instanceUvFeature,
                  sphere,
                });
              }
            }
          }
          if (state.materialUv && drawIndex !== state.materialUv.cells.values.length) {
            stats.skipped.set(`model node ${node.id}`, "UV animation: draw count changed");
            entries.length = firstEntry;
          }
        }
      if (selection) {
        const instanceDraws = new Map<
          NonNullable<StageModelState["instanceGroup"]>,
          Set<ShapeProgram>
        >();
        const casterSpheres = STAGE_PASSES.flatMap(({ index }) =>
          entries
            .filter((entry) => entry.pass === index)
            .flatMap((entry) => {
              const group = stageModelState(entry.node)!.instanceGroup;
              if (!group) return [entry.sphere!];
              let draws = instanceDraws.get(group);
              if (!draws) instanceDraws.set(group, (draws = new Set()));
              if (draws.has(entry.shape)) return [];
              draws.add(entry.shape);
              return [entry.sphere!];
            }),
        );
        const queued = entries.map((entry) => ({
          ...entry,
          depth: stageModelDepth(
            entry.sortWorld,
            camera.view,
            selection.camera.sortProjection,
            entry.shape.sortDistanceOffset,
          ),
        }));
        selection.queue = {
          skipped: stats.skipped,
          casterSpheres,
          draw: (finalCamera) => scopedDraw({ ...frame, camera: finalCamera }, queued),
        };
        return stats;
      }
      const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array;
      const particleEntries = frame.shadowPass
        ? []
        : [
            ...particles.prepare(
              frame,
              { width: viewport[2], height: viewport[3] },
              stats.skipped,
              sceneNodes,
            ),
            ...starParticles.prepare(frame, stats.skipped, sceneNodes),
          ];
      const primitiveEntries = frame.shadowPass
        ? []
        : [
            ...primitives.prepare(
              frame,
              { width: viewport[2], height: viewport[3] },
              stats.skipped,
              sceneNodes,
            ),
            ...cameraDebug.prepare(frame, { width: viewport[2], height: viewport[3] }, sceneNodes),
            ...primitives3d.prepare(
              frame,
              { width: viewport[2], height: viewport[3] },
              stats.skipped,
              sceneNodes,
            ),
          ];
      const drawEntries: DrawEntry[] = [...entries, ...particleEntries, ...primitiveEntries];
      if (particleEntries.length || primitiveEntries.length) {
        const nodeOrder = new Map(nodes.map((node, index) => [node, index]));
        // Pass-sort ties retain graph traversal followed by the instance-manager flush.
        drawEntries.sort((a, b) => nodeOrder.get(a.node)! - nodeOrder.get(b.node)!);
      }
      const entriesByPass = new Map<number, DrawEntry[]>();
      for (const entry of drawEntries) {
        let group = entriesByPass.get(entry.pass);
        if (!group) entriesByPass.set(entry.pass, (group = []));
        group.push(entry);
      }
      gl.useProgram(program);
      const viewProjection = transpose(camera.viewProjection);
      const cameraView = transpose(camera.view);
      const wind = frame.wind;
      gl.uniform1i(u("shakeEnabled"), wind?.state.enabled ? 1 : 0);
      if (wind?.state.enabled) {
        const [frequency0, frequency1] = stageWindPhases(wind.state, wind.graphicsClock);
        gl.uniform3fv(u("shakeDirection"), wind.state.vector);
        gl.uniform3fv(u("shakeTheta"), wind.state.direction);
        gl.uniform3fv(u("shakeFrequency0"), frequency0);
        gl.uniform3fv(u("shakeFrequency1"), frequency1);
      }
      const groupLights = new Map<number, StageGroupLighting>();
      let current: StageGroupLighting | null = null;
      let currentKey = -1;
      const selectGroup = (group: number, pass: number): StageGroupLighting => {
        const key = pass * 32 + group;
        if (key === currentKey && current) return current;
        let lights = groupLights.get(key);
        if (!lights) groupLights.set(key, (lights = lightingForGroup(lighting, group, pass)));
        currentKey = key;
        current = lights;
        gl.uniform1i(u("ambientEnabled"), lights.ambient ? 1 : 0);
        if (lights.ambient) gl.uniform3fv(u("ambient"), lights.ambient);
        gl.uniform1i(u("hemisphereEnabled"), lights.hemisphere ? 1 : 0);
        if (lights.hemisphere) {
          gl.uniform3fv(u("hemisphereDirection"), lights.hemisphere.direction);
          gl.uniform3fv(u("hemisphereSky"), lights.hemisphere.sky);
          gl.uniform3fv(u("hemisphereGround"), lights.hemisphere.ground);
        }
        gl.uniform1i(u("parallelCount"), lights.parallel.length);
        if (lights.parallel.length) {
          gl.uniform3fv(
            u("parallelDirection"),
            lights.parallel.flatMap((l) => l.direction),
          );
          gl.uniform4fv(
            u("parallelDiffuse"),
            lights.parallel.flatMap((l) => l.diffuse),
          );
          gl.uniform4fv(
            u("parallelSpecular"),
            lights.parallel.flatMap((l) => l.specular),
          );
        }
        gl.uniform1i(u("pointCount"), lights.point.length);
        if (lights.point.length) {
          gl.uniform4fv(
            u("pointPosition"),
            lights.point.flatMap((l) => l.position),
          );
          gl.uniform4fv(
            u("pointDiffuse"),
            lights.point.flatMap((l) => l.diffuse),
          );
          gl.uniform4fv(
            u("pointSpecular"),
            lights.point.flatMap((l) => l.specular),
          );
        }
        if (lights.rim) {
          gl.uniform1i(u("rimMode"), lights.rim.mode);
          gl.uniform3fv(u("rimDirection"), lights.rim.direction);
          gl.uniform4fv(u("rimColorBias"), lights.rim.colorBias);
          gl.uniform1f(u("rimOffset"), lights.rim.offset);
        }
        if (lights.fog) {
          gl.uniform1i(u("fogMode"), lights.fog.mode);
          gl.uniform4fv(u("fogRange"), lights.fog.range);
          gl.uniform4fv(u("fogHeight"), lights.fog.height);
          gl.uniform3fv(u("fogColor"), lights.fog.color);
        }
        return lights;
      };
      gl.uniform1i(u("image0"), 0);
      gl.uniform1i(u("image1"), 1);
      gl.uniform1i(u("environmentImage"), 2);
      gl.uniform1i(u("environmentCube"), ENVIRONMENT_CUBE_UNIT);
      gl.uniform1i(u("reflectionImage"), REFLECTION_UNIT);
      gl.uniform1i(u("rimMaskImage"), RIM_MASK_UNIT);
      gl.uniform1i(u("shadowDepthPass"), frame.shadowPass ? 1 : 0);
      gl.uniform1f(u("shadowAlphaRef"), (frame.shadowPass?.settings.alphaReference ?? 0) / 255);
      gl.uniform1i(u("shadowOutputMode"), frame.shadowPass?.settings.softness ?? 0);
      let boundShadow: StageShadowFrame | undefined | null = null;
      const bindShadow = (shadow: StageShadowFrame | undefined) => {
        if (boundShadow === shadow) return;
        boundShadow = shadow;
        gl.uniform1i(u("shadowCascadeCount"), shadow?.cameras.length ?? 0);
        gl.uniform1i(u("shadowEdgeHide"), shadow?.light.settings.edgeHide ? 1 : 0);
        gl.uniform1i(u("shadowSoftness"), shadow?.light.settings.softness ?? 0);
        gl.uniform1i(u("shadowMomentImage"), 15);
        gl.activeTexture(gl.TEXTURE0 + 15);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, shadow?.moments ?? null);
        gl.uniform1i(u("shadowMomentMode"), shadow?.moments ? 1 : 0);
        gl.bindSampler(15, null);
        for (const [index, unit] of SHADOW_UNITS.entries()) {
          gl.uniform1i(u(`shadowImage${index}`), unit);
          if (shadow) {
            const cascade = Math.min(index, shadow.cameras.length - 1);
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, shadow.textures[cascade]);
            gl.bindSampler(unit, null);
            gl.uniformMatrix4fv(
              u(`shadowMatrix${index}`),
              false,
              transpose(shadow.cameras[cascade].textureMatrix),
            );
          }
        }
        if (shadow) {
          gl.uniform1i(u("shadowColorMode"), shadow.light.settings.colorShadow);
          gl.uniform3fv(u("shadowDirection"), shadow.light.direction);
          gl.uniform3fv(u("shadowDiffuse"), shadow.light.diffuse);
          gl.uniform3fv(u("shadowSpecular"), shadow.light.specular);
          gl.uniform3fv(u("shadowColor"), shadow.light.color);
        }
      };
      gl.uniform1i(u("clipEnabled"), frame.mirror?.clipPlane ? 1 : 0);
      if (frame.mirror) gl.uniform4fv(u("clipPlane"), frame.mirror.plane);
      let boundReflection: StageReflectionFrame | undefined | null = null;
      const bindReflection = (reflection: StageReflectionFrame | undefined) => {
        if (boundReflection === reflection) return;
        boundReflection = reflection;
        if (!reflection) return;
        gl.uniform4fv(u("reflectionNormalRefractive"), [
          ...reflection.light.plane.slice(0, 3),
          reflection.light.refractive,
        ]);
        gl.uniform3fv(u("reflectionColor"), reflection.light.color);
        gl.activeTexture(gl.TEXTURE0 + REFLECTION_UNIT);
        gl.bindTexture(gl.TEXTURE_2D, reflection.texture);
        gl.bindSampler(REFLECTION_UNIT, null);
      };
      gl.uniform1i(u("specularImage"), 3);
      gl.uniform1i(u("normalImage"), 4);
      gl.uniform1i(u("incandescenceImage"), 5);
      BLEND_TEXTURE_UNITS.forEach((unit, index) => gl.uniform1i(u(`blendImage${index}`), unit));
      device.invalidate();
      const needsDepth = (entry: StageParticleEntry | StagePrimitiveEntry) =>
        "requiresDepthSnapshot" in entry && entry.requiresDepthSnapshot;
      const depthNeeded = particleEntries.some(needsDepth) || primitiveEntries.some(needsDepth);
      let depthContext: EffectDrawContext | undefined;
      let colorCaptured = false;
      const runPasses = (list: typeof STAGE_PASSES): void => {
        gl.uniformMatrix4fv(u("viewProjection"), false, viewProjection);
        gl.uniformMatrix4fv(u("cameraView"), false, cameraView);
        gl.uniform3f(u("eyePosition"), camera.position[0], camera.position[1], camera.position[2]);
        boundShadow = null;
        boundReflection = null;
        for (const { index, sort } of list) {
          if (depthNeeded && !depthContext?.depth && index >= DEPTH_SNAPSHOT_FIRST_PASS) {
            if (!frame.snapshotDepth)
              throw new Error("Stage soft-edge particles require a scene depth snapshot");
            depthContext = { ...depthContext, depth: frame.snapshotDepth() };
          }
          const passEntries = entriesByPass.get(index);
          if (!passEntries) continue;
          for (const entry of sortStagePass<DrawEntry>(batchInstances(passEntries), sort)) {
            if ("draw" in entry) {
              if ("requiresDepthSnapshot" in entry) {
                if (entry.requiresColorSnapshot && !colorCaptured) {
                  colorSnapshot ??= createColorSnapshot(gl);
                  colorSnapshot.capture();
                  depthContext = {
                    depth: depthContext?.depth ?? null,
                    color: colorSnapshot.binding,
                  };
                  colorCaptured = true;
                }
                stats.draws += withStageViewport(
                  gl,
                  frame.cameraScopes ? camera.viewport : undefined,
                  frame.scene.options.viewport,
                  () => entry.draw(depthContext),
                );
              } else stats.draws += entry.draw();
              gl.useProgram(program);
              boundShadow = null;
              boundReflection = null;
              device.invalidate();
              continue;
            }
            const { shape, node } = entry;
            const rectangle = frame.cameraScopes ? camera.viewport : undefined;
            const screen = stageViewportRegion(
              rectangle,
              node.scene.options.viewport,
              viewport[2],
              viewport[3],
            );
            const drawModel = () => {
              gl.uniform4f(
                u("screenViewport"),
                viewport[0] + screen[0],
                viewport[1] + screen[1],
                screen[2],
                screen[3],
              );
              const group =
                stageModelState(node)!.instanceGroup?.lightGroup ?? stageLightScope(node).group;
              const lights = selectGroup(group, entry.pass);
              const m = shape.material;
              const model = stageModelState(node)!;
              // Native material binding updates shared backings before the device consumes any slot.
              for (const binding of shape.samplerBindings) {
                if (!binding) continue;
                const image = entry.samplerImages?.[binding.unit] ?? binding.image;
                samplerState.synchronize(gl, image, binding.state, `Stage texture ${image}`);
              }
              for (const binding of shape.samplerBindings) {
                if (!binding) continue;
                const image = entry.samplerImages?.[binding.unit] ?? binding.image;
                const current = samplerState.current(gl, image, `Stage texture ${image}`);
                shape.samplers[binding.unit] = samplerCache.samplerFor(
                  current.parameters,
                  `Stage texture ${image}`,
                );
                shape.lodBias[binding.unit] = current.lodBias;
              }
              const state = stateOf(shape, entry.blend);
              device.apply(frame.mirror ? mirrorDeviceState(state) : state, program, locations);
              gl.uniform1i(
                u("writeOpaqueAlpha"),
                frame.captureAlpha && !state.values[STATE_BLEND] ? 1 : 0,
              );
              if (frame.shadowPass) {
                gl.enable(gl.DEPTH_TEST);
                gl.depthMask(true);
                // The special environment leaves the material depth function and blend intact.
                const writeColor = frame.shadowPass.settings.softness >= 3;
                gl.colorMask(writeColor, writeColor, writeColor, writeColor);
                gl.uniform1f(u("uDepthBias"), f(frame.shadowPass.settings.bias * -0.000001));
                gl.enable(gl.POLYGON_OFFSET_FILL);
                gl.polygonOffset(-frame.shadowPass.settings.slope, 0);
              }
              const shadow = stageGroupShadow(frame.shadows, group);
              bindShadow(shadow);
              const reflection = frame.mirror
                ? undefined
                : stageGroupReflection(frame.reflections, group);
              bindReflection(reflection);
              gl.uniform1i(u("shadowLightEnabled"), shadow ? 1 : 0);
              gl.uniform1i(u("shadowReceiver"), shadow && m.shadowReceiver ? 1 : 0);
              gl.uniformMatrix4fv(u("world"), false, entry.world);
              gl.uniform1i(u("instanceBatch"), entry.instances ? 1 : 0);
              gl.uniform1i(u("hasColors"), shape.hasColors ? 1 : 0);
              gl.uniform1i(u("hasColor1"), shape.hasColor1 ? 1 : 0);
              gl.uniform1i(u("shakeShader"), m.vertexShake && shape.hasColors ? 1 : 0);
              const instanced = node.record?.type === 6001010;
              const instanceFlags = instanced ? (model.instanceGroup?.flags ?? 0) : 0;
              const instanceColorEnabled = (instanceFlags & 2) !== 0;
              gl.uniform1i(u("instanceColorEnabled"), instanceColorEnabled ? 1 : 0);
              gl.uniform1i(u("instanceColorAdd"), (instanceFlags & 0x2000) !== 0 ? 1 : 0);
              gl.uniform1i(u("instanceColorEdge"), (instanceFlags & 0x8000) !== 0 ? 1 : 0);
              if (instanceColorEnabled)
                gl.uniform4fv(u("instanceColor"), unpackColor(model.diffuse ?? 0xffffffff));
              const instanceMotion = shape.instanceMotion;
              gl.uniform1i(u("instanceMotion"), instanceMotion ? 1 : 0);
              if (instanceMotion) {
                const selected = entry.instanceAnimation!;
                const offset = instanceMotion.clips.get(selected.source)!;
                const position = Math.fround(offset + selected.frame);
                const coordinate = Math.fround(position / instanceMotion.width);
                const previousOffset =
                  selected.previousSource && instanceMotion.clips.get(selected.previousSource);
                const previousCoordinate =
                  selected.weight < 1
                    ? f(f((previousOffset || 0) + selected.previousFrame) / instanceMotion.width)
                    : coordinate;
                gl.activeTexture(gl.TEXTURE0 + INSTANCE_MOTION_UNIT);
                gl.bindTexture(gl.TEXTURE_2D, instanceMotion.texture);
                gl.bindSampler(INSTANCE_MOTION_UNIT, null);
                gl.uniform1i(u("instanceMotionTexture"), INSTANCE_MOTION_UNIT);
                gl.uniform4f(
                  u("instanceMotionTextureSize"),
                  instanceMotion.bones,
                  2 / instanceMotion.height,
                  0.5 / instanceMotion.width,
                  0.5 / instanceMotion.height,
                );
                gl.uniform3f(
                  u("instanceMotionFrame"),
                  coordinate,
                  previousCoordinate,
                  selected.weight < 1 ? selected.weight : 1,
                );
                gl.uniform1i(u("instanceMotionHasWeight1"), shape.instanceHasWeight1 ? 1 : 0);
                gl.uniform1i(u("instanceMotionSingleWeight"), shape.instanceSingleWeight ? 1 : 0);
                gl.uniform1i(u("instanceMotionBlend"), (instanceFlags & 8) !== 0 ? 1 : 0);
              }
              const palette = entry.palette;
              gl.uniform1i(u("skinned"), palette ? 1 : 0);
              if (palette) {
                gl.uniform1i(u("skinInfluences"), shape.influences);
                gl.uniform4fv(u("skinRows"), palette);
              }
              gl.uniform1i(u("layerCount"), m.layers.length);
              gl.uniform2i(u("uvSets"), m.layers[0]?.uv ?? 0, m.layers[1]?.uv ?? 0);
              const instanceUv = entry.instanceUv;
              gl.uniform4fv(u("instanceUvOffsetScale"), instanceUv ?? [0, 0, 1, 1]);
              const uvAnimation = instanceUv ? null : entry.materialUv;
              const uvMask =
                entry.instanceUvFeature === null ? m.uvOffsetMask : Number(entry.instanceUvFeature);
              const transforms =
                !entry.uvOffsets && !uvAnimation && uvMask === m.uvOffsetMask
                  ? shape.staticUv
                  : stageUvTransforms(m, entry.uvOffsets, uvAnimation, uvMask);
              gl.uniform4fv(u("uvOffsetScale0"), transforms.layers[0]);
              gl.uniform4fv(u("uvOffsetScale1"), transforms.layers[1]);
              gl.uniform4fv(u("specularOffsetScale"), transforms.specular);
              gl.uniform2f(u("lodBias"), shape.lodBias[0], shape.lodBias[1]);
              gl.uniform3iv(u("layerBlend"), m.layerBlend);
              gl.uniform1i(u("baseMapType"), m.baseMapType);
              gl.uniform1i(u("lighting"), ["constant", "lambert", "phong"].indexOf(m.lighting));
              gl.uniform1i(u("lightModel"), m.lightModel);
              gl.uniform1i(u("hasNormals"), m.hasNormals ? 1 : 0);
              gl.uniform1i(u("hasTexcoords"), m.hasTexcoords ? 1 : 0);
              gl.uniform1i(
                u("rimEnabled"),
                lights.rim && lights.rim.mode !== 0 && m.rimRate !== 0 ? 1 : 0,
              );
              gl.uniform1i(u("rimMask"), m.rimRate !== 0 ? (lights.rim?.rimMask ?? 0) : 0);
              if (
                !frame.shadowPass &&
                m.rimRate !== 0 &&
                lights.rim?.rimMask === 3 &&
                lights.rim.mode !== 0 &&
                m.hasNormals &&
                m.lighting !== "constant"
              ) {
                const texture = lights.rim.depthKey && frame.rimMasks?.get(lights.rim.depthKey);
                if (!texture) throw new Error("Stage rim: depth mask texture is unavailable");
                gl.activeTexture(gl.TEXTURE0 + RIM_MASK_UNIT);
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.bindSampler(RIM_MASK_UNIT, null);
                gl.uniform1i(u("rimMaskImage"), RIM_MASK_UNIT);
              }
              gl.uniform1f(u("rimRate"), m.rimRate);
              gl.uniform1i(
                u("fogEnabled"),
                lights.fog && m.fogRate > 1.1920928955078125e-7 ? 1 : 0,
              );
              gl.uniform1f(u("fogRate"), m.fogRate);
              gl.uniform1i(u("edgeAlphaEnabled"), m.edgeAlpha ? 1 : 0);
              gl.uniform3fv(u("edgeAlpha"), m.edgeAlpha ?? [0, 0, 0]);
              gl.uniform1i(u("fresnelEnabled"), m.fresnel ? 1 : 0);
              gl.uniform3fv(u("fresnel"), m.fresnel ?? [1, 0, 4]);
              gl.uniform4fv(u("diffuseBase"), m.diffuseBase);
              gl.uniform4fv(u("specularBase"), m.specularBase);
              gl.uniform3fv(u("incandescenceBase"), m.incandescenceBase);
              gl.uniform4fv(
                u("systemDiffuse"),
                instanced || model.diffuse === null ? [1, 1, 1, 1] : unpackColor(model.diffuse),
              );
              gl.uniform4fv(
                u("systemSpecular"),
                instanced || model.specular === null ? [1, 1, 1, 1] : unpackColor(model.specular),
              );
              gl.uniform1i(
                u("pixelAlphaTest"),
                (entry.blend ? entry.blend.alphaTest : m.pixelAlphaTest) ? 1 : 0,
              );
              gl.uniform1f(u("pixelAlphaRef"), m.pixelAlphaRef);
              gl.uniform1i(
                u("environmentKind"),
                m.environment && !frame.mirror ? (m.environment.kind === "sphere" ? 1 : 2) : 0,
              );
              gl.uniform1i(
                u("reflectionEnabled"),
                !frame.mirror && reflection && m.environment && m.reflectionOverride ? 1 : 0,
              );
              gl.uniform1i(u("environmentMapType"), m.environment?.mapType ?? 0);
              gl.uniform1f(u("environmentLodBias"), shape.lodBias[2]);
              gl.uniform1i(u("hasSpecularMap"), m.specularMap ? 1 : 0);
              gl.uniform1i(u("specularUv"), m.specularMap?.uv ?? 0);
              gl.uniform1i(u("specularMapType"), m.specularMap?.mapType ?? 0);
              gl.uniform1f(u("specularLodBias"), shape.lodBias[3]);
              gl.uniform1i(u("hasNormalMap"), m.normalMap ? 1 : 0);
              gl.uniform1i(u("normalMapCompressed"), m.normalMap?.compressed ? 1 : 0);
              gl.uniform1i(u("normalUv"), m.normalMap?.uv ?? 0);
              gl.uniform1f(u("normalLodBias"), shape.lodBias[4]);
              gl.uniform4fv(u("normalOffsetScale"), transforms.normal);
              gl.uniform1i(u("blendShader"), m.blendMaps ? 1 : 0);
              if (m.blendMaps) {
                gl.uniform4fv(u("blendOffsetScale"), transforms.blend!);
                gl.uniform1iv(
                  u("blendUv"),
                  m.blendMaps.map((map) => map.uv),
                );
                gl.uniform1fv(
                  u("blendLodBias"),
                  BLEND_TEXTURE_UNITS.map((unit) => shape.lodBias[unit]),
                );
              }
              gl.uniform1i(u("hasIncandescenceMap"), m.incandescenceMap ? 1 : 0);
              gl.uniform1i(u("incandescenceUv"), m.incandescenceMap?.uv ?? 0);
              gl.uniform1i(u("incandescenceMapType"), m.incandescenceMap?.mapType ?? 0);
              gl.uniform1f(u("incandescenceLodBias"), shape.lodBias[5]);
              gl.uniform4fv(u("incandescenceOffsetScale"), transforms.incandescence);
              for (let unit = 0; unit < MAX_TEXTURE_SLOTS; unit++) {
                gl.activeTexture(gl.TEXTURE0 + unit);
                const texture = (entry.textures ?? shape.textures)[unit];
                gl.bindTexture(
                  gl.TEXTURE_2D,
                  unit === 2 && m.environment?.kind === "cube" ? null : texture,
                );
                gl.bindSampler(unit, shape.samplers[unit]);
              }
              for (const unit of BLEND_TEXTURE_UNITS.slice(5)) {
                gl.activeTexture(gl.TEXTURE0 + unit);
                gl.bindTexture(gl.TEXTURE_2D, (entry.textures ?? shape.textures)[unit]);
                gl.bindSampler(unit, shape.samplers[unit]);
              }
              gl.activeTexture(gl.TEXTURE0 + ENVIRONMENT_CUBE_UNIT);
              gl.bindTexture(
                gl.TEXTURE_CUBE_MAP,
                m.environment?.kind === "cube" ? (entry.textures ?? shape.textures)[2] : null,
              );
              gl.bindSampler(ENVIRONMENT_CUBE_UNIT, shape.samplers[2]);
              gl.bindVertexArray(shape.vao);
              if (entry.instances) {
                let stream = instanceStreams.get(shape);
                const needed = entry.instances.length * 27;
                if (!stream || stream.length < needed) {
                  stream = new Float32Array(needed);
                  instanceStreams.set(shape, stream);
                }
                for (const [index, member] of entry.instances.entries()) {
                  const at = index * 27;
                  const state = stageModelState(member.node)!;
                  stream.set(member.world, at);
                  stream.set(unpackColor(state.diffuse ?? 0xffffffff), at + 16);
                  stream.set(member.instanceUv ?? [0, 0, 1, 1], at + 20);
                  const selected = member.instanceAnimation;
                  stream[at + 24] = selected
                    ? f(
                        f(shape.instanceMotion!.clips.get(selected.source)! + selected.frame) /
                          shape.instanceMotion!.width,
                      )
                    : 0;
                  const previousOffset =
                    selected?.previousSource &&
                    shape.instanceMotion!.clips.get(selected.previousSource);
                  stream[at + 25] =
                    selected && selected.weight < 1
                      ? f(
                          f((previousOffset || 0) + selected.previousFrame) /
                            shape.instanceMotion!.width,
                        )
                      : stream[at + 24];
                  stream[at + 26] = selected && selected.weight < 1 ? selected.weight : 1;
                }
                gl.bindBuffer(gl.ARRAY_BUFFER, shape.instanceBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, stream.subarray(0, needed), gl.DYNAMIC_DRAW);
                gl.drawElementsInstanced(
                  gl.TRIANGLE_STRIP,
                  shape.count,
                  shape.indexType,
                  0,
                  entry.instances.length,
                );
              } else gl.drawElements(gl.TRIANGLE_STRIP, shape.count, shape.indexType, 0);
              stats.draws++;
            };
            withStageViewport(gl, rectangle, node.scene.options.viewport, drawModel);
          }
        }
      };
      const settle = () => {
        if (frame.shadowPass) gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.bindVertexArray(null);
        for (let unit = 0; unit < TEXTURE_UNITS; unit++) gl.bindSampler(unit, null);
        device.invalidate();
      };
      if (frame.deferFront) {
        runPasses(BACK_PASSES);
        settle();
        stats.finish = () => {
          const before = stats.draws;
          currentKey = -1;
          gl.useProgram(program);
          device.invalidate();
          runPasses(FRONT_PASSES);
          settle();
          return stats.draws - before;
        };
        return stats;
      }
      runPasses(STAGE_PASSES);
      settle();
      return stats;
    };
    const scopedDraw = (frame: StageFrame, selectedEntries?: readonly Entry[]): StageDrawStats => {
      const rectangle = frame.cameraScopes ? undefined : frame.camera.viewport;
      const stats = withStageViewport(gl, rectangle, frame.scene.options.viewport, () =>
        drawFrame(frame, undefined, selectedEntries),
      );
      if (stats.finish) {
        const finish = stats.finish;
        stats.finish = () => withStageViewport(gl, rectangle, frame.scene.options.viewport, finish);
      }
      return stats;
    };
    initialized.length = 0;
    return {
      draw: scopedDraw,
      prepareShadow(frame, camera) {
        const selection: { camera: StageShadowCamera; queue?: StageShadowQueue } = { camera };
        drawFrame(frame, selection);
        return selection.queue!;
      },
      dispose() {
        for (const entry of [
          ...programs.values(),
          ...[...instancePrograms.values()].flatMap((entries) => [...entries.values()]),
        ]) {
          if (typeof entry === "string") continue;
          gl.deleteVertexArray(entry.vao);
          for (const buffer of entry.buffers) gl.deleteBuffer(buffer);
        }
        for (const motions of instanceMotionTextures.values())
          for (const motion of motions.values()) gl.deleteTexture(motion.texture);
        instanceMotionTextures.clear();
        releaseGeometry();
        programs.clear();
        instancePrograms.clear();
        instanceStreams.clear();
        samplerState.clear();
        samplerCache.dispose();
        particles.dispose();
        starParticles.dispose();
        primitives.dispose();
        primitives3d.dispose();
        cameraDebug.dispose();
        colorSnapshot?.dispose();
        gl.deleteProgram(program);
      },
    };
  } catch (error) {
    for (const release of initialized.reverse()) release();
    throw error;
  }
}
