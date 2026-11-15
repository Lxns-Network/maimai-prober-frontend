import { packSlice, readPack, type Pack } from "../assets/packFormat";
import { readStageGraph, type StageGraph } from "./graph";

export const STAGE_ENGINE = "chunithm-stage";

export interface StageResource {
  readonly ordinal: number;
  readonly name: string;
  readonly magic: string;
  readonly bytes: number;
  readonly entry: string;
}

export interface StageFileMeta {
  readonly role: "base" | "field";
  readonly name: string;
  readonly bytes: number;
  readonly graph: string;
  readonly resources: readonly StageResource[];
}

export interface StageTextureMeta {
  readonly width: number;
  readonly height: number;
  readonly format: string;
  readonly mips: number;
  readonly faces: 1 | 6;
  readonly names: readonly string[];
  readonly tiers: readonly string[];
}

export interface StageMeta {
  readonly id: number;
  readonly dataName: string;
  readonly name: string;
  readonly notesFieldLine: { readonly id: number; readonly str: string };
  readonly files: readonly StageFileMeta[];
  readonly textures: Readonly<Record<string, StageTextureMeta>>;
  readonly nodeTypes: readonly number[];
  readonly motionTypes: readonly number[];
}

export interface StageVertexElement {
  readonly semantic: number;
  readonly type: number;
  readonly index: number;
  readonly offset: number;
  readonly size: number;
}

/** A serialized field of a model object: scalars and vectors keep their raw words. */
export type StageField =
  | string
  | number
  | { readonly u32: number }
  | { readonly u16: number }
  | { readonly ref: number }
  | { readonly refs: readonly number[] }
  | { readonly words: readonly number[] }
  | { readonly raw: string };

export type StageFields = Readonly<Record<string, StageField>>;

/** A texture slot's sampler: device address and filter codes, or why it could not be derived. */
export type StageSampler =
  | {
      readonly addressU: number;
      readonly addressV: number;
      readonly minFilter: number;
      /** Null preserves the filter already held by the backing image. */
      readonly magFilter: number | null;
      readonly mipFilter: number;
      readonly maxAnisotropy: number;
      readonly lodBias: number;
      readonly lodBiasBits: number;
      readonly maxMipLevel: number;
      readonly borderColor: number;
    }
  | { readonly unsupported: string };

export interface StageShapeTexture {
  readonly ordinal: number;
  readonly name: string;
  readonly texture: StageFields;
  readonly image: StageFields;
  readonly id: string;
  readonly sampler?: StageSampler;
}

/** Device state commands of a shape's material, or why they could not be derived. */
export type StageShapeRenderState =
  | { readonly commands: readonly (readonly [number, number])[] }
  | { readonly unsupported: string };

export interface StageShape {
  readonly ref: number;
  readonly name: string;
  readonly fields: StageFields;
  readonly nodeRefs: readonly number[];
  readonly vertexCount: number;
  readonly stride: number;
  readonly layout: readonly StageVertexElement[];
  readonly vertices: Uint8Array;
  readonly indices: Uint16Array | Uint32Array;
  readonly primitiveType: number;
  readonly polygonNumber: number;
  readonly batch: StageFields;
  readonly state: StageFields;
  readonly renderState?: StageShapeRenderState;
  readonly parameters: readonly { readonly name: string; readonly value: StageFields }[];
  readonly textures: readonly StageShapeTexture[];
}

export interface StageModelNode {
  readonly ref: number;
  readonly fields: StageFields;
}

export interface StageModel {
  readonly name: string;
  readonly nodes: readonly StageModelNode[];
  readonly shapes: readonly StageShape[];
}

export interface StagePack {
  readonly meta: StageMeta;
  readonly graphs: { readonly base: StageGraph; readonly field: StageGraph };
  readonly core: Pack;
  /** The model behind a file's resource ordinal. */
  model(role: "base" | "field", ordinal: number): StageModel | null;
  /** The raw animation container behind a file's resource ordinal. */
  animation(role: "base" | "field", ordinal: number): Uint8Array | null;
  /** The texture id behind a file's resource ordinal. */
  texture(role: "base" | "field", ordinal: number): string | null;
}

/** Reads one model container; vertex and index views share its immutable backing bytes. */
export function readStageModel(bytes: Uint8Array, name: string): StageModel {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.subarray(0, 8)) !== "CHSTMS01")
    throw new RangeError("Not a stage model container");
  const length = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + length))) as {
    nodes: StageModelNode[];
    shapes: (Omit<StageShape, "vertices" | "indices"> & {
      vertexOffset: number;
      vertexBytes: number;
      indexOffset: number;
      indexCount: number;
      indexBytes?: 2 | 4;
    })[];
  };
  const base = (12 + length + 15) & ~15;
  return {
    name,
    nodes: header.nodes,
    shapes: header.shapes.map((s) => {
      const { vertexOffset, vertexBytes, indexOffset, indexCount, indexBytes = 4, ...rest } = s;
      if (
        vertexOffset < 0 ||
        indexOffset < 0 ||
        vertexBytes < 0 ||
        indexCount < 0 ||
        base + vertexOffset + vertexBytes > bytes.byteLength ||
        (indexBytes !== 2 && indexBytes !== 4) ||
        base + indexOffset + indexCount * indexBytes > bytes.byteLength
      )
        throw new RangeError("Stage model geometry is outside its container");
      return {
        ...rest,
        vertices: bytes.subarray(base + vertexOffset, base + vertexOffset + vertexBytes),
        indices:
          indexBytes === 2
            ? new Uint16Array(bytes.buffer, bytes.byteOffset + base + indexOffset, indexCount)
            : new Uint32Array(bytes.buffer, bytes.byteOffset + base + indexOffset, indexCount),
      };
    }),
  };
}

/** Reads a stage's core pack: its definition, both node graphs, and its models and animations on demand. */
export function readStagePack(buffer: ArrayBuffer): StagePack {
  const core = readPack(buffer, STAGE_ENGINE);
  const meta = JSON.parse(new TextDecoder().decode(packSlice(core, "meta"))) as StageMeta;
  const file = (role: "base" | "field") => {
    const found = meta.files.find((f) => f.role === role);
    if (!found) throw new RangeError(`Stage ${meta.id} has no ${role} file`);
    return found;
  };
  const graphs = {
    base: readStageGraph(packSlice(core, file("base").graph)),
    field: readStageGraph(packSlice(core, file("field").graph)),
  };
  const models = new Map<string, StageModel>();
  const animations = new Map<string, Uint8Array>();
  const resource = (role: "base" | "field", ordinal: number) =>
    file(role).resources.find((r) => r.ordinal === ordinal) ?? null;
  return {
    meta,
    graphs,
    core,
    model(role, ordinal) {
      const r = resource(role, ordinal);
      if (!r || r.magic !== "AVTS") return null;
      let model = models.get(r.entry);
      if (!model) {
        model = readStageModel(packSlice(core, r.entry), r.name);
        models.set(r.entry, model);
      }
      return model;
    },
    animation(role, ordinal) {
      const r = resource(role, ordinal);
      if (!r || r.magic !== "CVU\0") return null;
      let bytes = animations.get(r.entry);
      if (!bytes) animations.set(r.entry, (bytes = packSlice(core, r.entry)));
      return bytes;
    },
    texture(role, ordinal) {
      const r = resource(role, ordinal);
      if (!r || r.magic !== "DDS ") return null;
      return r.entry.slice("tex/".length);
    },
  };
}
