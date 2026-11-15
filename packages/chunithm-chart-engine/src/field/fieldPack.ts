import { packSlice, type Pack, type PackEntry } from "../assets/packFormat";
import type { PackedUniform } from "../gpu/uniforms";
import type { PlayCameraSnapshot } from "../scene/camera";
import type { Vec3 } from "../stage/camera/math";
import type { FieldWallData } from "./wall";

export type StateCommands = [state: number, value: number][];

export interface FieldSampler {
  readonly addressU: number;
  readonly addressV: number;
  readonly minFilter: number;
  readonly magFilter: number;
  readonly mipFilter: number;
  readonly maxMipLevel: number;
  readonly maxAnisotropy: number;
}

export interface FieldMesh {
  readonly vertexCount: number;
  readonly attributes: ReadonlyMap<
    string,
    { readonly size: number; readonly values: Float32Array }
  >;
  readonly indices: Uint16Array | Uint32Array;
}

export interface FieldShader {
  readonly vertex: string;
  readonly fragment: string;
}

interface WallMeta {
  readonly program: string;
  readonly passIndex: number;
  readonly key: number;
  readonly sortPosition: readonly number[];
  readonly sortDistanceOffset: number;
  readonly stride: number;
  readonly count: number;
  readonly indices: number[];
  readonly textureId: string;
  readonly sampler: FieldSampler;
  readonly commands: StateCommands;
  readonly defaultRawId: number;
  readonly initialRawId: number;
}

interface TrackMeta {
  readonly program: string;
  readonly mesh: string;
  readonly passIndex: number;
  readonly key: number;
  readonly sortMode: number;
  readonly sortPosition: readonly number[];
  readonly sortDistanceOffset: number;
  readonly world4x4: number[];
  readonly commands: StateCommands;
}

interface MaskMeta {
  readonly program: string;
  readonly mesh: string;
  readonly passIndex: number;
  readonly key: number;
  readonly sortMode: number;
  readonly sortPosition: readonly number[];
  readonly sortDistanceOffset: number;
  readonly worldMatrix4x4: number[];
  readonly scalar: number;
  readonly commands: StateCommands;
  readonly scissor: readonly number[] | null;
  readonly supportedFieldStates: number[];
  readonly fieldState: number;
}

export interface FieldStaticMesh {
  readonly mesh: FieldMesh;
  readonly program: string;
  readonly textures: readonly {
    readonly uniform: string;
    readonly unit: number;
    readonly id: string;
    readonly sampler: FieldSampler;
  }[];
  readonly uniforms: Readonly<Record<string, PackedUniform>>;
  readonly commands: StateCommands;
  readonly passIndex: number;
  readonly sortDistanceOffset: number;
  readonly world3x4: number[];
}

export interface FieldStaticModel {
  readonly name: string;
  readonly modelUrl: string;
  readonly key: number;
  readonly meshes: readonly FieldStaticMesh[];
}

export interface FieldDivider {
  readonly mesh: FieldStaticMesh;
  readonly key: number;
  readonly byColor: readonly string[];
}

export interface FieldPackData {
  readonly wall: FieldWallData & {
    readonly meta: WallMeta;
    readonly positions: readonly {
      readonly rawId: number;
      readonly number: number;
      readonly zBits: number;
    }[];
  };
  readonly track: { readonly meta: TrackMeta; readonly mesh: FieldMesh };
  readonly mask: { readonly meta: MaskMeta; readonly mesh: FieldMesh };
  /** Shader pairs by program name: `wall`, `track`, and the program names the mask and models use. */
  readonly shaders: ReadonlyMap<string, FieldShader>;
  readonly statics: readonly FieldStaticModel[];
  readonly dividers: {
    readonly rows: readonly { readonly value: string; readonly label: string }[];
    readonly defaultRow: number;
    readonly defaultColor: number;
    readonly colors: number;
    readonly models: readonly FieldDivider[];
  };
  readonly speedOptions: readonly { readonly value: string; readonly label: string }[];
  readonly camera: {
    readonly environment: { readonly fpcw: number; readonly mxcsr: number };
    readonly camera: PlayCameraEntry;
    readonly sample: { readonly name: string; readonly url: string; readonly sha256: string };
    readonly sampleBytes: Uint8Array;
  };
}

function entryOf(pack: Pack, name: string): PackEntry {
  const entry = pack.entries.get(name);
  if (!entry) throw new RangeError(`Pack entry ${name} missing`);
  return entry;
}

function metaOf<T>(pack: Pack, name: string): T {
  return entryOf(pack, name).meta as T;
}

function decodeMesh(pack: Pack, name: string): FieldMesh {
  const entry = entryOf(pack, name);
  const meta = entry.meta as {
    vertexCount: number;
    attributes: { name: string; size: number; offset: number }[];
    indexType: "u16" | "u32";
    indexCount: number;
    indexOffset: number;
  };
  const bytes = packSlice(pack, name);
  const attributes = new Map<string, { size: number; values: Float32Array }>();
  for (const attribute of meta.attributes) {
    const length = meta.vertexCount * attribute.size;
    const values = new Float32Array(
      bytes.slice(attribute.offset, attribute.offset + length * 4).buffer,
    );
    attributes.set(attribute.name, { size: attribute.size, values });
  }
  const indexBytes = bytes.slice(meta.indexOffset);
  const indices =
    meta.indexType === "u16"
      ? new Uint16Array(indexBytes.buffer, 0, meta.indexCount)
      : new Uint32Array(indexBytes.buffer, 0, meta.indexCount);
  return { vertexCount: meta.vertexCount, attributes, indices };
}

function decodeShader(pack: Pack, name: string): FieldShader {
  const text = new TextDecoder().decode(packSlice(pack, name));
  const split = text.indexOf("\0");
  if (split < 0) throw new RangeError(`Pack entry ${name} holds no shader pair`);
  return { vertex: text.slice(0, split), fragment: text.slice(split + 1) };
}

function decodeZ(pack: Pack): Uint32Array {
  const bytes = packSlice(pack, "field/wall/z");
  const copy = bytes.slice();
  return new Uint32Array(copy.buffer, 0, copy.byteLength / 4);
}

export interface PlayCameraEntry {
  readonly initial: PlayCameraSnapshot;
  readonly state: number;
  readonly world: Vec3;
}

export function readFieldPack(pack: Pack): FieldPackData {
  const wallMeta = metaOf<WallMeta>(pack, "field/wall/meta");
  const template = packSlice(pack, "field/wall/template").slice();
  const zBits = decodeZ(pack);
  const wallPositions = metaOf<{ rows: FieldPackData["wall"]["positions"][number][] }>(
    pack,
    "field/wall/positions",
  ).rows;
  const shaders = new Map<string, FieldShader>();
  const statics: FieldStaticModel[] = [];
  for (const name of pack.entries.keys()) {
    if (name.startsWith("field/shader/"))
      shaders.set(name.slice("field/shader/".length), decodeShader(pack, name));
    if (!name.startsWith("field/static/")) continue;
    const meta = metaOf<{
      modelUrl: string;
      key: number;
      meshes: {
        mesh: string;
        program: string;
        textures: FieldStaticMesh["textures"];
        uniforms: FieldStaticMesh["uniforms"];
        commands: StateCommands;
        passIndex: number;
        sortDistanceOffset: number;
        world3x4: number[];
      }[];
    }>(pack, name);
    statics.push({
      name,
      modelUrl: meta.modelUrl,
      key: meta.key,
      meshes: meta.meshes.map((mesh) => ({
        mesh: decodeMesh(pack, mesh.mesh),
        program: mesh.program,
        textures: mesh.textures,
        uniforms: mesh.uniforms,
        commands: mesh.commands,
        passIndex: mesh.passIndex,
        sortDistanceOffset: mesh.sortDistanceOffset,
        world3x4: mesh.world3x4,
      })),
    });
  }
  const trackMeta = metaOf<TrackMeta>(pack, "field/track/meta");
  const maskMeta = metaOf<MaskMeta>(pack, "field/mask/meta");
  const dividerOptions = metaOf<{
    rows: { value: string; label: string }[];
    defaultRow: number;
    defaultColor: number;
    colors: number;
  }>(pack, "field/divider-options");
  const dividers = dividerOptions.rows.slice(1).map((row) => {
    const meta = metaOf<{
      mesh: string;
      program: string;
      byColor: string[];
      sampler: FieldSampler;
      uniforms: FieldStaticMesh["uniforms"];
      commands: StateCommands;
      passIndex: number;
      key: number;
      sortDistanceOffset: number;
      world3x4: number[];
    }>(pack, `field/divider/${row.value}`);
    if (meta.byColor.length !== dividerOptions.colors)
      throw new RangeError(`Field divider ${row.value} has incomplete colors`);
    return {
      key: meta.key,
      byColor: meta.byColor,
      mesh: {
        mesh: decodeMesh(pack, meta.mesh),
        program: meta.program,
        textures: [{ uniform: "uTexture0", unit: 0, id: meta.byColor[0], sampler: meta.sampler }],
        uniforms: meta.uniforms,
        commands: meta.commands,
        passIndex: meta.passIndex,
        sortDistanceOffset: meta.sortDistanceOffset,
        world3x4: meta.world3x4,
      },
    };
  });
  const camera = metaOf<{
    environment: { fpcw: number; mxcsr: number };
    camera: PlayCameraEntry;
    sample: { name: string; url: string; sha256: string };
  }>(pack, "field/camera/inputs");
  return {
    wall: {
      template,
      zBits,
      stride: wallMeta.stride,
      count: wallMeta.count,
      meta: wallMeta,
      positions: wallPositions,
    },
    track: { meta: trackMeta, mesh: decodeMesh(pack, trackMeta.mesh) },
    mask: { meta: maskMeta, mesh: decodeMesh(pack, maskMeta.mesh) },
    shaders,
    statics,
    dividers: { ...dividerOptions, models: dividers },
    speedOptions: metaOf<{ rows: { value: string; label: string }[] }>(pack, "field/speed-options")
      .rows,
    camera: {
      environment: camera.environment,
      camera: camera.camera,
      sample: camera.sample,
      sampleBytes: packSlice(pack, camera.sample.name).slice(),
    },
  };
}
