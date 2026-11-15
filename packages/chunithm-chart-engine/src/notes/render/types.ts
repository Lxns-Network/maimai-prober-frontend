import type { InstanceBuffer } from "./instanceBuffer";
import type { BandBuffer } from "./bandBuffer";
import type { PassSortMode } from "./drawGroups";

/** One record's evaluated instance data, produced by the note layer. */
export interface NoteInstance {
  /** The u16 sort key from `sortKey(initialKey, layer, widthPriority)`. */
  key: number;
  /** Camera-space depth, for the in-group order. */
  depth: number;
  /** Twelve world-matrix floats. */
  world: Float32Array;
  /**
   * Twelve floats of the joint matrix the scene sort depth is computed from: the mesh's own matrix
   * for a part drawn as one instance of its model's shared group, the instance's world for a part
   * placed on its own.
   */
  sortJoint: Float32Array;
  /** Model entry name this instance draws with, e.g. `note/model/2`. */
  model: string;
  /**
   * Mesh entry name this instance draws, e.g. `mesh/ab12cd34`.
   *
   * A model entry references several meshes and each carries its own material, so one record
   * produces one instance per mesh. The instance names the mesh it is, because a model's parts do
   * not share a program, a blend state or an image.
   */
  mesh: string;
  /**
   * Curve frame this instance's animated materials sample, after the application tick.
   *
   * Takes precedence over `FrameInput.animationFrame`, which an instance without one falls back to.
   * A material that is not animated ignores it.
   */
  frame?: number;
}

/** Which records to draw and how, for one frame. */
export interface FrameInput {
  /** Instances to submit, in the order the note layer produced them. */
  instances: readonly NoteInstance[];
  /**
   * Curve frame shared by every animated instance whose own frame and model resolve to none. A
   * material whose binding names its own clock never takes it.
   */
  animationFrame?: number;
  /**
   * Frame of the animated instances of one model entry, or undefined for a model with none of its own.
   *
   * Consulted only for a material that is animated, after the instance's own `frame` and before the
   * shared `animationFrame`.
   */
  animationFrameOf?: (model: string) => number | undefined;
  /**
   * Bands already written into the band buffer, in the order they were produced.
   *
   * `profile` names the band kind (`note/band/hold`, `note/band/slide/<row>/<texture>`), `key` is
   * the band's sort key, and `scalar` is the pulse value its material multiplies the colour by.
   */
  bands: readonly {
    profile: string;
    first: number;
    vertices: number;
    key: number;
    scalar: number;
  }[];
}

export interface NoteRendererOptions {
  requiredModels?: Iterable<string>;
  /** Complete model set used by this chart; omitted for callers that submit arbitrary models. */
  models?: ReadonlySet<string>;
  /** Instances the buffer must hold; from the corpus census peak. */
  instanceCapacity: number;
  /** Band vertices the buffer must hold; from the corpus census peak. */
  bandVertexCapacity: number;
  /** Sort behaviour per pass index, from the pass table. */
  passSortModes?: ReadonlyMap<number, PassSortMode>;
  /**
   * Pass index a mesh draws in, from the packed material's `pass`.
   *
   * The pass belongs to the *mesh*, not to the model: a model's parts carry their own materials and
   * two parts of one model can sit in different passes (a body in the opaque pass, its effect in the
   * transparent one). Overrides the pass the pack records, for a caller re-batching the pack.
   */
  passOfMesh?: ReadonlyMap<string, number>;
  /**
   * The view-projection matrix every model program reads.
   *
   * The packed shaders cannot compute `gl_Position` without it. The reference takes it from the
   * scene's camera resource, which is not part of the pack and depends on the canvas size, so the
   * caller supplies it rather than this module inventing one.
   */
  viewProjection?: Float32Array | null;
  /** Uploaded textures by unit index, for a pack that records no image names. */
  textures?: ReadonlyMap<number, WebGLTexture>;
  /**
   * Uploaded textures by the image name the pack records, e.g. `tex/ntt_tap_01`.
   *
   * A material's art is named rather than slotted: every material binds slot 0, so the unit index
   * cannot say which image a part samples. When this is given it decides which texture a slot binds.
   */
  texturesByName?: ReadonlyMap<string, WebGLTexture>;
  /** Reports each prepared draw's CPU time in its stats; off by default. */
  timeDraws?: boolean;
}

/** What one frame submitted. */
export interface DrawStats {
  /** `gl.drawXxx` calls issued this frame. */
  draws: number;
  instances: number;
  bandVertices: number;
  cpuMs: number;
}

export interface NoteFrameOrder {
  /** Sort depth of a model part, from the joint it sorts by and its material's distance offset. */
  modelDepth(sortJoint: Float32Array, sortDistanceOffset: number): number;
  bandDepth(profile: string): number;
  /** Camera position instanced groups order their batches by. */
  readonly cameraPosition: ArrayLike<number>;
  /**
   * Identifies everything that has drawn on the context besides this renderer. While it returns the
   * value it returned at the renderer's previous draw, nothing else has touched the context since,
   * and the renderer keeps the fixed-function state that draw left. Without it every draw starts
   * from a context assumed to hold nothing.
   */
  readonly gpuEpoch?: () => number;
}

export interface PreparedNoteDraw {
  readonly pass: number;
  readonly key: number;
  readonly depth: number;
  /** The renderer that prepared the draw; the same object for all of its draws. */
  readonly source: object;
  /** Valid for one submission, until the next frame preparation or disposal. */
  draw(): DrawStats;
}

export interface PreparedNoteFrame {
  readonly entries: readonly PreparedNoteDraw[];
  readonly stats: DrawStats;
}

export interface NoteRenderer {
  ensureModels(models: ReadonlySet<string>): void;
  setViewProjection(matrix: Float32Array): void;
  /** Prepares independent submissions for a caller-owned scene queue, without drawing. */
  prepare(input: FrameInput, order: NoteFrameOrder): PreparedNoteFrame;
  /** Submits one frame. */
  frame(input: FrameInput): DrawStats;
  /** The instance buffer, for callers that write instances themselves. */
  instances(): InstanceBuffer;
  /** The band buffer the band writers fill. */
  bands(): BandBuffer;
  /** Model names whose shader could not be instantiated, so the caller draws them per note. */
  perNoteOnly(): ReadonlySet<string>;
  /** Disposes the GL resources this renderer created. */
  dispose(): void;
}
