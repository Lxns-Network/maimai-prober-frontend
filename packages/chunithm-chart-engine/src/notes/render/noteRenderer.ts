import type {
  NoteInstance,
  FrameInput,
  NoteRendererOptions,
  DrawStats,
  PreparedNoteDraw,
  NoteRenderer,
} from "./types";
import { createRendererResources, releaseResources, type RendererResources } from "./resources";
/**
 * The note renderer: instance buffer, band buffer, grouping and the draws.
 *
 * Per frame the caller supplies the records present at a grid step; each one is evaluated into an
 * instance (or a band) and the instances are submitted grouped by the pass sort key. CPU storage
 * uses the caller's capacity; per-draw GPU streams grow to their peak batch size and are reused.
 *
 * The GL work is deliberately thin: the shaders are the packed ones with `uWorld` rewritten to an
 * instance attribute, so the per-instance data uploaded is the transform. The arithmetic that
 * places a note happens on the CPU, in the note modules, exactly as it
 * does in the reference.
 */

import {
  createInstanceBuffer,
  INSTANCE_FLOATS as BUFFER_FLOATS,
  writeInstanceWorld,
} from "./instanceBuffer";
import { createBandBuffer } from "./bandBuffer";
import { HOLD_VERTEX_BYTES } from "../holdBand";
import { createBandRenderer, type BandBinding, type BandRenderer } from "./bandRenderer";
import {
  createGroupOrder,
  orderInstances,
  rebatchByMesh,
  type GroupOrderState,
} from "./drawGroups";
import {
  INSTANCED_ATTRIBUTES,
  INSTANCED_FLOATS,
  declaresUvTransform,
  instancedShader,
  splitShader,
} from "./notePrograms";
import { applyInstanceLayout } from "./instanceLayout";
import {
  assertDeviceUniforms,
  compileDeviceState,
  createDeviceState,
  DEVICE_UNIFORMS,
  type DeviceStateSet,
  type PackedStateCommand,
} from "../../gpu/deviceState";
import { bindMesh, meshBindingOf, type BoundMesh, type MeshGeometry } from "../../gpu/meshBinding";
import {
  applyPackedTextures,
  applyProgramUniforms,
  createUniformScratch,
  resolveUniforms,
  type PackedUniform,
  type AppliedUniforms,
  type UniformLocations,
} from "../../gpu/uniforms";
import { slotSamplers } from "../../gpu/samplers";
import type { Pack } from "../../assets/packFormat";
import { readUvAnimation, sampleUvTrack, type UvTrack } from "../../assets/uvAnimation";
import { instanceUvBytes } from "./instanceUv";

/** Highest draw-pass index the pack declares; the pass tables use a handful. */
const MAX_PASSES = 64;

function instanceFrame(
  input: FrameInput,
  instance: NoteInstance,
  clocked: boolean,
): number | undefined {
  return (
    instance.frame ??
    input.animationFrameOf?.(instance.model) ??
    (clocked ? undefined : input.animationFrame)
  );
}

/**
 * Builds the renderer.
 *
 * Every shader in the pack is rewritten into an instanced variant and compiled here; the loader's
 * per-note programs are not reused, because the whole point is that the transform travels per
 * instance. A shader that cannot be rewritten is recorded in {@link NoteRenderer.perNoteOnly} so the
 * caller can fall back to one draw per note rather than drawing the wrong thing.
 */
export function createNoteRenderer(
  gl: WebGL2RenderingContext,
  pack: Pack,
  options: NoteRendererOptions,
): NoteRenderer {
  const resources = createRendererResources(gl);
  try {
    return buildNoteRenderer(gl, pack, options, resources);
  } catch (error) {
    releaseResources(gl, resources);
    throw error;
  }
}

function buildNoteRenderer(
  gl: WebGL2RenderingContext,
  pack: Pack,
  options: NoteRendererOptions,
  resources: RendererResources,
): NoteRenderer {
  const instanceBuffer = createInstanceBuffer(options.instanceCapacity);
  const bandBuffer = createBandBuffer(options.bandVertexCapacity);
  const { programs: created, buffers, geometry: createdGeometry } = resources;

  /** Programs whose declared layout matches the instance buffer, keyed by program name. */
  const instanced = new Map<
    string,
    { program: WebGLProgram; locations: number[]; scrollsUv: boolean }
  >();
  /** Programs that could not be rewritten, so the caller knows which models are per-note only. */
  const perNoteOnly = new Set<string>();

  /** Programs the band entries draw with; they carry no `uWorld`, so instancing does not apply. */
  const bandPrograms = new Set<string>();
  for (const [name, entry] of pack.entries) {
    if (entry.kind !== "table" || !name.startsWith("note/band/")) continue;
    const program = (entry.meta as { program?: unknown }).program;
    if (typeof program === "string") bandPrograms.add(program);
  }

  for (const [name, entry] of pack.entries) {
    if (entry.kind !== "shader") continue;
    const source = new TextDecoder().decode(
      pack.bytes.subarray(entry.offset, entry.offset + entry.length),
    );
    const { vertex, fragment } = splitShader(new TextEncoder().encode(source));
    const rewritten = instancedShader(vertex, fragment);
    if (!rewritten) {
      if (!bandPrograms.has(name.slice("shader/".length)))
        perNoteOnly.add(name.slice("shader/".length));
      continue;
    }
    const program = compile(gl, rewritten.vertex, rewritten.fragment, created);
    const locations = INSTANCED_ATTRIBUTES.map((attribute) =>
      gl.getAttribLocation(program, attribute),
    );
    if (locations.some((location) => location < 0)) {
      // An attribute the shader optimized away cannot be bound by index; treat the program as
      // unusable for instancing rather than binding a mismatched layout.
      gl.deleteProgram(program);
      created.pop();
      perNoteOnly.add(name.slice("shader/".length));
      continue;
    }
    instanced.set(name.slice("shader/".length), {
      program,
      locations,
      scrollsUv: declaresUvTransform(fragment),
    });
  }

  /**
   * One material: what one mesh of a model draws with.
   *
   * A model's meshes do not all draw alike — an effect part takes a different shader, a different
   * blend state and a different image from the body — so everything that varies per part lives here
   * rather than on the model.
   */
  interface MaterialBinding {
    /** The mesh this material draws. */
    readonly bound: BoundMesh;
    /** The mesh's packed entry name, which is what an instance names. */
    readonly mesh: string;
    /** Draw pass this material's model entry belongs to. */
    readonly pass: number;
    /** Fixed-function state the material draws with, checked at build time. */
    readonly state: DeviceStateSet;
    readonly program: WebGLProgram;
    readonly instanceLocations: readonly number[];
    readonly locations: UniformLocations;
    readonly uniforms: Readonly<Record<string, PackedUniform>>;
    /** Sampler slot to the image name that slot samples; empty when the pack records no names. */
    readonly textureNames: readonly (string | null)[];
    /** The unit each sampler slot binds, as the pack recorded it. */
    readonly units: readonly number[];
    /** The sampler each slot is read through, built from the state the pack records for it. */
    readonly samplers: readonly WebGLSampler[];
    readonly uvTracks: readonly UvTrack[];
    /** Whether the binding names the model's own clock, which the shared frame never stands in for. */
    readonly clocked: boolean;
    /** Whether the animated UV transform reaches the shader through the instance colour's bytes. */
    readonly uvBytes: boolean;
    readonly sortDistanceOffset: unknown;
    /** This material's position in its model's material list, which is the mesh's own order. */
    readonly order: number;
  }

  /**
   * Everything one model entry needs to draw: one material per mesh, in the entry's own order.
   *
   * Resolved here, once, because every part of it is a build-time property: the frame path must not
   * call `getUniformLocation`, bind a mesh's buffers, or look a texture up by name.
   */
  interface ModelBinding {
    readonly materials: readonly MaterialBinding[];
    /** Materials by the mesh they draw, for the frame path's per-instance lookup. */
    readonly byMesh: ReadonlyMap<string, MaterialBinding>;
  }

  const modelBindings = new Map<string, ModelBinding>();
  /** Why a model entry was left out of `modelBindings`, when the reason is its own data. */
  const unusableReasons = new Map<string, string>();
  /** Vertex arrays by the program-and-mesh pair, because a vertex array carries its program's locations. */
  const meshCache = new Map<string, BoundMesh>();
  /** Mesh geometry by mesh name; the buffers are shared across programs. */
  const geometryCache = new Map<string, MeshGeometry>();
  const textureUnits = options.textures ?? new Map<number, WebGLTexture>();
  const textureByName = options.texturesByName;
  const animations = new Map<string, readonly UvTrack[]>();
  for (const [name, entry] of pack.entries)
    if (entry.kind === "uvc")
      animations.set(
        name,
        readUvAnimation(pack.bytes.subarray(entry.offset, entry.offset + entry.length)).tracks,
      );
  const uvScratch = new Float32Array(4);

  const loadModels = (wanted?: ReadonlySet<string>, required?: Iterable<string>) => {
    for (const [name, entry] of pack.entries) {
      if (entry.kind !== "table" || !name.startsWith("note/model/")) continue;
      if ((wanted && !wanted.has(name)) || modelBindings.has(name)) continue;
      const meta = entry.meta as { materials?: unknown; meshes?: unknown };
      const meshNames = Array.isArray(meta.meshes) ? (meta.meshes as unknown[]) : [];
      if (meshNames.length === 0) continue;

      // A model entry that carries no materials predates the per-material record; it is skipped rather
      // than drawn with a guessed program, because every one of its parts would be wrong.
      const materialRecords = Array.isArray(meta.materials) ? meta.materials : [];
      if (materialRecords.length !== meshNames.length)
        throw new RangeError(
          `Model ${name} has ${meshNames.length} meshes and ${materialRecords.length} materials`,
        );

      const materials: MaterialBinding[] = [];
      let usable = true;
      for (const [index, raw] of materialRecords.entries()) {
        const material = raw as {
          program?: unknown;
          pass?: unknown;
          sortDistanceOffset?: unknown;
          uniforms?: unknown;
          textures?: unknown;
          samplers?: unknown;
          textureNames?: unknown;
          uvAnimation?: { resource: string; tracks: readonly number[]; loop?: unknown };
          instanceUvBytes?: unknown;
        };
        const programName = typeof material.program === "string" ? material.program : null;
        const binding = programName ? instanced.get(programName) : undefined;
        // A material whose shader could not be instantiated takes the whole model out rather than
        // being drawn with a mismatched layout; `perNoteOnly` already names it for the caller.
        if (!programName || !binding) {
          perNoteOnly.add(programName ?? name.slice("note/model/".length));
          usable = false;
          break;
        }
        const meshName = meshNames[index];
        if (typeof meshName !== "string")
          throw new RangeError(`Model ${name} names a non-string mesh`);
        const cacheKey = `${programName}|${meshName}`;
        let bound = meshCache.get(cacheKey);
        if (!bound) {
          const info = meshBindingOf(pack, meshName);
          bound = bindMesh(
            gl,
            { name: meshName, ...info },
            info.bytes,
            attributeLocations(gl, binding.program),
            createdGeometry,
            geometryCache.get(meshName),
          );
          // Cache the geometry by mesh alone (it is program-independent) and the vertex array by the
          // pair, since the pair is what carries the program's locations.
          geometryCache.set(meshName, bound.geometry);
          meshCache.set(cacheKey, bound);
        }
        const uvTracks: UvTrack[] = [];
        const clocked = material.uvAnimation?.loop !== undefined;
        if (clocked && material.uvAnimation?.loop !== true)
          throw new RangeError(`Material ${name} has a clock binding that does not loop`);
        if (material.uvAnimation) {
          const { resource, tracks } = material.uvAnimation;
          const available = animations.get(resource);
          if (!available || !Array.isArray(tracks) || tracks.length === 0)
            throw new RangeError(`Material ${name} has an invalid UV resource binding`);
          for (const track of tracks) {
            if (!Number.isInteger(track) || track < 0 || !available[track])
              throw new RangeError(`Material ${name} names missing UV track ${track}`);
            uvTracks.push(available[track]);
          }
        }
        const uvBytes = material.instanceUvBytes;
        const uvBytesProblem =
          uvBytes === undefined
            ? null
            : uvBytes !== true
              ? "marks its instance colour UV transform with a value other than true"
              : uvTracks.length === 0
                ? "carries its UV transform in the instance colour but has no UV animation"
                : null;
        if (uvBytesProblem) {
          unusableReasons.set(name, `mesh ${meshName} ${uvBytesProblem}`);
          usable = false;
          break;
        }
        const uniforms = (material.uniforms ?? {}) as Record<string, PackedUniform>;
        if (binding.scrollsUv && uvTracks.length === 0 && !("uUvOffsetScale" in uniforms)) {
          unusableReasons.set(
            name,
            `mesh ${meshName} scrolls its UV with neither a UV binding nor a packed transform`,
          );
          usable = false;
          break;
        }
        // `uViewProjection` is a shader uniform that no model entry declares, so it is resolved here
        // alongside the packed block rather than being left to the frame path.
        const locations = resolveUniforms(gl, binding.program, uniforms, [
          "uViewProjection",
          ...(uvTracks.length ? ["uUvOffsetScale"] : []),
          ...DEVICE_UNIFORMS,
        ]);
        const state = compileDeviceState(stateCommandsOf(name, material), `${name} part ${index}`);
        assertDeviceUniforms(state, locations, `${name} part ${index}`);
        // The image each sampler slot samples, by name. The pack's `textures` list gives the *unit* a
        // slot binds, which every model shares; the name is the part that distinguishes one part's art
        // from another's. A pack without names leaves this empty so the caller's unit map still works.
        const rawNames = Array.isArray(material.textureNames) ? material.textureNames : [];
        const slots = Array.isArray(material.textures) ? (material.textures as number[]) : [];
        const textureNames = slots.map((_, slot) =>
          typeof rawNames[slot] === "string" ? (rawNames[slot] as string) : null,
        );
        let samplers: WebGLSampler[];
        try {
          samplers = slotSamplers(
            gl,
            resources.samplers,
            material.samplers,
            slots.length,
            `Model ${name} part ${index}`,
          );
        } catch (error) {
          if (!(error instanceof RangeError)) throw error;
          unusableReasons.set(name, error.message);
          usable = false;
          break;
        }
        materials.push({
          bound,
          order: index,
          mesh: meshName,
          pass: resolveMaterialPass(name, meshName, material.pass, options),
          state,
          program: binding.program,
          instanceLocations: binding.locations,
          locations,
          uniforms,
          textureNames,
          units: slots,
          samplers,
          uvTracks,
          clocked,
          uvBytes: uvBytes === true,
          sortDistanceOffset: material.sortDistanceOffset,
        });
      }
      if (!usable) continue;
      const byMesh = new Map<string, MaterialBinding>();
      for (const material of materials) {
        if (byMesh.has(material.mesh))
          throw new RangeError(`Model ${name} lists mesh ${material.mesh} more than once`);
        byMesh.set(material.mesh, material);
      }
      modelBindings.set(name, { materials, byMesh });
    }

    for (const name of required ?? [])
      if (!modelBindings.get(name)?.materials.length) {
        const reason = unusableReasons.get(name);
        throw new RangeError(
          `Required model ${name} has no usable material bindings${reason ? `: ${reason}` : ""}`,
        );
      }
  };
  loadModels(options.models, options.requiredModels);
  const instanceGlBuffer = gl.createBuffer();
  if (!instanceGlBuffer) throw new Error("An instance buffer is required");
  buffers.push(instanceGlBuffer);
  const bandGlBuffer = gl.createBuffer();
  if (!bandGlBuffer) throw new Error("A band buffer is required");
  buffers.push(bandGlBuffer);
  gl.bindBuffer(gl.ARRAY_BUFFER, bandGlBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, bandBuffer.bytes().byteLength, gl.DYNAMIC_DRAW);

  // The instance layout is the contract with `INSTANCED_ATTRIBUTES`; the stride and offsets must
  // match `INSTANCE_FLOATS` or an instance reads its neighbour's data.
  if (INSTANCED_FLOATS !== BUFFER_FLOATS)
    throw new RangeError("The shader and buffer instance strides disagree");
  // Each draw gets separate instance storage: overwriting a submitted draw's buffer causes
  // expensive driver synchronization on mobile. Three frame sets keep recent draws intact.
  const instanceStreams: { buffer: WebGLBuffer; capacity: number }[][] = [
    [{ buffer: instanceGlBuffer, capacity: INSTANCED_FLOATS * 4 }],
    [],
    [],
  ];
  let instanceStreamIndex = 0;
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceGlBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, INSTANCED_FLOATS * 4, gl.STREAM_DRAW);
  // The instance attributes are per program's locations, so they are applied to each mesh's vertex
  // array together with that mesh's own attributes — one vertex array per (program, mesh) pair.
  for (const [key, bound] of meshCache) {
    const programName = key.slice(0, key.indexOf("|"));
    const binding = instanced.get(programName);
    if (!binding) continue;
    gl.bindVertexArray(bound.vertexArray);
    // The mesh's own attributes were already pointed by `bindMesh`; re-pointing them here would be
    // redundant, so only the instance slots are added.
    applyInstanceLayout(asLayoutTarget(gl), binding.locations, gl.FLOAT);
  }
  gl.bindVertexArray(null);

  // The ordering runs every frame, so its storage is allocated here, once, at the capacity the
  // caller passed. The per-pass key and depth columns are shared: every pass writes its own members
  // in and consumes the ordering before the next pass touches them.
  const orderState: GroupOrderState = createGroupOrder(options.instanceCapacity);
  const passKeys = new Int32Array(options.instanceCapacity);
  const passDepths = new Float64Array(options.instanceCapacity);
  /** Per pass: the member indices, as a slice of a shared column. */
  const passMembers = new Int32Array(options.instanceCapacity);
  /**
   * The material each instance draws with, by instance index, or null when its model has none.
   *
   * Resolved once per frame because the pass comes from it and the draw loop reads it per instance;
   * looking the model up again inside the sort-ordered loop would repeat the same map probe per draw.
   */
  const materials: (MaterialBinding | null)[] = new Array(options.instanceCapacity).fill(null);
  /**
   * The mesh's own position inside its model's mesh list, per instance.
   *
   * The re-batch below uses it to tell one record's parts from the next record's without comparing
   * names: a record's parts must strictly increase, so a value that does not increase starts a new
   * record. It is the *position*, not the mesh name, because the same mesh can back two models.
   */
  const meshOrder = new Int32Array(options.instanceCapacity);
  /** One span's re-batched order, assembled into {@link batchedOrder} as the group is walked. */
  const batchedScratch = new Int32Array(options.instanceCapacity);
  /** The group's draw order after re-batching; only read up to the count the walk assembled. */
  const batchedOrder = new Int32Array(options.instanceCapacity);
  /**
   * Frame cursors, held here rather than in `frame()`'s body so the draw emitter can advance them
   * without being handed them back. Reset at the top of every frame.
   */
  let written = 0;
  let draws = 0;
  /** Per pass: where that pass's members start in `passMembers`. */
  const passStart = new Int32Array(MAX_PASSES);
  const passCount = new Int32Array(MAX_PASSES);
  const passOrder = new Int32Array(MAX_PASSES);
  /** Write cursor per pass during the bucketing pass; reset each frame. */
  const passFill = new Int32Array(MAX_PASSES);
  const sortModes = options.passSortModes;

  /** Number of distinct passes the current frame submitted. */
  let passOrderCount = 0;
  /** The stats object `frame()` returns, written in place so the frame path allocates nothing. */
  const stats: DrawStats = { draws: 0, instances: 0, bandVertices: 0, cpuMs: 0 };
  /** Tracks the fixed-function state the context holds, so a draw sets only what changed. */
  const deviceState = createDeviceState(gl);
  /** Uniform upload scratch, so a frame's uploads allocate nothing. */
  const uniformScratch = createUniformScratch();
  /** A 16-float view-projection, filled once per frame from the caller's 3x4-free matrix. */
  const viewProjectionMatrix = new Float32Array(16);
  /** Counts frame preparations and frames; the view-projection is uploaded once per program per count. */
  let frameSerial = 0;
  const viewProjectionSerial = new Map<WebGLProgram, number>();
  /** The packed block each program last received. */
  const programUniforms: AppliedUniforms = new Map();
  const timeDraws = options.timeDraws === true;
  /** The epoch of the previous prepared draw; undefined when the context's state is not known. */
  let drawEpoch: number | undefined;
  const drawSource = {};

  /**
   * Fills `materials` and `meshOrder` for this frame's instances.
   *
   * An instance whose model or mesh has no binding gets null, which the caller reports through
   * `perNoteOnly`. A mesh the model does not carry is an error rather than null: the instance names
   * a mesh the model was never built with, which no later check would attribute to this step.
   */
  const resolveMaterials = (instances: readonly NoteInstance[]): void => {
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      const binding = modelBindings.get(instance.model);
      if (!binding) {
        materials[i] = null;
        continue;
      }
      const material = binding.byMesh.get(instance.mesh);
      if (!material)
        throw new RangeError(`Model ${instance.model} carries no mesh named ${instance.mesh}`);
      materials[i] = material;
      meshOrder[i] = material.order;
    }
  };

  /**
   * Uploads the view-projection matrix every model program reads.
   *
   * The packed shaders declare `mat4 uViewProjection` and read it as `uViewProjection * vector`,
   * which is the column-vector convention: `uniformMatrix4fv` with `transpose = false` reads its
   * argument as a sequence of *columns*, so a row-major matrix has to be transposed on the way in.
   * Uploading it as stored puts the camera's translation on the wrong row and every vertex comes out
   * behind the viewer — no error, an empty frame.
   *
   * A caller that supplies a 12-float 3x4 matrix gets it widened with the implicit last row
   * `(0, 0, 0, 1)`, which is what the reference's camera produces.
   */
  const uploadViewProjection = (
    target: WebGL2RenderingContext,
    locations: UniformLocations,
    matrix: Float32Array,
  ): void => {
    const location = locations.get("uViewProjection");
    if (location === undefined || location === null) return;
    if (matrix.length === 16) {
      const out = viewProjectionMatrix;
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++) out[col * 4 + row] = matrix[row * 4 + col];
      target.uniformMatrix4fv(location, false, out);
      return;
    }
    if (matrix.length !== 12)
      throw new RangeError(
        `A view-projection matrix is twelve or sixteen floats, got ${matrix.length}`,
      );
    // The 3x4 case widens first, then transposes, so both paths produce the same columns.
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++)
        viewProjectionMatrix[col * 4 + row] = row < 3 ? matrix[row * 4 + col] : col === 3 ? 1 : 0;
    target.uniformMatrix4fv(location, false, viewProjectionMatrix);
  };

  const bandRenderer: BandRenderer = (resources.bandRenderer = createBandRenderer({
    gl,
    pack,
    state: deviceState,
    vertexBuffer: bandGlBuffer,
    texturesByName: textureByName,
    compile: (vertex, fragment) => compile(gl, vertex, fragment, created),
    uploadViewProjection: (program, locations, matrix) => {
      if (viewProjectionSerial.get(program) === frameSerial) return;
      viewProjectionSerial.set(program, frameSerial);
      uploadViewProjection(gl, locations, matrix);
    },
    programUniforms,
  }));
  // A band draws in the pass its profile names, among that pass's note groups by sort key. Only a pass
  // that orders by key ascending can merge the two sequences, so a band in any other pass is refused.
  for (const binding of bandRenderer.bindings.values()) {
    if (binding.pass < 0 || binding.pass >= MAX_PASSES)
      throw new RangeError(
        `Band ${binding.name} names pass ${binding.pass}, outside 0..${MAX_PASSES - 1}`,
      );
    const mode = options.passSortModes?.get(binding.pass) ?? "keyAscending";
    if (mode !== "keyAscending")
      throw new RangeError(
        `Band ${binding.name} is in pass ${binding.pass}, which sorts by ${mode}`,
      );
  }
  /** Most bands a frame can hold: a band is at least one triangle. */
  const maxBands = Math.max(1, Math.floor(options.bandVertexCapacity / 3));
  const bandOrderState: GroupOrderState = createGroupOrder(maxBands);
  const bandKeys = new Int32Array(maxBands);
  const bandDepths = new Float64Array(maxBands);
  /** This frame's bands that belong to the pass being drawn, as indices into `FrameInput.bands`. */
  const bandMembers = new Int32Array(maxBands);
  /** The binding of each of this frame's bands, resolved once so the pass loop does not look up names. */
  const frameBandBindings: (BandBinding | null)[] = new Array(maxBands).fill(null);
  /** Passes a band added to this frame's list, cleared again at the end of the frame. */
  const passListed = new Uint8Array(MAX_PASSES);
  const bandBytesView = bandBuffer.bytes();
  const bandBytes = new Uint8Array(
    bandBytesView.buffer,
    bandBytesView.byteOffset,
    bandBytesView.byteLength,
  );

  let bandTotal = 0;
  let bandNext = 0;
  /** Collects this frame's bands of `pass` in draw order: by sort key, equal keys in arrival order. */
  const beginBands = (input: FrameInput, pass: number): void => {
    let members = 0;
    for (let b = 0; b < input.bands.length; b++) {
      const binding = frameBandBindings[b];
      if (binding === null || binding.pass !== pass) continue;
      bandKeys[members] = input.bands[b].key;
      bandMembers[members++] = b;
    }
    bandTotal = members;
    bandNext = 0;
    // Every band of one pass takes the same depth in the reference (a fixed sort position), so the
    // key decides and equal keys keep arrival order.
    if (members > 0) orderInstances(bandKeys, bandDepths, members, "keyAscending", bandOrderState);
  };
  /** Draws the pending bands whose key does not exceed `limit`; a band precedes notes of an equal key. */
  const drawBandsUpTo = (
    input: FrameInput,
    limit: number,
    viewProjection: Float32Array | null,
  ): void => {
    while (bandNext < bandTotal) {
      const slot = bandOrderState.order[bandNext];
      if (bandKeys[slot] > limit) return;
      const band = input.bands[bandMembers[slot]];
      bandNext++;
      bandRenderer.draw(band.profile, band.first, band.vertices, band.scalar, viewProjection);
      draws++;
    }
  };

  /**
   * Emits one re-batched span: the instances are already in draw order, so this walks it and issues
   * one draw per run of a single material.
   */
  const drawBatched = (
    target: WebGL2RenderingContext,
    input: FrameInput,
    start: number,
    end: number,
    order: Int32Array,
    viewProjection: Float32Array | null,
  ): void => {
    let at = 0;
    while (at < end) {
      const slot = passMembers[start + order[at]];
      const instance = input.instances[slot];
      const material = materials[slot];
      let runEnd = at;
      if (material === null) {
        // A model with no usable material was reported through `perNoteOnly`; its instances are
        // skipped rather than drawn with the wrong program or texture slots.
        while (runEnd < end && materials[passMembers[start + order[runEnd]]] === null) runEnd++;
        at = runEnd;
        continue;
      }
      const batchModel = instance.model;
      const batchMesh = instance.mesh;
      const animated = material.uvTracks.length > 0;
      const batchFrame = animated ? instanceFrame(input, instance, material.clocked) : undefined;
      const base = written;
      const floats = instanceBuffer.floats();
      while (runEnd < end) {
        const nextSlot = passMembers[start + order[runEnd]];
        const next = input.instances[nextSlot];
        if (next.model !== batchModel || next.mesh !== batchMesh) break;
        if (runEnd > at && animated && instanceFrame(input, next, material.clocked) !== batchFrame)
          break;
        writeInstanceWorld(floats, written * INSTANCED_FLOATS, next.world);
        written++;
        runEnd++;
      }
      const instances = written - base;
      at = runEnd;

      target.useProgram(material.program);
      deviceState.apply(material.state, material.program, material.locations);
      if (viewProjection && viewProjectionSerial.get(material.program) !== frameSerial) {
        viewProjectionSerial.set(material.program, frameSerial);
        uploadViewProjection(target, material.locations, viewProjection);
      }
      applyProgramUniforms(
        target,
        programUniforms,
        material.program,
        material.locations,
        material.uniforms,
        uniformScratch,
      );
      if (animated) {
        if (batchFrame === undefined)
          throw new RangeError("Animated material requires a synchronized animation frame");
        for (const track of material.uvTracks) sampleUvTrack(track, batchFrame, uvScratch);
        if (material.uvBytes) instanceUvBytes(uvScratch);
        const location = material.locations.get("uUvOffsetScale");
        if (location === undefined || location === null)
          throw new RangeError("Animated material has no UV transform uniform");
        target.uniform4fv(location, uvScratch);
      }
      if (material.units.length > 0)
        applyPackedTextures(
          target,
          material.program,
          material.units,
          textureUnits,
          material.textureNames,
          textureByName,
          material.samplers,
        );

      const streams = instanceStreams[frameSerial % instanceStreams.length];
      const streamIndex = instanceStreamIndex++;
      let stream = streams[streamIndex];
      if (!stream) {
        const buffer = target.createBuffer();
        if (!buffer) throw new Error("An instance buffer is required");
        buffers.push(buffer);
        stream = streams[streamIndex] = { buffer, capacity: 0 };
      }
      target.bindBuffer(target.ARRAY_BUFFER, stream.buffer);
      const bytes = instances * INSTANCED_FLOATS * 4;
      if (stream.capacity < bytes) {
        stream.capacity = 2 ** Math.ceil(Math.log2(bytes));
        target.bufferData(target.ARRAY_BUFFER, stream.capacity, target.STREAM_DRAW);
      }
      target.bufferSubData(
        target.ARRAY_BUFFER,
        0,
        floats,
        base * INSTANCED_FLOATS,
        instances * INSTANCED_FLOATS,
      );
      target.bindVertexArray(material.bound.vertexArray);
      for (let column = 0; column < material.instanceLocations.length; column++)
        target.vertexAttribPointer(
          material.instanceLocations[column],
          3,
          target.FLOAT,
          false,
          INSTANCED_FLOATS * 4,
          column * 3 * 4,
        );
      target.drawElementsInstanced(
        target.TRIANGLES,
        material.bound.geometry.indexCount,
        material.bound.geometry.indexType,
        0,
        instances,
      );
      for (let slot = 0; slot < material.samplers.length; slot++) target.bindSampler(slot, null);
      draws++;
    }
  };

  let disposed = false;
  let preparation = 0;
  const identityOrder = new Int32Array(options.instanceCapacity);
  for (let i = 0; i < identityOrder.length; i++) identityOrder[i] = i;
  /** Per instance, the merged run it belongs to; instances of one run are drawn by one call. */
  const runOf = new Int32Array(options.instanceCapacity);
  /** Per run, where its members start in `passMembers` and how many there are. */
  const runStart = new Int32Array(options.instanceCapacity + 1);
  const runCount = new Int32Array(options.instanceCapacity);
  const runDrawn = new Uint8Array(options.instanceCapacity);
  const instanceDepths = new Float64Array(options.instanceCapacity);
  /** The latest instance of each sort-position class, per pass; cleared at every preparation. */
  const classLast: Map<number, number>[] = [];
  const depthBits = new Uint32Array(1);
  const depthFloat = new Float32Array(depthBits.buffer);
  const sortPosition = (pass: number, key: number, depth: number): number | null => {
    const mode = sortModes?.get(pass);
    if (mode === undefined) return null;
    depthFloat[0] = depth === 0 ? 0 : depth;
    return mode === "depthAscending" || mode === "depthDescending"
      ? depthBits[0]
      : key * 4294967296 + depthBits[0];
  };
  const finiteDepth = (value: number): number => {
    if (!Number.isFinite(value) || Math.fround(value) !== value)
      throw new RangeError("Draw depth must be a finite float32");
    return value;
  };

  return {
    ensureModels(models) {
      loadModels(models, models);
      gl.bindBuffer(gl.ARRAY_BUFFER, instanceGlBuffer);
      for (const [key, bound] of meshCache) {
        const binding = instanced.get(key.slice(0, key.indexOf("|")))!;
        gl.bindVertexArray(bound.vertexArray);
        applyInstanceLayout(asLayoutTarget(gl), binding.locations, gl.FLOAT);
      }
      gl.bindVertexArray(null);
    },
    setViewProjection(matrix) {
      options.viewProjection = matrix;
    },
    prepare(input, order) {
      if (disposed) throw new Error("The note renderer has been disposed");
      const stamp = ++preparation;
      frameSerial++;
      instanceStreamIndex = 0;
      if (input.instances.length > options.instanceCapacity || input.bands.length > maxBands)
        throw new RangeError("Prepared frame exceeds renderer capacity");
      resolveMaterials(input.instances);
      const entries: PreparedNoteDraw[] = [];
      const frameStats: DrawStats = { draws: 0, instances: 0, bandVertices: 0, cpuMs: 0 };
      const viewProjection = options.viewProjection ?? null;
      written = 0;
      draws = 0;
      const entry = (
        pass: number,
        key: number,
        depth: number,
        submit: () => DrawStats,
        covered?: () => boolean,
      ) => {
        if (!Number.isInteger(key) || key < 0 || key > 0xffff)
          throw new RangeError("Draw key must be a u16");
        finiteDepth(depth);
        let submitted = false;
        entries.push({
          pass,
          key,
          depth,
          source: drawSource,
          draw() {
            if (disposed) throw new Error("The note renderer has been disposed");
            if (stamp !== preparation) throw new Error("Prepared note frame expired");
            if (submitted) throw new Error("Prepared note draw already submitted");
            submitted = true;
            if (covered?.()) return { draws: 0, instances: 0, bandVertices: 0, cpuMs: 0 };
            const started = timeDraws ? performance.now() : 0;
            const epoch = order.gpuEpoch?.();
            if (epoch === undefined || epoch !== drawEpoch) deviceState.invalidate();
            drawEpoch = undefined;
            try {
              const result = submit();
              drawEpoch = epoch;
              if (timeDraws) result.cpuMs = performance.now() - started;
              frameStats.draws += result.draws;
              frameStats.instances += result.instances;
              frameStats.bandVertices += result.bandVertices;
              frameStats.cpuMs += result.cpuMs;
              return result;
            } finally {
              gl.bindVertexArray(null);
            }
          },
        });
      };
      for (const band of input.bands) {
        const binding = bandRenderer.bindings.get(band.profile);
        if (!binding) throw new RangeError(`The pack carries no band ${band.profile}`);
        if (
          !Number.isInteger(band.first) ||
          !Number.isInteger(band.vertices) ||
          band.first < 0 ||
          band.vertices < 0 ||
          band.first + band.vertices > bandBuffer.count()
        )
          throw new RangeError("Prepared band lies outside the written vertex buffer");
        if (band.vertices === 0) continue;
        entry(binding.pass, band.key, order.bandDepth(band.profile), () => {
          bandRenderer.draw(band.profile, band.first, band.vertices, band.scalar, viewProjection);
          return { draws: 1, instances: 0, bandVertices: band.vertices, cpuMs: 0 };
        });
      }
      for (const last of classLast) last?.clear();
      let runs = 0;
      for (let i = 0; i < input.instances.length; i++) {
        const instance = input.instances[i];
        const material = materials[i];
        if (!material) throw new RangeError(`Model ${instance.model} has no usable material`);
        const offset = material.sortDistanceOffset;
        if (
          typeof offset !== "number" ||
          !Number.isFinite(offset) ||
          Math.fround(offset) !== offset
        )
          throw new RangeError(
            `Model ${instance.model} mesh ${instance.mesh} has no finite sort distance offset`,
          );
        if (
          material.uvTracks.length &&
          !Number.isFinite(instanceFrame(input, instance, material.clocked))
        )
          throw new RangeError("Animated material requires a synchronized animation frame");
        const depth = order.modelDepth(instance.sortJoint, offset);
        finiteDepth(depth);
        if (!Number.isInteger(instance.key) || instance.key < 0 || instance.key > 0xffff)
          throw new RangeError("Draw key must be a u16");
        instanceDepths[i] = depth;
        // Entries that compare equal under the pass's sort come out of the scene's stable sort
        // adjacent and in arrival order, so an entry that continues the previous one of its
        // position with the same mesh and animation frame joins its run.
        const position = sortPosition(material.pass, instance.key, depth);
        let run = -1;
        if (position !== null) {
          const positions = (classLast[material.pass] ??= new Map());
          const previous = positions.get(position);
          if (previous !== undefined) {
            const before = input.instances[previous];
            if (
              before.model === instance.model &&
              before.mesh === instance.mesh &&
              (material.uvTracks.length === 0 ||
                instanceFrame(input, before, material.clocked) ===
                  instanceFrame(input, instance, material.clocked))
            )
              run = runOf[previous];
          }
          positions.set(position, i);
        }
        if (run < 0) {
          run = runs++;
          runCount[run] = 0;
          runDrawn[run] = 0;
        }
        runOf[i] = run;
        runCount[run]++;
      }
      runStart[0] = 0;
      for (let r = 0; r < runs; r++) runStart[r + 1] = runStart[r] + runCount[r];
      for (let r = 0; r < runs; r++) runCount[r] = 0;
      for (let i = 0; i < input.instances.length; i++) {
        const run = runOf[i];
        passMembers[runStart[run] + runCount[run]++] = i;
      }
      for (let i = 0; i < input.instances.length; i++) {
        const instance = input.instances[i];
        const run = runOf[i];
        entry(
          materials[i]!.pass,
          instance.key,
          instanceDepths[i],
          () => {
            runDrawn[run] = 1;
            const before = draws;
            drawBatched(gl, input, runStart[run], runCount[run], identityOrder, viewProjection);
            return {
              draws: draws - before,
              instances: runCount[run],
              bandVertices: 0,
              cpuMs: 0,
            };
          },
          () => runDrawn[run] === 1,
        );
      }
      if (input.bands.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bandGlBuffer);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, bandBytes, 0, bandBuffer.count() * HOLD_VERTEX_BYTES);
      }
      return { entries, stats: frameStats };
    },
    instances: () => instanceBuffer,
    bands: () => bandBuffer,
    perNoteOnly: () => perNoteOnly,
    frame(input: FrameInput): DrawStats {
      preparation++;
      frameSerial++;
      instanceStreamIndex = 0;
      const started = typeof performance !== "undefined" ? performance.now() : 0;
      if (disposed) throw new Error("The note renderer has been disposed");
      if (input.instances.length > options.instanceCapacity)
        throw new RangeError(
          `Frame has ${input.instances.length} instances, capacity ${options.instanceCapacity}`,
        );

      // Bucket per pass, because the sort behaviour is the pass's. A model entry whose pass is not
      // declared sorts as pass 0. The buckets are counted first and then filled, so the members of
      // every pass live in one column with no per-pass list.
      //
      // The pass is read off the *material* the instance's mesh carries, not off the model: a
      // model's parts have their own materials and two parts of one model can sit in different
      // passes.
      resolveMaterials(input.instances);
      if (input.bands.length > maxBands)
        throw new RangeError(`Frame has ${input.bands.length} bands, capacity ${maxBands}`);
      for (let b = 0; b < input.bands.length; b++) {
        const binding = bandRenderer.bindings.get(input.bands[b].profile);
        if (!binding) throw new RangeError(`The pack carries no band ${input.bands[b].profile}`);
        frameBandBindings[b] = binding;
      }
      passOrderCount = 0;
      try {
        for (let i = 0; i < input.instances.length; i++) {
          // An instance with no material belongs to no pass; it is counted into pass 0 so it still
          // takes part in the ordering and is then skipped by the draw loop. Its presence cannot
          // reorder the drawn instances: the comparison ends in an index tiebreak, so inserting an
          // element never swaps two others.
          const material = materials[i];
          const pass = material === null ? 0 : material.pass;
          if (passCount[pass] === 0) passOrder[passOrderCount++] = pass;
          passCount[pass]++;
        }
        // A pass that holds only bands still has to be visited.
        for (let b = 0; b < input.bands.length; b++) {
          const pass = frameBandBindings[b]!.pass;
          if (passCount[pass] === 0 && passListed[pass] === 0) {
            passListed[pass] = 1;
            passOrder[passOrderCount++] = pass;
          }
        }
        // Ascending pass order, so the pass sequence does not depend on submission order. The pass
        // count is the handful the pack declares, so an insertion sort over it is the cheapest form.
        for (let i = 1; i < passOrderCount; i++) {
          const value = passOrder[i];
          let j = i - 1;
          while (j >= 0 && passOrder[j] > value) {
            passOrder[j + 1] = passOrder[j];
            j--;
          }
          passOrder[j + 1] = value;
        }
        let memberAt = 0;
        for (let i = 0; i < passOrderCount; i++) {
          passStart[passOrder[i]] = memberAt;
          memberAt += passCount[passOrder[i]];
        }
        for (let i = 0; i < passOrderCount; i++) passFill[passOrder[i]] = passStart[passOrder[i]];
        for (let i = 0; i < input.instances.length; i++) {
          const material = materials[i];
          passMembers[passFill[material === null ? 0 : material.pass]++] = i;
        }

        written = 0;
        draws = 0;

        // Draws are submitted in group order: within a pass, groups ascend by key (or descend, per the
        // pass's sort mode), and inside a group the instances keep the order the pass put them in.
        // Blending makes that order observable, so it is the submission order rather than a post-hoc
        // sort.
        const viewProjection = options.viewProjection ?? null;
        if (input.bands.length > 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, bandGlBuffer);
          gl.bufferSubData(
            gl.ARRAY_BUFFER,
            0,
            bandBytes,
            0,
            bandBuffer.count() * HOLD_VERTEX_BYTES,
          );
        }
        // Anything else that draws on this context between frames may have changed its state, so the
        // frame starts from nothing assumed.
        deviceState.invalidate();

        for (let p = 0; p < passOrderCount; p++) {
          const pass = passOrder[p];
          const start = passStart[pass];
          const count = passCount[pass];
          beginBands(input, pass);
          if (count === 0) {
            drawBandsUpTo(input, Infinity, viewProjection);
            continue;
          }
          for (let k = 0; k < count; k++) {
            const instance = input.instances[passMembers[start + k]];
            passKeys[k] = instance.key;
            passDepths[k] = instance.depth;
          }
          const mode = sortModes?.get(pass) ?? "keyAscending";
          const groups = orderInstances(passKeys, passDepths, count, mode, orderState);

          // A group is one sort position, so its members may be reordered among themselves — that is
          // what makes one draw per mesh possible instead of one per (record, mesh). The reference
          // merges the same way, within an equal-`(key, depth, pass, model)` span.
          // `orderState.order` holds indices into this pass's member column, not instance indices, so
          // the accessors resolve one through `passMembers` — the same lookup the draw loop makes.
          const memberOf = (local: number): number => passMembers[start + local];
          const modelOfSlot = (local: number): string => input.instances[memberOf(local)].model;
          const depthOfSlot = (local: number): number => input.instances[memberOf(local)].depth;
          const meshOrderOfSlot = (local: number): number => meshOrder[memberOf(local)];
          for (let g = 0; g < groups; g++) {
            const first = orderState.groupStarts[g];
            const groupEnd = g + 1 < groups ? orderState.groupStarts[g + 1] : count;
            drawBandsUpTo(input, passKeys[orderState.order[first]], viewProjection);
            // Only the *reordering* is confined to one depth: a span of equal depth is a set of notes
            // at the same position along the travel axis, so their parts may be permuted among
            // themselves without moving anything relative to anything else. Reducing the draws is a
            // separate step — the emitter below merges any consecutive instances sharing a material —
            // and that merge is safe across depths, which is why this only writes the group's order
            // and does not draw.
            let groupWritten = 0;
            let spanStart = first;
            while (spanStart < groupEnd) {
              let spanEnd = spanStart + 1;
              const spanModel = modelOfSlot(orderState.order[spanStart]);
              const spanDepth = depthOfSlot(orderState.order[spanStart]);
              while (
                spanEnd < groupEnd &&
                modelOfSlot(orderState.order[spanEnd]) === spanModel &&
                depthOfSlot(orderState.order[spanEnd]) === spanDepth
              )
                spanEnd++;
              const batched = rebatchByMesh(
                orderState.order,
                spanStart,
                spanEnd,
                modelOfSlot,
                depthOfSlot,
                meshOrderOfSlot,
                batchedScratch,
              );
              for (let i = 0; i < batched.count; i++)
                batchedOrder[groupWritten++] = batchedScratch[i];
              spanStart = spanEnd;
            }
            // Same depth, two depths, one depth and a ragged tail: whichever it is, the emitter walks
            // the group's order once and merges every consecutive run of one material.
            drawBatched(gl, input, start, groupWritten, batchedOrder, viewProjection);
          }
          drawBandsUpTo(input, Infinity, viewProjection);
        }
      } finally {
        for (let i = 0; i < passOrderCount; i++) {
          const pass = passOrder[i];
          passCount[pass] = 0;
          passListed[pass] = 0;
        }
        passOrderCount = 0;
        gl.bindVertexArray(null);
      }

      let bandVertices = 0;
      for (let i = 0; i < input.bands.length; i++) bandVertices += input.bands[i].vertices;

      stats.draws = draws;
      stats.instances = written;
      stats.bandVertices = bandVertices;
      stats.cpuMs = typeof performance !== "undefined" ? performance.now() - started : 0;
      return stats;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      viewProjectionSerial.clear();
      programUniforms.clear();
      releaseResources(gl, resources);
      meshCache.clear();
      geometryCache.clear();
      modelBindings.clear();
    },
  };
}

/**
 * The compiled state commands a material entry carries.
 *
 * @throws RangeError when the entry has none, which means the pack predates compiled state and has
 *   to be rebuilt.
 */
function stateCommandsOf(modelName: string, material: unknown): readonly PackedStateCommand[] {
  const commands = (material as { renderState?: { commands?: unknown } }).renderState?.commands;
  if (!Array.isArray(commands))
    throw new RangeError(`Model ${modelName} carries no compiled render state; rebuild the pack`);
  return commands as readonly PackedStateCommand[];
}

/**
 * The pass a mesh draws in: the caller's override when it has one, otherwise the packed value.
 *
 * The packed value is authoritative because it came from the material the mesh was built with; the
 * override exists for a caller that re-batches the pack, and it is keyed by the pair because the same
 * shared mesh can appear in two models under different materials.
 */
function resolveMaterialPass(
  modelName: string,
  meshName: string,
  packedPass: unknown,
  options: NoteRendererOptions,
): number {
  const override = options.passOfMesh?.get(`${modelName}|${meshName}`);
  if (override !== undefined) {
    if (!Number.isInteger(override) || override < 0 || override >= MAX_PASSES)
      throw new RangeError(`Pass ${override} is outside the supported 0..${MAX_PASSES - 1}`);
    return override;
  }
  if (
    !Number.isInteger(packedPass) ||
    (packedPass as number) < 0 ||
    (packedPass as number) >= MAX_PASSES
  )
    throw new RangeError(`Model ${modelName} mesh ${meshName} records no usable pass`);
  return packedPass as number;
}

/**
 * The mesh attribute locations for one program, resolved once.
 *
 * `bindMesh` binds by name and skips an attribute the program does not declare, so this returns a
 * name-to-location map rather than assuming a fixed layout.
 */
function attributeLocations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
): ReadonlyMap<string, number> {
  const names = ["aPosition", "aUv0", "aUv1", "aColor"];
  const out = new Map<string, number>();
  for (const name of names) out.set(name, gl.getAttribLocation(program, name));
  return out;
}

/** Compiles one program, tracking it so `dispose` can release it. */
function compile(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string,
  created: WebGLProgram[],
): WebGLProgram {
  let vs: WebGLShader | null = null;
  let fs: WebGLShader | null = null;
  try {
    vs = gl.createShader(gl.VERTEX_SHADER);
    fs = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vs || !fs) throw new Error("Shader allocation failed");
    gl.shaderSource(vs, vertex);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS))
      throw new Error(`Vertex shader failed to compile: ${gl.getShaderInfoLog(vs) ?? ""}`);
    gl.shaderSource(fs, fragment);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS))
      throw new Error(`Fragment shader failed to compile: ${gl.getShaderInfoLog(fs) ?? ""}`);
    const program = gl.createProgram();
    if (!program) throw new Error("Program allocation failed");
    created.push(program);
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`Program failed to link: ${gl.getProgramInfoLog(program) ?? ""}`);
    return program;
  } finally {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
  }
}

/** The GL context already provides the layout calls; this names the structural match. */
function asLayoutTarget(gl: WebGL2RenderingContext): {
  vertexAttribPointer(i: number, s: number, t: number, n: boolean, st: number, o: number): void;
  enableVertexAttribArray(i: number): void;
  vertexAttribDivisor(i: number, d: number): void;
} {
  return {
    vertexAttribPointer: (i, s, t, n, st, o) => gl.vertexAttribPointer(i, s, t, n, st, o),
    enableVertexAttribArray: (i) => gl.enableVertexAttribArray(i),
    vertexAttribDivisor: (i, d) => gl.vertexAttribDivisor(i, d),
  };
}
