import { describe, expect, it, vi } from "vitest";
import { createNoteRenderer } from "./noteRenderer";
import type { FrameInput, NoteRendererOptions } from "./types";
import type { Pack, PackEntry } from "../../assets/packFormat";
import { sortKey } from "./drawGroups";
import { uvAnimationFixture } from "../../assets/uvAnimation.testFixture.ts";

/**
 * A fake GL that records the calls the frame path makes.
 *
 * The renderer's draw submission is the one part of it a pure-arithmetic test cannot reach: whether
 * a draw is issued at all, with which program, and against which mesh. This records exactly those.
 */
function recordingGl() {
  const calls: string[] = [];
  /** Fixed-function state calls, in order, so a missing or repeated one is observable. */
  const stateCalls: string[] = [];
  const draws: {
    program: number;
    vao: unknown;
    indexCount: number;
    indexType: number;
    instances: number;
    instanceData: number;
    sampler: unknown;
  }[] = [];
  /** Uniform uploads, so a dropped per-draw upload is observable. */
  const uniformUploads: {
    name: string;
    kind: string;
    matrix?: number[] | null;
    value?: number[];
  }[] = [];
  const uploads: { offset: number; length: number }[] = [];
  /** Band draws (`drawArrays`), so a band's own submission is observable apart from the notes'. */
  const bandDraws: { program: number; first: number; count: number; sampler: unknown }[] = [];
  /** Sampler objects in creation order, each with the parameters set on it. */
  const samplerObjects: { id: number; params: Map<number, number> }[] = [];
  const boundSamplers = new Map<number, unknown>();
  const shaders: unknown[] = [];
  const deleted = {
    shaders: [] as unknown[],
    programs: [] as unknown[],
    buffers: [] as unknown[],
    arrays: [] as unknown[],
    samplers: [] as unknown[],
  };
  const programs: unknown[] = [];
  const vertexArrays: unknown[] = [];
  const buffers: unknown[] = [];
  let currentProgram: unknown = null;
  let currentVao: unknown = null;
  let lastSubData: { offset: number; length: number } = { offset: 0, length: 0 };

  const gl = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    FLOAT: 0x1406,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    UNSIGNED_BYTE: 0x1401,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    TRIANGLES: 0x0004,
    DEPTH_TEST: 0x0b71,
    BLEND: 0x0be2,
    CULL_FACE: 0x0b44,
    CCW: 0x0901,
    BACK: 0x0405,
    FRONT: 0x0404,
    NEVER: 0x0200,
    LESS: 0x0201,
    EQUAL: 0x0202,
    LEQUAL: 0x0203,
    GREATER: 0x0204,
    NOTEQUAL: 0x0205,
    GEQUAL: 0x0206,
    ALWAYS: 0x0207,
    ZERO: 0,
    ONE: 1,
    SRC_COLOR: 0x0300,
    ONE_MINUS_SRC_COLOR: 0x0301,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    DST_ALPHA: 0x0304,
    ONE_MINUS_DST_ALPHA: 0x0305,
    DST_COLOR: 0x0306,
    ONE_MINUS_DST_COLOR: 0x0307,
    SRC_ALPHA_SATURATE: 0x0308,
    FUNC_ADD: 0x8006,
    FUNC_SUBTRACT: 0x800a,
    FUNC_REVERSE_SUBTRACT: 0x800b,
    MIN: 0x8007,
    MAX: 0x8008,
    enable: (c: number) => stateCalls.push(`enable ${c}`),
    disable: (c: number) => stateCalls.push(`disable ${c}`),
    depthMask: (f: boolean) => stateCalls.push(`depthMask ${f}`),
    depthFunc: (f: number) => stateCalls.push(`depthFunc ${f}`),
    blendFuncSeparate: (...a: number[]) => stateCalls.push(`blendFuncSeparate ${a.join(",")}`),
    blendEquationSeparate: (...a: number[]) =>
      stateCalls.push(`blendEquationSeparate ${a.join(",")}`),
    blendColor: () => stateCalls.push("blendColor"),
    frontFace: () => stateCalls.push("frontFace"),
    cullFace: (m: number) => stateCalls.push(`cullFace ${m}`),
    colorMask: (...a: boolean[]) => stateCalls.push(`colorMask ${a.join(",")}`),
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    NEAREST_MIPMAP_NEAREST: 0x2700,
    LINEAR_MIPMAP_NEAREST: 0x2701,
    NEAREST_MIPMAP_LINEAR: 0x2702,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    REPEAT: 0x2901,
    CLAMP_TO_EDGE: 0x812f,
    MIRRORED_REPEAT: 0x8370,
    createSampler: () => {
      const sampler = { id: samplerObjects.length, params: new Map<number, number>() };
      samplerObjects.push(sampler);
      return sampler;
    },
    samplerParameteri: (sampler: { params: Map<number, number> }, name: number, value: number) =>
      sampler.params.set(name, value),
    deleteSampler: (sampler: unknown) => {
      if (sampler) deleted.samplers.push(sampler);
    },
    createShader: () => {
      const shader = { id: shaders.length };
      shaders.push(shader);
      return shader;
    },
    shaderSource: () => {},
    compileShader: () => {},
    getShaderParameter: () => true,
    getShaderInfoLog: () => "",
    deleteShader: (shader: unknown) => {
      if (shader) deleted.shaders.push(shader);
    },
    createProgram: () => {
      const p = { id: programs.length };
      programs.push(p);
      return p;
    },
    attachShader: () => {},
    linkProgram: () => {},
    getProgramParameter: () => true,
    getProgramInfoLog: () => "",
    deleteProgram: (program: unknown) => {
      if (program) deleted.programs.push(program);
    },
    getAttribLocation: (_p: unknown, name: string) => ATTRIB_LOCATIONS[name] ?? -1,
    getUniformLocation: (_p: unknown, name: string) =>
      ({ name }) as unknown as WebGLUniformLocation,
    useProgram: (p: unknown) => {
      currentProgram = p;
    },
    uniform1f: (l: unknown) => uniformUploads.push({ name: nameOf(l), kind: "1f" }),
    uniform1i: (l: unknown) => uniformUploads.push({ name: nameOf(l), kind: "1i" }),
    uniform2fv: (l: unknown) => uniformUploads.push({ name: nameOf(l), kind: "2fv" }),
    uniform3fv: (l: unknown) => uniformUploads.push({ name: nameOf(l), kind: "3fv" }),
    uniform4fv: (l: unknown, v: Float32Array) =>
      uniformUploads.push({ name: nameOf(l), kind: "4fv", value: [...v] }),
    // The matrix itself is kept, because which convention it arrives in is the whole of whether the
    // camera works: a row-major upload puts every vertex behind the viewer and draws nothing at all,
    // with no error. Capturing only the call name is what let that ship.
    uniformMatrix4fv: (l: unknown, _transpose: unknown, data: unknown) =>
      uniformUploads.push({
        name: nameOf(l),
        kind: "matrix4fv",
        matrix: data ? Array.from(data as ArrayLike<number>) : null,
      }),
    activeTexture: () => {},
    bindTexture: () => {},
    bindSampler: (unit: number, sampler: unknown) => boundSamplers.set(unit, sampler),
    createVertexArray: () => {
      const v = { id: vertexArrays.length };
      vertexArrays.push(v);
      return v;
    },
    deleteVertexArray: (array: unknown) => {
      if (array) deleted.arrays.push(array);
    },
    bindVertexArray: (v: unknown) => {
      currentVao = v;
    },
    createBuffer: () => {
      const b = { id: buffers.length };
      buffers.push(b);
      return b;
    },
    deleteBuffer: (buffer: unknown) => {
      if (buffer) deleted.buffers.push(buffer);
    },
    bindBuffer: () => {},
    bufferData: () => {},
    bufferSubData: (
      _t: number,
      _offset: number,
      _d: unknown,
      srcOffset: number,
      length: number,
    ) => {
      lastSubData = { offset: srcOffset, length };
      uploads.push({ offset: srcOffset, length });
    },
    vertexAttribPointer: () => {},
    enableVertexAttribArray: () => {},
    vertexAttribDivisor: () => {},
    drawElementsInstanced: (
      _mode: number,
      count: number,
      type: number,
      _off: number,
      instances: number,
    ) => {
      draws.push({
        program: currentProgram as number,
        vao: currentVao,
        indexCount: count,
        indexType: type,
        instances,
        instanceData: lastSubData.offset / 12,
        sampler: boundSamplers.get(0) ?? null,
      });
      calls.push("drawElementsInstanced");
    },
    drawArraysInstanced: () => calls.push("drawArraysInstanced"),
    drawArrays: (_mode: number, first: number, count: number) => {
      bandDraws.push({
        program: currentProgram as number,
        first,
        count,
        sampler: boundSamplers.get(0) ?? null,
      });
      calls.push("drawArrays");
    },
    getError: () => 0,
  };
  return {
    gl: gl as unknown as WebGL2RenderingContext,
    calls,
    stateCalls,
    draws,
    uploads,
    bandDraws,
    programs,
    vertexArrays,
    buffers,
    uniformUploads,
    shaders,
    deleted,
    samplers: samplerObjects,
    boundSampler: (unit: number) => boundSamplers.get(unit) ?? null,
    currentVertexArray: () => currentVao,
  };
}

const nameOf = (location: unknown): string =>
  (location as { name?: string } | null)?.name ?? "<null>";

/** The attribute locations the probe measured on the real pack, one program per row. */
const ATTRIB_LOCATIONS: Record<string, number> = {
  aInstanceWorld0: 3,
  aInstanceWorld1: 4,
  aInstanceWorld2: 5,
  aInstanceWorld3: 6,
  aPosition: 0,
  aUv0: 1,
  aUv1: -1,
  aColor: 2,
};

/** A material sampler state as the packer records it. */
const MODEL_SAMPLER = Object.freeze({
  addressU: 1,
  addressV: 1,
  minFilter: 2,
  magFilter: 2,
  mipFilter: 2,
  maxMipLevel: 0,
  maxAnisotropy: 1,
});

/**
 * One material record, in the shape the packer writes.
 *
 * A model entry carries one per mesh, because a model's parts do not share a program, a pass or an
 * image. `pass` is per material here, not per model, so a test can put two parts of one model in
 * different passes — which is what the corpus does.
 */
function material(mesh: string, over: Record<string, unknown> = {}) {
  return {
    mesh,
    program: "test",
    pass: 2,
    textures: [0],
    samplers: [MODEL_SAMPLER],
    textureNames: [],
    uniforms: { uDiffuse: { type: "vec4", value: [1, 1, 1, 1] } },
    renderState: { commands: STATE_COMMANDS },
    ...over,
  };
}

/**
 * A complete, supported state list: depth tested, alpha blended, back-face culled, solid.
 * Values follow the reference's numbering, where a blend factor of 5 is source alpha.
 */
const STATE_COMMANDS: [number, number][] = [
  [27, 1],
  [206, 0],
  [171, 1],
  [19, 5],
  [20, 6],
  [209, 1],
  [207, 1],
  [208, 1],
  [193, 0xff000000],
  [15, 0],
  [24, 25],
  [25, 5],
  [7, 1],
  [14, 0],
  [23, 4],
  [195, 0x80000000],
  [175, 0x80000000],
  [52, 0],
  [22, 2],
  [174, 0],
  [168, 15],
  [8, 3],
];

/**
 * A pack with one shader and, for each extra mesh beyond the first, an extra model entry that owns
 * it. Building it in one pass keeps `entries` a plain map rather than mutating a readonly one.
 */
function packWith(meshCount: number, extraModels = 0): Pack {
  const vertex =
    "#version 300 es\nuniform mat4 uWorld;\nvoid main(){ gl_Position = uWorld * vec4(0.0); }";
  const fragment = "#version 300 es\nvoid main(){}";
  const shaderBytes = new TextEncoder().encode(`${vertex}\0${fragment}`);
  const meshNames = Array.from({ length: meshCount }, (_, i) => `mesh/m${i}`);
  // Extra models each own one further mesh, so a group can contain two different models.
  const extraMeshNames = Array.from({ length: extraModels }, (_, i) => `mesh/extra${i}`);
  // One interleaved vertex (3 position + 2 uv floats = 20 bytes) plus three u16 indices.
  const meshBytes = new Uint8Array(20 + 6);
  const entries = new Map<string, PackEntry>();
  const add = (entry: PackEntry) => entries.set(entry.name, entry);
  add({
    name: "shader/test",
    kind: "shader",
    offset: 0,
    length: shaderBytes.length,
    meta: {},
  });
  for (const name of [...meshNames, ...extraMeshNames])
    entries.set(name, meshEntry(name, meshBytes.length));
  add({
    name: "note/model/1",
    kind: "table",
    offset: 0,
    length: 0,
    meta: {
      program: "test",
      meshes: meshNames,
      materials: meshNames.map((mesh) => material(mesh)),
    },
  });
  for (const [i, name] of extraMeshNames.entries())
    add({
      name: `note/model/extra${i}`,
      kind: "table",
      offset: 0,
      length: 0,
      meta: {
        program: "test",
        meshes: [name],
        materials: [material(name)],
      },
    });
  return { version: 1, engine: "chunithm", bytes: shaderBytes, entries };
}

/** The real-mesh test pack whose fragment stage scrolls its UV, with model 1's material replaced. */
function scrollingPack(over: Record<string, unknown> = {}): Pack {
  const p = packWithRealMesh(1);
  const shader = p.entries.get("shader/test")!;
  const source = new TextDecoder().decode(
    p.bytes.subarray(shader.offset, shader.offset + shader.length),
  );
  const fragment = "#version 300 es\nuniform vec4 uUvOffsetScale;\nvoid main(){}";
  const text = new TextEncoder().encode(`${source.slice(0, source.indexOf("\0"))}\0${fragment}`);
  const bytes = new Uint8Array(shader.offset + text.length);
  bytes.set(p.bytes.subarray(0, shader.offset));
  bytes.set(text, shader.offset);
  const entries = new Map(p.entries);
  entries.set(shader.name, { ...shader, length: text.length });
  const model = entries.get("note/model/1")!;
  entries.set(model.name, {
    ...model,
    meta: { ...model.meta, materials: [material("mesh/m0", over)] },
  });
  return { ...p, bytes, entries };
}

/** The same pack with the fixture UV animation appended as `uvc/test`. */
function withUvResource(pack: Pack): Pack {
  const uvc = uvAnimationFixture().bytes;
  const bytes = new Uint8Array(pack.bytes.length + uvc.length);
  bytes.set(pack.bytes);
  bytes.set(uvc, pack.bytes.length);
  const entries = new Map(pack.entries);
  entries.set("uvc/test", {
    name: "uvc/test",
    kind: "uvc",
    offset: pack.bytes.length,
    length: uvc.length,
    meta: {},
  });
  return { ...pack, bytes, entries };
}

/** One packed mesh: a single interleaved vertex plus three u16 indices. */
function meshEntry(name: string, length: number): PackEntry {
  return {
    name,
    kind: "mesh",
    offset: 0,
    length,
    meta: { layout: "pos_uv0", stride: 20, vertexCount: 1, indexCount: 3, indexType: "u16" },
  };
}

/**
 * The same pack with real mesh bodies.
 *
 * `bindMesh` reads the entry's bytes, so the merged buffer has to cover the longest entry; the shader
 * entry is placed after the mesh bodies for the same reason.
 */
function packWithRealMesh(meshCount: number, extraModels = 0): Pack {
  const p = packWith(meshCount, extraModels);
  const meshBytes = new Uint8Array(20 + 6);
  const all = new Uint8Array(meshBytes.length + p.bytes.length);
  all.set(meshBytes, 0);
  all.set(p.bytes, meshBytes.length);
  const entries = new Map<string, PackEntry>();
  for (const [name, entry] of p.entries) {
    if (entry.kind === "mesh") entries.set(name, { ...entry, offset: 0, length: meshBytes.length });
    else if (entry.kind === "shader")
      entries.set(name, { ...entry, offset: meshBytes.length, length: p.bytes.length });
    else entries.set(name, entry);
  }
  return { version: 1, engine: "chunithm", bytes: all, entries };
}

/**
 * The same pack with a hold band entry, drawn in the notes' pass at a layer below them.
 *
 * `over` replaces fields of the band's table (an `undefined` removes one); `modelLayer` gives the
 * note model a layer, which the placement check compares the band's against.
 */
/** A band sampler state as the packer records it. */
const BAND_SAMPLER = Object.freeze({
  addressU: 1,
  addressV: 1,
  minFilter: 2,
  magFilter: 2,
  mipFilter: 1,
  maxMipLevel: 0,
  maxAnisotropy: 1,
});

function withBands(
  pack: Pack,
  over: Record<string, unknown> = {},
  { modelLayer }: { modelLayer?: number } = {},
): Pack {
  const entries = new Map(pack.entries);
  const meta: Record<string, unknown> = {
    program: "test",
    texture: "band-image",
    uniforms: {},
    commands: STATE_COMMANDS,
    layer: 15,
    pass: 2,
    profileUrl: "hold-band.json",
    sampler: BAND_SAMPLER,
    ...over,
  };
  for (const key of Object.keys(meta)) if (meta[key] === undefined) delete meta[key];
  entries.set("note/band/hold", {
    name: "note/band/hold",
    kind: "table",
    offset: 0,
    length: 0,
    meta,
  });
  if (modelLayer !== undefined) {
    const model = entries.get("note/model/1")!;
    entries.set("note/model/1", { ...model, meta: { ...model.meta, layer: modelLayer } });
  }
  return { ...pack, entries };
}

const options = (over: Partial<NoteRendererOptions> = {}): NoteRendererOptions => ({
  instanceCapacity: 64,
  bandVertexCapacity: 256,
  passOfMesh: new Map([["note/model/1|mesh/m0", 2]]),
  passSortModes: new Map([[2, "keyAscending"]]),
  viewProjection: new Float32Array(16),
  textures: new Map([[0, {} as WebGLTexture]]),
  ...over,
});

function instance(world: number, model = "note/model/1", mesh = "mesh/m0") {
  const m = new Float32Array(12);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[3] = world;
  return { key: sortKey(0x8580, 20, 1), depth: world, world: m, sortJoint: m, model, mesh };
}

describe("draw submission", () => {
  it("samples and uploads animated UV before every draw, including backward phase seeks", () => {
    const p = packWithRealMesh(1);
    const uvc = uvAnimationFixture().bytes;
    const bytes = new Uint8Array(p.bytes.length + uvc.length);
    bytes.set(p.bytes);
    bytes.set(uvc, p.bytes.length);
    const entries = new Map(p.entries);
    entries.set("uvc/test", {
      name: "uvc/test",
      kind: "uvc",
      offset: p.bytes.length,
      length: uvc.length,
      meta: {},
    });
    const model = entries.get("note/model/1")!;
    entries.set(model.name, {
      ...model,
      meta: {
        ...model.meta,
        materials: [
          material("mesh/m0", {
            uvAnimation: { resource: "uvc/test", tracks: [0] },
          }),
        ],
      },
    });
    const { gl, draws, uniformUploads } = recordingGl();
    const renderer = createNoteRenderer(gl, { ...p, entries, bytes }, options());
    for (const animationFrame of [0, 4, 0])
      renderer.frame({
        instances: [instance(1), instance(2)],
        bands: [],
        animationFrame,
      });
    expect(draws.map((d) => d.instances)).toEqual([2, 2, 2]);
    expect(uniformUploads.filter((u) => u.name === "uUvOffsetScale").map((u) => u.value)).toEqual([
      [-0, 2, 1, 1],
      [-0, 3.75, 1, 1],
      [-0, 2, 1, 1],
    ]);
    renderer.dispose();
  });

  it("rejects missing animation phases without poisoning the next frame", () => {
    const p = packWithRealMesh(1);
    const uvc = uvAnimationFixture().bytes;
    const bytes = new Uint8Array(p.bytes.length + uvc.length);
    bytes.set(p.bytes);
    bytes.set(uvc, p.bytes.length);
    const entries = new Map(p.entries);
    entries.set("uvc/test", {
      name: "uvc/test",
      kind: "uvc",
      offset: p.bytes.length,
      length: uvc.length,
      meta: {},
    });
    const model = entries.get("note/model/1")!;
    entries.set(model.name, {
      ...model,
      meta: {
        ...model.meta,
        materials: [
          material("mesh/m0", {
            uvAnimation: { resource: "uvc/test", tracks: [0] },
          }),
        ],
      },
    });
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, { ...p, entries, bytes }, options());
    expect(() => renderer.frame({ instances: [instance(1)], bands: [] })).toThrow(
      /animation frame/,
    );
    expect(() =>
      renderer.frame({ instances: [instance(1)], bands: [], animationFrame: 9 }),
    ).toThrow(/frame/);
    renderer.frame({ instances: [instance(1)], bands: [], animationFrame: 4 });
    expect(draws.map((d) => d.instances)).toEqual([1]);
    renderer.dispose();
  });

  describe("per-instance animation frames", () => {
    function animated(withAnimation = true, loop?: unknown) {
      const p = packWithRealMesh(1);
      const uvc = uvAnimationFixture().bytes;
      const bytes = new Uint8Array(p.bytes.length + uvc.length);
      bytes.set(p.bytes);
      bytes.set(uvc, p.bytes.length);
      const entries = new Map(p.entries);
      entries.set("uvc/test", {
        name: "uvc/test",
        kind: "uvc",
        offset: p.bytes.length,
        length: uvc.length,
        meta: {},
      });
      const model = entries.get("note/model/1")!;
      entries.set(model.name, {
        ...model,
        meta: {
          ...model.meta,
          materials: [
            material(
              "mesh/m0",
              withAnimation
                ? {
                    uvAnimation: {
                      resource: "uvc/test",
                      tracks: [0],
                      ...(loop === undefined ? {} : { loop }),
                    },
                  }
                : {},
            ),
          ],
        },
      });
      return { ...p, entries, bytes };
    }
    const framed = (world: number, frame?: number) => ({ ...instance(world), frame });
    const uploads = (list: { name: string; value?: unknown }[]) =>
      list.filter((u) => u.name === "uUvOffsetScale").map((u) => u.value);

    it("draws each run of equal frames with that frame's transform", () => {
      const { gl, draws, uniformUploads } = recordingGl();
      const renderer = createNoteRenderer(gl, animated(), options());
      renderer.frame({
        instances: [framed(1, 0), framed(2, 0), framed(3, 4)],
        bands: [],
      });
      expect(draws.map((d) => d.instances)).toEqual([1, 2]);
      expect(uploads(uniformUploads)).toEqual([
        [-0, 3.75, 1, 1],
        [-0, 2, 1, 1],
      ]);
      renderer.dispose();
    });

    it("never merges instances across a frame change inside a group", () => {
      const { gl, draws, uniformUploads } = recordingGl();
      const renderer = createNoteRenderer(gl, animated(), options());
      renderer.frame({
        instances: [framed(1, 0), framed(2, 4), framed(3, 0)],
        bands: [],
      });
      expect(draws.map((d) => d.instances)).toEqual([1, 1, 1]);
      expect(uploads(uniformUploads)).toEqual([
        [-0, 2, 1, 1],
        [-0, 3.75, 1, 1],
        [-0, 2, 1, 1],
      ]);
      renderer.dispose();
    });

    it("takes the shared frame for an instance that names none, and prefers its own", () => {
      const { gl, draws, uniformUploads } = recordingGl();
      const renderer = createNoteRenderer(gl, animated(), options());
      renderer.frame({
        instances: [framed(1), framed(2, 4)],
        bands: [],
        animationFrame: 0,
      });
      expect(draws.map((d) => d.instances)).toEqual([1, 1]);
      expect(uploads(uniformUploads)).toEqual([
        [-0, 3.75, 1, 1],
        [-0, 2, 1, 1],
      ]);
      renderer.dispose();
    });

    it("rejects an animated instance with no frame at all and recovers on the next frame", () => {
      const { gl, draws } = recordingGl();
      const renderer = createNoteRenderer(gl, animated(), options());
      expect(() => renderer.frame({ instances: [framed(1, 0), framed(2)], bands: [] })).toThrow(
        /animation frame/,
      );
      expect(() => renderer.frame({ instances: [framed(1, 9)], bands: [] })).toThrow(/frame/);
      renderer.frame({ instances: [framed(1, 4)], bands: [] });
      expect(draws[draws.length - 1]?.instances).toBe(1);
      renderer.dispose();
    });

    it("resolves an instance's frame by model, between its own frame and the shared one", () => {
      const { gl, draws, uniformUploads } = recordingGl();
      const renderer = createNoteRenderer(gl, animated(), options());
      const asked: string[] = [];
      const animationFrameOf = (model: string) => {
        asked.push(model);
        return model === "note/model/1" ? 4 : undefined;
      };
      renderer.frame({
        instances: [framed(1), framed(2, 0)],
        bands: [],
        animationFrameOf,
        animationFrame: 0,
      });
      expect(draws.map((d) => d.instances)).toEqual([1, 1]);
      expect(uploads(uniformUploads)).toEqual([
        [-0, 2, 1, 1],
        [-0, 3.75, 1, 1],
      ]);
      expect(new Set(asked)).toEqual(new Set(["note/model/1"]));
      uniformUploads.length = 0;
      renderer.frame({
        instances: [framed(1), framed(2)],
        bands: [],
        animationFrameOf: () => undefined,
        animationFrame: 0,
      });
      expect(uploads(uniformUploads)).toEqual([[-0, 2, 1, 1]]);
      expect(() =>
        renderer.frame({ instances: [framed(1)], bands: [], animationFrameOf: () => undefined }),
      ).toThrow(/animation frame/);
      expect(() =>
        renderer.frame({ instances: [framed(1)], bands: [], animationFrameOf: () => NaN }),
      ).toThrow(/frame/);
      renderer.dispose();
    });

    it("does not consult the resolver for a material that is not animated", () => {
      const { gl, draws } = recordingGl();
      const renderer = createNoteRenderer(gl, animated(false), options());
      let asked = 0;
      renderer.frame({
        instances: [framed(1), framed(2)],
        bands: [],
        animationFrameOf: () => (asked++, 4),
      });
      expect(asked).toBe(0);
      expect(draws.map((d) => d.instances)).toEqual([2]);
      renderer.dispose();
    });

    it("never gives a material bound to its own clock the shared frame", () => {
      const { gl, draws, uniformUploads } = recordingGl();
      const renderer = createNoteRenderer(gl, animated(true, true), options());
      expect(() =>
        renderer.frame({ instances: [framed(1)], bands: [], animationFrame: 0 }),
      ).toThrow(/animation frame/);
      expect(() =>
        renderer.frame({
          instances: [framed(1)],
          bands: [],
          animationFrame: 0,
          animationFrameOf: () => undefined,
        }),
      ).toThrow(/animation frame/);
      renderer.frame({
        instances: [framed(1), framed(2, 0)],
        bands: [],
        animationFrame: 0,
        animationFrameOf: () => 4,
      });
      expect(draws.map((d) => d.instances)).toEqual([1, 1]);
      expect(uploads(uniformUploads)).toEqual([
        [-0, 2, 1, 1],
        [-0, 3.75, 1, 1],
      ]);
      renderer.dispose();
    });

    it("refuses a clock binding that does not loop", () => {
      const { gl } = recordingGl();
      for (const loop of [false, 1, "yes"])
        expect(() => createNoteRenderer(gl, animated(true, loop), options())).toThrow(/clock/);
    });

    it("rejects a non-finite frame instead of looping on it, and recovers", () => {
      const { gl, draws } = recordingGl();
      const renderer = createNoteRenderer(gl, animated(), options());
      for (const bad of [NaN, Infinity, -1])
        expect(() => renderer.frame({ instances: [framed(1, bad)], bands: [] })).toThrow(/frame/);
      renderer.frame({ instances: [framed(1, 4)], bands: [] });
      expect(draws[draws.length - 1]?.instances).toBe(1);
      renderer.dispose();
    });

    it("ignores frames on a material that is not animated", () => {
      const { gl, draws, uniformUploads } = recordingGl();
      const renderer = createNoteRenderer(gl, animated(false), options());
      renderer.frame({
        instances: [framed(1, 0), framed(2, 4), framed(3)],
        bands: [],
      });
      expect(draws.map((d) => d.instances)).toEqual([3]);
      expect(uploads(uniformUploads)).toEqual([]);
      renderer.dispose();
    });
  });

  it("draws a whole group of one model in a single instanced call", () => {
    // Instancing is the point: three instances of one model that fall in the same group are one
    // `drawElementsInstanced` with three instances, not three calls.
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
    const input: FrameInput = { instances: [instance(1), instance(2), instance(3)], bands: [] };
    const stats = renderer.frame(input);
    expect(draws.length).toBe(1);
    expect(draws[0].instances).toBe(3);
    expect(draws[0].indexCount).toBe(3);
    expect(stats.draws).toBe(1);
    expect(stats.instances).toBe(3);
  });

  it("splits a draw when the material changes inside one group", () => {
    // Two models' parts sharing a (layer, width priority) key land in the same group, and their
    // meshes differ, so the group becomes one draw per *run*. A draw covers a contiguous run rather
    // than collecting one mesh's instances from across the group: the reference merges only runs
    // whose state, program, mesh and uniforms all match, and the run order is what blending
    // observes, so merging a non-contiguous run would reorder the blend.
    const { gl, draws } = recordingGl();
    const pack = packWithRealMesh(1, 1);
    const renderer = createNoteRenderer(
      gl,
      pack,
      options({ passOfMesh: new Map([["note/model/extra0|mesh/extra0", 2]]) }),
    );
    const stats = renderer.frame({
      instances: [
        instance(1, "note/model/1", "mesh/m0"),
        instance(2, "note/model/extra0", "mesh/extra0"),
        instance(3, "note/model/1", "mesh/m0"),
      ],
      bands: [],
    });
    expect(draws.length).toBe(3);
    expect(stats.draws).toBe(3);
    expect(stats.instances).toBe(3);
    expect(draws.map((d) => d.instances)).toEqual([1, 1, 1]);
  });

  it("batches consecutive instances of one mesh into a single draw", () => {
    // The other half of the rule above: parts that *are* adjacent still merge, so a model whose
    // instances arrive together costs one draw per mesh rather than one per note.
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(2), options());
    // All four instances carry the same key, so `keyAscending` orders them by depth descending: both
    // mesh/m0 instances (depth 2) precede both mesh/m1 instances (depth 1), and within one depth the
    // arrival index decides. Each mesh therefore forms one run, and the two runs are two draws —
    // with one instance per note it would be four.
    renderer.frame({
      instances: [
        instance(2, "note/model/1", "mesh/m0"),
        instance(2, "note/model/1", "mesh/m0"),
        instance(1, "note/model/1", "mesh/m1"),
        instance(1, "note/model/1", "mesh/m1"),
      ],
      bands: [],
    });
    expect(draws.map((d) => d.instances)).toEqual([2, 2]);
  });

  it("reports the number of draw calls, not the number of groups", () => {
    // `draws` used to be incremented once per group while no draw was ever issued, so a consumer
    // reading it as "GL calls emitted" was reading a different quantity. The two coincide only when
    // every group is a single instance.
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
    const stats = renderer.frame({
      instances: [instance(1), instance(2), instance(3), instance(4)],
      bands: [],
    });
    expect(draws.length).toBe(stats.draws);
  });

  it("draws each instance's own mesh, not every mesh the model references", () => {
    // A model's parts have their own materials, so the note layer emits one instance per (record,
    // mesh). Drawing the whole model for each instance would draw every part once per part and put
    // the mesh's own program and pass out of reach.
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(3), options());
    const stats = renderer.frame({
      instances: [
        instance(1, "note/model/1", "mesh/m0"),
        instance(1, "note/model/1", "mesh/m1"),
        instance(1, "note/model/1", "mesh/m2"),
      ],
      bands: [],
    });
    expect(draws.length).toBe(3);
    expect(stats.draws).toBe(3);
    // One draw per mesh, each against that mesh's own vertex array.
    expect(new Set(draws.map((d) => d.vao)).size).toBe(3);
    // Each draw carries exactly the one instance that named it.
    expect(draws.map((d) => d.instances)).toEqual([1, 1, 1]);
  });

  it("re-batches one sort position so each mesh is drawn once", () => {
    // The note layer emits a model's parts in record order, so a span at one sort position reads
    // m0, m1, m2, m0, m1, m2 — no contiguous run covers a mesh, and batching runs alone would make
    // the draw count track the instance count. Re-batching the span by mesh is what brings it back
    // to one draw per mesh; the reference does the same within an equal-(key, depth, pass) span.
    const { gl, draws } = recordingGl();
    const pack = packWithRealMesh(3);
    const renderer = createNoteRenderer(gl, pack, options());
    // Every instance shares (model, depth), so all six are one sort position, and their meshes
    // repeat with a period of three.
    const parts = ["mesh/m0", "mesh/m1", "mesh/m2"];
    const order = [0, 1, 2, 0, 1, 2];
    renderer.frame({
      instances: order.map((p) => instance(7, "note/model/1", parts[p])),
      bands: [],
    });
    // Three meshes, so three draws — not six.
    expect(draws.length).toBe(3);
    expect(draws.map((d) => d.instances)).toEqual([2, 2, 2]);
  });

  it("leaves a span alone when its mesh pattern is ragged", () => {
    // Re-batching is only safe where the parts repeat: a record that draws a different set of meshes
    // would be regrouped against a pattern that does not describe it, which changes the blend order
    // for no gain.
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(3), options());
    renderer.frame({
      instances: [
        instance(7, "note/model/1", "mesh/m0"),
        instance(7, "note/model/1", "mesh/m1"),
        instance(7, "note/model/1", "mesh/m2"),
        instance(7, "note/model/1", "mesh/m0"),
      ],
      bands: [],
    });
    // The trailing record is short, so the span keeps the sorted order and each instance is its own
    // draw's worth of run.
    expect(draws.length).toBe(4);
  });

  it("does not re-batch across two depths", () => {
    // Two sort positions must stay separate: depth is what the pass orders by, so merging them would
    // reorder the very thing the sort decided.
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(2), options());
    renderer.frame({
      instances: [
        instance(9, "note/model/1", "mesh/m0"),
        instance(9, "note/model/1", "mesh/m1"),
        instance(3, "note/model/1", "mesh/m0"),
        instance(3, "note/model/1", "mesh/m1"),
      ],
      bands: [],
    });
    // Two depths, two meshes each: the runs are m0,m1 then m0,m1, so four draws and no regrouping.
    expect(draws.length).toBe(4);
  });

  it("rejects an instance naming a mesh its model does not carry", () => {
    // Substituting another mesh would draw the wrong part with the wrong material, which reads as a
    // modelling error rather than as a pairing bug.
    const { gl } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
    expect(() =>
      renderer.frame({ instances: [instance(1, "note/model/1", "mesh/absent")], bands: [] }),
    ).toThrow(/no mesh named mesh\/absent/);
  });

  it("rejects a model that lists the same mesh twice", () => {
    // Mesh names key the per-model lookup; a repeat would let one material silently shadow the other.
    const pack = packWithRealMesh(1);
    const model = pack.entries.get("note/model/1")!;
    const meta = model.meta as { meshes: string[]; materials: unknown[] };
    meta.meshes = [...meta.meshes, meta.meshes[0]];
    meta.materials = [...meta.materials, meta.materials[0]];
    const { gl } = recordingGl();
    expect(() => createNoteRenderer(gl, pack, options())).toThrow(/more than once/);
  });

  it("takes the pass from the mesh's material, so one model can span two passes", () => {
    // A note's effect part draws in the transparent pass while its body draws in the opaque one.
    // Reading the pass off the model would put both in one pass and lose the effect's ordering.
    const { gl, draws } = recordingGl();
    const pack = packWithRealMesh(2);
    const entry = pack.entries.get("note/model/1")!;
    entry.meta.materials = [
      material("mesh/m0", { pass: 0 }),
      material("mesh/m1", { pass: 2, program: "test" }),
    ];
    const renderer = createNoteRenderer(
      gl,
      pack,
      options({
        passSortModes: new Map([
          [0, "depthAscending"],
          [2, "keyAscending"],
        ]),
      }),
    );
    renderer.frame({
      instances: [instance(5, "note/model/1", "mesh/m0"), instance(1, "note/model/1", "mesh/m1")],
      bands: [],
    });
    // Both parts are drawn, and pass 0 is submitted before pass 2 regardless of arrival order.
    expect(draws.length).toBe(2);
    expect(draws.map((d) => d.instances)).toEqual([1, 1]);
  });

  it("selects the program the model entry names", () => {
    const { gl, draws, programs } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
    renderer.frame({ instances: [instance(1)], bands: [] });
    // The renderer compiles one program for the pack's single shader.
    expect(programs.length).toBe(1);
    expect(draws[0].program).toBe(programs[0]);
  });

  it("uploads each draw's instances from its own base", () => {
    // WebGL2 has no base-instance argument, so a draw whose instances are not first in the buffer
    // must upload them from their own base. Reading that base back out of the sub-data call is what
    // proves the right instances reached the GPU.
    const { gl, draws } = recordingGl();
    const pack = packWithRealMesh(1, 1);
    const renderer = createNoteRenderer(
      gl,
      pack,
      options({
        passOfMesh: new Map([
          ["note/model/1|mesh/m0", 2],
          ["note/model/extra0|mesh/extra0", 2],
        ]),
      }),
    );
    renderer.frame({
      instances: [
        instance(1, "note/model/1", "mesh/m0"),
        instance(2, "note/model/1", "mesh/m0"),
        instance(3, "note/model/extra0", "mesh/extra0"),
      ],
      bands: [],
    });
    // All three share one key, and `keyAscending` breaks the tie on depth *descending*, so the
    // extra model's instance (depth 3) is submitted first: it takes base 0, then model 1's two take
    // base 1. The base is read back out of the sub-data call, so this pins which instances the GPU
    // actually received for each draw.
    expect(draws.map((d) => d.instanceData)).toEqual([0, 1]);
    expect(draws.map((d) => d.instances)).toEqual([1, 2]);
  });

  it("skips a model whose shader could not be instantiated", () => {
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
    // A model name with no binding must not be drawn with whatever program the previous draw bound.
    const stats = renderer.frame({
      instances: [instance(1, "note/model/does-not-exist")],
      bands: [],
    });
    expect(draws.length).toBe(0);
    expect(stats.instances).toBe(0);
  });

  describe("bands", () => {
    const band = (first: number, vertices: number, key = 0, profile = "note/band/hold") => ({
      profile,
      first,
      vertices,
      key,
      scalar: 0.5,
    });
    const bandOptions = (over: Partial<NoteRendererOptions> = {}) =>
      options({ texturesByName: new Map([["band-image", {} as WebGLTexture]]), ...over });

    it("draws a band ahead of its pass's notes and counts it as a draw", () => {
      const { gl, calls, bandDraws } = recordingGl();
      const renderer = createNoteRenderer(gl, withBands(packWithRealMesh(1)), bandOptions());
      const stats = renderer.frame({ instances: [instance(1)], bands: [band(0, 6)] });
      expect(calls.filter((c) => c.startsWith("draw"))).toEqual([
        "drawArrays",
        "drawElementsInstanced",
      ]);
      expect(bandDraws.map((d) => [d.first, d.count])).toEqual([[0, 6]]);
      expect(stats.draws).toBe(2);
      expect(stats.bandVertices).toBe(6);
    });

    it("draws a pass that holds only bands", () => {
      const { gl, bandDraws } = recordingGl();
      const renderer = createNoteRenderer(gl, withBands(packWithRealMesh(1)), bandOptions());
      const stats = renderer.frame({ instances: [], bands: [band(0, 6)] });
      expect(bandDraws.length).toBe(1);
      expect(stats.draws).toBe(1);
    });

    it("draws a pass's bands by ascending key, equal keys in arrival order", () => {
      const { gl, bandDraws } = recordingGl();
      const renderer = createNoteRenderer(gl, withBands(packWithRealMesh(1)), bandOptions());
      renderer.frame({
        instances: [],
        bands: [band(0, 6, 5), band(6, 6, 2), band(12, 6, 5)],
      });
      expect(bandDraws.map((d) => d.first)).toEqual([6, 0, 12]);
    });

    it("uploads the vertices written to the band buffer before drawing them", () => {
      const { gl, uploads } = recordingGl();
      const renderer = createNoteRenderer(gl, withBands(packWithRealMesh(1)), bandOptions());
      renderer.bands().commit(6);
      renderer.frame({ instances: [], bands: [band(0, 6)] });
      expect(uploads).toContainEqual({ offset: 0, length: 6 * 24 });
    });

    it("sets the band's pulse scalar and the view-projection", () => {
      const { gl, uniformUploads } = recordingGl();
      const renderer = createNoteRenderer(gl, withBands(packWithRealMesh(1)), bandOptions());
      renderer.frame({ instances: [], bands: [band(0, 6)] });
      const names = uniformUploads.map((u) => u.name);
      expect(names).toContain("uScalar1d4");
      expect(names).toContain("uViewProjection");
    });

    it("applies the band's own render state", () => {
      const { gl, stateCalls } = recordingGl();
      const renderer = createNoteRenderer(gl, withBands(packWithRealMesh(1)), bandOptions());
      renderer.frame({ instances: [], bands: [band(0, 6)] });
      expect(stateCalls).toContain("cullFace 1029");
    });

    it("draws nothing for a band with no vertices", () => {
      const { gl, bandDraws } = recordingGl();
      const renderer = createNoteRenderer(gl, withBands(packWithRealMesh(1)), bandOptions());
      renderer.frame({ instances: [], bands: [band(0, 0)] });
      expect(bandDraws.length).toBe(0);
    });

    it("rejects a band the pack does not carry", () => {
      const { gl } = recordingGl();
      const renderer = createNoteRenderer(gl, withBands(packWithRealMesh(1)), bandOptions());
      expect(() =>
        renderer.frame({ instances: [], bands: [band(0, 6, 0, "note/band/none")] }),
      ).toThrow(/no band note\/band\/none/);
    });

    it("rejects a frame with more bands than the buffer can hold", () => {
      const { gl } = recordingGl();
      const renderer = createNoteRenderer(
        gl,
        withBands(packWithRealMesh(1)),
        bandOptions({ bandVertexCapacity: 6 }),
      );
      expect(() =>
        renderer.frame({ instances: [], bands: [band(0, 3), band(3, 3), band(6, 3)] }),
      ).toThrow(/3 bands, capacity 2/);
    });

    it("refuses a band whose state the pack did not compile", () => {
      const { gl } = recordingGl();
      expect(() =>
        createNoteRenderer(
          gl,
          withBands(packWithRealMesh(1), { commands: undefined }),
          bandOptions(),
        ),
      ).toThrow(/compiled render state/);
    });

    it("refuses a band with no image", () => {
      const { gl } = recordingGl();
      expect(() =>
        createNoteRenderer(
          gl,
          withBands(packWithRealMesh(1), { texture: undefined }),
          bandOptions(),
        ),
      ).toThrow(/names no image/);
    });

    it("interleaves a band between note groups of its pass by sort key", () => {
      const { gl, calls } = recordingGl();
      const renderer = createNoteRenderer(
        gl,
        withBands(packWithRealMesh(1), { layer: 20 }, { modelLayer: 20 }),
        bandOptions(),
      );
      const low = { ...instance(1), key: sortKey(0x8580, 18, 1) };
      const high = { ...instance(2), key: sortKey(0x8580, 22, 1) };
      renderer.frame({
        instances: [high, low],
        bands: [band(0, 6, sortKey(0x8580, 20, 3))],
      });
      expect(calls.filter((c) => c.startsWith("draw"))).toEqual([
        "drawElementsInstanced",
        "drawArrays",
        "drawElementsInstanced",
      ]);
    });

    it("draws a band ahead of notes that share its key", () => {
      const { gl, calls } = recordingGl();
      const renderer = createNoteRenderer(
        gl,
        withBands(packWithRealMesh(1), { layer: 20 }, { modelLayer: 20 }),
        bandOptions(),
      );
      renderer.frame({ instances: [instance(1)], bands: [band(0, 6, sortKey(0x8580, 20, 1))] });
      expect(calls.filter((c) => c.startsWith("draw"))).toEqual([
        "drawArrays",
        "drawElementsInstanced",
      ]);
    });

    it("draws bands above every note after the last group", () => {
      const { gl, calls } = recordingGl();
      const renderer = createNoteRenderer(
        gl,
        withBands(packWithRealMesh(1), { layer: 30 }, { modelLayer: 20 }),
        bandOptions(),
      );
      renderer.frame({ instances: [instance(1)], bands: [band(0, 6, sortKey(0x8580, 30, 1))] });
      expect(calls.filter((c) => c.startsWith("draw"))).toEqual([
        "drawElementsInstanced",
        "drawArrays",
      ]);
    });

    it("refuses a band in a pass that does not sort by key", () => {
      const { gl } = recordingGl();
      expect(() =>
        createNoteRenderer(
          gl,
          withBands(packWithRealMesh(1)),
          bandOptions({ passSortModes: new Map([[2, "depthAscending"]]) }),
        ),
      ).toThrow(/sorts by depthAscending/);
    });

    it("refuses a band that samples an image that was not uploaded", () => {
      const { gl } = recordingGl();
      const renderer = createNoteRenderer(
        gl,
        withBands(packWithRealMesh(1)),
        options({ texturesByName: new Map() }),
      );
      expect(() => renderer.frame({ instances: [], bands: [band(0, 6)] })).toThrow(/not uploaded/);
    });

    it("samples a band's image through a sampler built from its recorded state, released after the draw", () => {
      const { gl, bandDraws, samplers, boundSampler } = recordingGl();
      const renderer = createNoteRenderer(gl, withBands(packWithRealMesh(1)), bandOptions());
      renderer.frame({ instances: [], bands: [band(0, 6)] });
      const sampler = samplers.find((created) => created === bandDraws[0].sampler)!;
      expect(sampler).toBeDefined();
      expect([...sampler.params].sort((a, b) => a[0] - b[0])).toEqual([
        [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
        [gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST],
        [gl.TEXTURE_WRAP_S, gl.REPEAT],
        [gl.TEXTURE_WRAP_T, gl.REPEAT],
      ]);
      expect(boundSampler(0)).toBeNull();
    });

    it("maps each address and filter mode of a band's sampler state", () => {
      const modes = (state: Record<string, number>) => {
        const { gl, bandDraws } = recordingGl();
        createNoteRenderer(
          gl,
          withBands(packWithRealMesh(1), { sampler: { ...BAND_SAMPLER, ...state } }),
          bandOptions(),
        ).frame({ instances: [], bands: [band(0, 6)] });
        const params = (bandDraws[0].sampler as { params: Map<number, number> }).params;
        return [
          gl.TEXTURE_WRAP_S,
          gl.TEXTURE_WRAP_T,
          gl.TEXTURE_MIN_FILTER,
          gl.TEXTURE_MAG_FILTER,
        ].map((name) => params.get(name));
      };
      const gl = recordingGl().gl;
      expect(modes({ addressU: 2, addressV: 3, minFilter: 1, magFilter: 1, mipFilter: 0 })).toEqual(
        [gl.MIRRORED_REPEAT, gl.CLAMP_TO_EDGE, gl.NEAREST, gl.NEAREST],
      );
      expect(modes({ minFilter: 2, mipFilter: 0 })[2]).toBe(gl.LINEAR);
      expect(modes({ minFilter: 1, mipFilter: 1 })[2]).toBe(gl.NEAREST_MIPMAP_NEAREST);
      expect(modes({ minFilter: 1, mipFilter: 2 })[2]).toBe(gl.NEAREST_MIPMAP_LINEAR);
      expect(modes({ minFilter: 2, mipFilter: 2 })[2]).toBe(gl.LINEAR_MIPMAP_LINEAR);
    });

    it("refuses a band whose sampler state is missing or cannot be reproduced", () => {
      const build = (sampler: unknown) => () =>
        createNoteRenderer(
          recordingGl().gl,
          withBands(packWithRealMesh(1), { sampler }),
          bandOptions(),
        );
      expect(build(undefined)).toThrow("Band note/band/hold records no sampler state");
      expect(build({ ...BAND_SAMPLER, mipFilter: undefined })).toThrow("records no sampler state");
      expect(build({ ...BAND_SAMPLER, minFilter: 3, maxAnisotropy: 16 })).toThrow(/anisotropic/);
      expect(build({ ...BAND_SAMPLER, maxAnisotropy: 2 })).toThrow(/anisotropic/);
      expect(build({ ...BAND_SAMPLER, maxMipLevel: 1 })).toThrow(/mip level 1/);
      expect(build({ ...BAND_SAMPLER, addressU: 4 })).toThrow(/address mode 4/);
      expect(build({ ...BAND_SAMPLER, mipFilter: 3 })).toThrow(/filter/);
    });

    it("shares one sampler between bands of equal state and deletes it on dispose", () => {
      const { gl, samplers, deleted, bandDraws } = recordingGl();
      const pack = withBands(packWithRealMesh(1));
      const entries = new Map(pack.entries);
      const hold = entries.get("note/band/hold")!;
      entries.set("note/band/slide/4/1", { ...hold, name: "note/band/slide/4/1" });
      const renderer = createNoteRenderer(gl, { ...pack, entries }, bandOptions());
      renderer.frame({
        instances: [],
        bands: [band(0, 6), band(6, 6, 0, "note/band/slide/4/1")],
      });
      expect(bandDraws).toHaveLength(2);
      expect(bandDraws[1].sampler).toBe(bandDraws[0].sampler);
      renderer.dispose();
      expect(new Set(deleted.samplers)).toEqual(new Set(samplers));
    });

    it("deletes the samplers it built when a later band is refused", () => {
      const { gl, samplers, deleted } = recordingGl();
      const pack = withBands(packWithRealMesh(1));
      const entries = new Map(pack.entries);
      const hold = entries.get("note/band/hold")!;
      entries.set("note/band/slide/4/1", {
        ...hold,
        name: "note/band/slide/4/1",
        meta: { ...hold.meta, sampler: { ...BAND_SAMPLER, maxMipLevel: 1 } },
      });
      expect(() => createNoteRenderer(gl, { ...pack, entries }, bandOptions())).toThrow(
        /mip level 1/,
      );
      expect(samplers.length).toBeGreaterThan(1);
      expect(new Set(deleted.samplers)).toEqual(new Set(samplers));
    });
  });

  it("issues no draw for an empty frame", () => {
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
    const stats = renderer.frame({ instances: [], bands: [] });
    expect(draws.length).toBe(0);
    expect(stats.draws).toBe(0);
  });

  it("orders the draws by the pass sort mode", () => {
    // Two instances of the same model with different keys: ascending must submit the lower key
    // first. The order is observable because blending depends on it.
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
    const low = { ...instance(1), key: sortKey(0x8580, 20, 3), depth: 0 };
    const high = { ...instance(2), key: sortKey(0x8580, 20, 9), depth: 0 };
    renderer.frame({ instances: [high, low], bands: [] });
    // One mesh, two draws, and the lower key's instance (written first) must be the first upload.
    expect(draws.map((d) => d.instanceData)).toEqual([0, 1]);
  });

  it("reports zero draws when a model's shader is unusable", () => {
    // A program whose instanced attributes do not all resolve must be rejected at build time rather
    // than bound with a shifted layout; the model then has no binding and is skipped.
    const { gl, draws } = recordingGl();
    const broken = {
      ...packWithRealMesh(1),
    };
    // Drop aInstanceWorld3 so `createNoteRenderer` rejects the program.
    const saved = ATTRIB_LOCATIONS.aInstanceWorld3;
    ATTRIB_LOCATIONS.aInstanceWorld3 = -1;
    try {
      const renderer = createNoteRenderer(gl, broken, options());
      expect(renderer.perNoteOnly().size).toBe(1);
      const stats = renderer.frame({ instances: [instance(1)], bands: [] });
      expect(draws.length).toBe(0);
      expect(stats.draws).toBe(0);
    } finally {
      ATTRIB_LOCATIONS.aInstanceWorld3 = saved;
    }
  });
});

it("uses the index type the mesh was packed with", () => {
  // The packed meshes are u16 (they are all under 65536 vertices, which is why the packer chose
  // u16); drawing them as u32 would read each index from the wrong stride and produce garbage
  // triangles rather than an error.
  const { gl, draws } = recordingGl();
  const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
  renderer.frame({ instances: [instance(1)], bands: [] });
  expect(draws[0].indexType).toBe(0x1403); // UNSIGNED_SHORT
});

it("uploads the model's own uniforms before drawing", () => {
  // The colour and UV values are fragment-stage uniforms, so they are per draw; a dropped upload
  // leaves the previous material's value and the note is tinted wrong with no error.
  const { gl, uniformUploads } = recordingGl();
  const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
  renderer.frame({ instances: [instance(1)], bands: [] });
  // The view-projection matrix and the packed vec4 both go up for this draw.
  expect(uniformUploads.some((u) => u.kind === "matrix4fv" && u.name === "uViewProjection")).toBe(
    true,
  );
  expect(uniformUploads.some((u) => u.kind === "4fv" && u.name === "uDiffuse")).toBe(true);
});

it("transposes the view-projection on upload", () => {
  // The packed vertex stage reads `uViewProjection * vector` — the column-vector convention — and
  // `uniformMatrix4fv(..., transpose = false, data)` reads its argument as a sequence of
  // *columns*. The caller's matrix is row-major, so it has to be transposed on the way in.
  //
  // Uploading it as stored puts the camera's translation on the wrong row: every vertex then comes
  // out behind the viewer and the frame is empty, with no GL error at all. That is why this is
  // asserted on the numbers rather than on the call being made.
  const rowMajor = Float32Array.from({ length: 16 }, (_, i) => i + 1);
  const { gl, uniformUploads } = recordingGl();
  const renderer = createNoteRenderer(
    gl,
    packWithRealMesh(1),
    options({ viewProjection: rowMajor }),
  );
  renderer.frame({ instances: [instance(1)], bands: [] });
  const uploaded = uniformUploads.find(
    (u) => u.kind === "matrix4fv" && u.name === "uViewProjection",
  )?.matrix;
  // The transpose of 1..16 read row-major: entry [r][c] of the destination is [c][r] of the source.
  expect(uploaded).toEqual([1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16]);
});

it("widens a 3x4 view-projection into the same columns", () => {
  // A caller may supply the affine form; it has to widen to `(0, 0, 0, 1)` and then transpose, so
  // the result is the transpose of the widened matrix rather than of the 3x4 run.
  const affine = Float32Array.from({ length: 12 }, (_, i) => i + 1);
  const { gl, uniformUploads } = recordingGl();
  const renderer = createNoteRenderer(gl, packWithRealMesh(1), options({ viewProjection: affine }));
  renderer.frame({ instances: [instance(1)], bands: [] });
  const uploaded = uniformUploads.find(
    (u) => u.kind === "matrix4fv" && u.name === "uViewProjection",
  )?.matrix;
  // Widened row-major is [1,2,3,4, 5,6,7,8, 9,10,11,12, 0,0,0,1]; transposed, its columns become
  // rows, so the destination runs down the source's columns and ends on the implicit last row.
  expect(uploaded).toEqual([1, 5, 9, 0, 2, 6, 10, 0, 3, 7, 11, 0, 4, 8, 12, 1]);
});

function expectReleased(harness: ReturnType<typeof recordingGl>) {
  for (const [created, deleted] of [
    [harness.shaders, harness.deleted.shaders],
    [harness.programs, harness.deleted.programs],
    [harness.buffers, harness.deleted.buffers],
    [harness.vertexArrays, harness.deleted.arrays],
  ]) {
    expect(deleted.length).toBe(created.length);
    for (const resource of created)
      expect(deleted.filter((item) => item === resource)).toHaveLength(1);
  }
}

describe("frame failure recovery", () => {
  it("draws every pass again after rejecting a view-projection matrix", () => {
    const { gl, draws } = recordingGl();
    const configuration = options({
      viewProjection: new Float32Array(5),
      passOfMesh: new Map([
        ["note/model/1|mesh/m0", 2],
        ["note/model/extra0|mesh/extra0", 3],
      ]),
    });
    const renderer = createNoteRenderer(gl, packWithRealMesh(1, 1), configuration);
    const input = {
      instances: [instance(1), instance(2), instance(3, "note/model/extra0", "mesh/extra0")],
      bands: [],
    };
    expect(() => renderer.frame(input)).toThrow(/twelve or sixteen/);
    configuration.viewProjection = new Float32Array(16);
    const stats = renderer.frame(input);
    expect(draws).toHaveLength(2);
    expect(stats.instances).toBe(3);
    renderer.dispose();
  });

  it.each([1, 2])(
    "clears all passes and the bound vertex array when draw %i throws",
    (failedDraw) => {
      const harness = recordingGl();
      const { gl, draws } = harness;
      const renderer = createNoteRenderer(
        gl,
        packWithRealMesh(1, 1),
        options({
          passOfMesh: new Map([
            ["note/model/1|mesh/m0", 2],
            ["note/model/extra0|mesh/extra0", 3],
          ]),
        }),
      );
      const input = {
        instances: [instance(1), instance(2, "note/model/extra0", "mesh/extra0")],
        bands: [],
      };
      const draw = gl.drawElementsInstanced.bind(gl);
      let count = 0;
      gl.drawElementsInstanced = (...args) => {
        if (++count === failedDraw) throw new Error("draw rejected");
        draw(...args);
      };
      expect(() => renderer.frame(input)).toThrow(/draw rejected/);
      expect(harness.currentVertexArray()).toBeNull();
      gl.drawElementsInstanced = draw;
      draws.length = 0;
      renderer.frame(input);
      expect(draws).toHaveLength(2);
      renderer.dispose();
    },
  );

  it("draws a band-only pass again after its missing texture becomes available", () => {
    const { gl, bandDraws } = recordingGl();
    const textures = new Map<string, WebGLTexture>();
    const renderer = createNoteRenderer(
      gl,
      withBands(packWithRealMesh(1)),
      options({ texturesByName: textures }),
    );
    renderer.bands().commit(3);
    const input = {
      instances: [],
      bands: [
        {
          profile: "note/band/hold",
          first: 0,
          vertices: 3,
          key: sortKey(0x8580, 15, 1),
          scalar: 1,
        },
      ],
    };
    expect(() => renderer.frame(input)).toThrow(/not uploaded/);
    textures.set("band-image", {} as WebGLTexture);
    const stats = renderer.frame(input);
    expect(bandDraws).toHaveLength(1);
    expect(stats.draws).toBe(1);
    renderer.dispose();
  });
});

describe("renderer resource ownership", () => {
  it("releases every GPU resource when a late band placement check fails", () => {
    const harness = recordingGl();
    const pack = withBands(packWithRealMesh(1));
    expect(() =>
      createNoteRenderer(
        harness.gl,
        pack,
        options({ passSortModes: new Map([[2, "depthAscending"]]) }),
      ),
    ).toThrow(/sorts by/);
    expectReleased(harness);
    expect(harness.currentVertexArray()).toBeNull();
  });

  it("releases the band's vertex array when band metadata is rejected", () => {
    const harness = recordingGl();
    expect(() =>
      createNoteRenderer(
        harness.gl,
        withBands(packWithRealMesh(1), { texture: undefined }),
        options(),
      ),
    ).toThrow(/names no image/);
    expectReleased(harness);
  });

  it("releases every resource when a band attribute is missing", () => {
    const harness = recordingGl();
    const { gl } = harness;
    const attribute = gl.getAttribLocation.bind(gl);
    gl.getAttribLocation = (program, name) => (name === "aColor" ? -1 : attribute(program, name));
    expect(() => createNoteRenderer(gl, withBands(packWithRealMesh(1)), options())).toThrow(
      /lost a vertex attribute/,
    );
    expectReleased(harness);
  });

  it.each([1, 2, 3, 4])(
    "releases successful allocations when buffer %i is unavailable",
    (failedBuffer) => {
      const harness = recordingGl();
      const { gl } = harness;
      const allocate = gl.createBuffer.bind(gl);
      let count = 0;
      Object.assign(gl, { createBuffer: () => (++count === failedBuffer ? null : allocate()) });
      expect(() => createNoteRenderer(gl, packWithRealMesh(1), options())).toThrow(/buffer/i);
      expectReleased(harness);
    },
  );

  it.each([1, 2])(
    "releases successful allocations when vertex array %i is unavailable",
    (failedArray) => {
      const harness = recordingGl();
      const { gl } = harness;
      const allocate = gl.createVertexArray.bind(gl);
      let count = 0;
      Object.assign(gl, { createVertexArray: () => (++count === failedArray ? null : allocate()) });
      expect(() => createNoteRenderer(gl, packWithRealMesh(1), options())).toThrow(/vertex array/i);
      expectReleased(harness);
    },
  );

  it.each([1, 2])("releases the other shader when shader allocation %i fails", (failedShader) => {
    const harness = recordingGl();
    const { gl } = harness;
    const allocate = gl.createShader.bind(gl);
    let count = 0;
    gl.createShader = (type) => (++count === failedShader ? null : allocate(type));
    expect(() => createNoteRenderer(gl, packWithRealMesh(1), options())).toThrow(
      /Shader allocation failed/,
    );
    expectReleased(harness);
  });

  it.each([1, 2])("releases both shaders when compile check %i fails", (failedCheck) => {
    const harness = recordingGl();
    let count = 0;
    harness.gl.getShaderParameter = () => ++count !== failedCheck;
    expect(() => createNoteRenderer(harness.gl, packWithRealMesh(1), options())).toThrow(
      /shader failed to compile/,
    );
    expectReleased(harness);
  });

  it("releases shaders when program allocation fails", () => {
    const harness = recordingGl();
    Object.assign(harness.gl, { createProgram: () => null });
    expect(() => createNoteRenderer(harness.gl, packWithRealMesh(1), options())).toThrow(
      /Program allocation failed/,
    );
    expectReleased(harness);
  });

  it("releases the unlinked program and its shaders", () => {
    const harness = recordingGl();
    harness.gl.getProgramParameter = () => false;
    expect(() => createNoteRenderer(harness.gl, packWithRealMesh(1), options())).toThrow(
      /Program failed to link/,
    );
    expectReleased(harness);
  });

  it("disposes a successful renderer only once", () => {
    const harness = recordingGl();
    const renderer = createNoteRenderer(harness.gl, withBands(packWithRealMesh(1)), options());
    renderer.dispose();
    renderer.dispose();
    expectReleased(harness);
    expect(() => renderer.frame({ instances: [], bands: [] })).toThrow(/disposed/);
  });
});

describe("prepared note submission", () => {
  const order = {
    modelDepth: (joint: Float32Array, offset: number) => Math.fround(joint[3] + offset),
    bandDepth: () => 42,
    cameraPosition: [0, 0, 0],
  };
  const orderedPack = () => {
    const pack = packWithRealMesh(2);
    const model = pack.entries.get("note/model/1")!;
    const entries = new Map(pack.entries);
    entries.set(model.name, {
      ...model,
      meta: {
        ...model.meta,
        materials: [
          material("mesh/m0", { pass: 0, sortDistanceOffset: 3 }),
          material("mesh/m1", { pass: 2, sortDistanceOffset: 7 }),
        ],
      },
    });
    return { ...pack, entries };
  };

  it("prepares one sortable entry per mesh without drawing, then counts only actual submissions", () => {
    const recorded = recordingGl();
    const renderer = createNoteRenderer(
      recorded.gl,
      orderedPack(),
      options({ passOfMesh: undefined }),
    );
    try {
      const prepared = renderer.prepare(
        { instances: [instance(10), instance(20, "note/model/1", "mesh/m1")], bands: [] },
        order,
      );
      expect(recorded.draws).toHaveLength(0);
      expect(prepared.entries.map(({ pass, key, depth }) => [pass, key, depth])).toEqual([
        [0, sortKey(0x8580, 20, 1), 13],
        [2, sortKey(0x8580, 20, 1), 27],
      ]);
      expect(prepared.stats.draws).toBe(0);
      expect(prepared.entries[1].draw()).toMatchObject({ draws: 1, instances: 1 });
      expect(prepared.entries[0].draw()).toMatchObject({ draws: 1, instances: 1 });
      expect(prepared.stats).toMatchObject({ draws: 2, instances: 2, bandVertices: 0 });
      expect(recorded.draws.map((draw) => draw.instances)).toEqual([1, 1]);
      expect(() => prepared.entries[0].draw()).toThrow(/submitted/);
    } finally {
      renderer.dispose();
    }
  });

  it("takes each part's depth from the joint it sorts by rather than from its world", () => {
    const recorded = recordingGl();
    const renderer = createNoteRenderer(
      recorded.gl,
      orderedPack(),
      options({ passOfMesh: undefined }),
    );
    try {
      const item = instance(10);
      item.sortJoint = Float32Array.from(item.world);
      item.sortJoint[3] = 100;
      const prepared = renderer.prepare({ instances: [item], bands: [] }, order);
      expect(prepared.entries.map((entry) => entry.depth)).toEqual([103]);
    } finally {
      renderer.dispose();
    }
  });

  it("gives every entry of a renderer the same source, and another renderer another", () => {
    const { gl } = recordingGl();
    const renderer = createNoteRenderer(gl, orderedPack(), options({ passOfMesh: undefined }));
    const other = createNoteRenderer(gl, orderedPack(), options({ passOfMesh: undefined }));
    try {
      const items = [instance(10), instance(20, "note/model/1", "mesh/m1")];
      const first = renderer.prepare({ instances: items, bands: [] }, order).entries;
      const source = first[0].source;
      expect(source).toBeTypeOf("object");
      expect(first[1].source).toBe(source);
      const again = renderer.prepare({ instances: [instance(30)], bands: [] }, order).entries;
      expect(again[0].source).toBe(source);
      const foreign = other.prepare({ instances: [instance(10)], bands: [] }, order).entries;
      expect(foreign[0].source).not.toBe(source);
    } finally {
      renderer.dispose();
      other.dispose();
    }
  });

  it("expires entries after preparing another frame or disposal", () => {
    const { gl } = recordingGl();
    const renderer = createNoteRenderer(gl, orderedPack(), options());
    const first = renderer.prepare({ instances: [instance(1)], bands: [] }, order);
    const second = renderer.prepare({ instances: [instance(2)], bands: [] }, order);
    expect(() => first.entries[0].draw()).toThrow(/expired/i);
    renderer.dispose();
    expect(() => second.entries[0].draw()).toThrow(/disposed/i);
  });

  it("reapplies material state after a foreign draw between its entries", () => {
    const recorded = recordingGl();
    const renderer = createNoteRenderer(recorded.gl, orderedPack(), options());
    try {
      const prepared = renderer.prepare(
        { instances: [instance(1), instance(2)], bands: [] },
        order,
      );
      prepared.entries[0].draw();
      const stateCount = recorded.stateCalls.length;
      recorded.gl.bindBuffer(recorded.gl.ARRAY_BUFFER, {} as WebGLBuffer);
      recorded.gl.bindVertexArray({} as WebGLVertexArrayObject);
      prepared.entries[1].draw();
      expect(recorded.stateCalls.length).toBeGreaterThan(stateCount);
      expect(recorded.draws[1].vao).toBe(recorded.draws[0].vao);
      expect(recorded.currentVertexArray()).toBeNull();
    } finally {
      renderer.dispose();
    }
  });

  it("keeps device state between entries while the context epoch holds and reapplies it when it moves", () => {
    const recorded = recordingGl();
    const renderer = createNoteRenderer(recorded.gl, orderedPack(), options());
    let epoch = 5;
    const watched = { ...order, gpuEpoch: () => epoch };
    try {
      const prepared = renderer.prepare(
        { instances: [instance(1), instance(2), instance(3)], bands: [] },
        watched,
      );
      prepared.entries[0].draw();
      const afterFirst = recorded.stateCalls.length;
      expect(afterFirst).toBeGreaterThan(0);
      prepared.entries[1].draw();
      expect(recorded.stateCalls.length).toBe(afterFirst);
      epoch = 6;
      prepared.entries[2].draw();
      expect(recorded.stateCalls.length).toBeGreaterThan(afterFirst);
    } finally {
      renderer.dispose();
    }
  });

  it("assumes nothing about the context without an epoch", () => {
    const recorded = recordingGl();
    const renderer = createNoteRenderer(recorded.gl, orderedPack(), options());
    try {
      const prepared = renderer.prepare(
        { instances: [instance(1), instance(2)], bands: [] },
        order,
      );
      prepared.entries[0].draw();
      const afterFirst = recorded.stateCalls.length;
      prepared.entries[1].draw();
      expect(recorded.stateCalls.length).toBe(afterFirst * 2);
    } finally {
      renderer.dispose();
    }
  });

  it("uploads the view-projection and the packed uniforms once per program for a frame of entries", () => {
    const recorded = recordingGl();
    const renderer = createNoteRenderer(recorded.gl, orderedPack(), options());
    const count = () =>
      recorded.uniformUploads.filter((u) => u.kind === "matrix4fv" && u.name === "uViewProjection")
        .length;
    try {
      const frame = () =>
        renderer.prepare({ instances: [instance(1), instance(2), instance(3)], bands: [] }, order);
      for (const entry of frame().entries) entry.draw();
      expect(count()).toBe(1);
      const firstFrameUploads = recorded.uniformUploads.length;
      for (const entry of frame().entries) entry.draw();
      expect(count()).toBe(2);
      expect(recorded.uniformUploads.length - firstFrameUploads).toBeLessThan(firstFrameUploads);
    } finally {
      renderer.dispose();
    }
  });

  it("reads the clock for a prepared draw only when asked to time draws", () => {
    for (const timeDraws of [false, true]) {
      const recorded = recordingGl();
      const renderer = createNoteRenderer(recorded.gl, orderedPack(), options({ timeDraws }));
      const clock = vi.spyOn(performance, "now");
      try {
        const prepared = renderer.prepare({ instances: [instance(1)], bands: [] }, order);
        clock.mockClear();
        const result = prepared.entries[0].draw();
        expect(clock.mock.calls.length > 0).toBe(timeDraws);
        if (!timeDraws) expect(result.cpuMs).toBe(0);
      } finally {
        clock.mockRestore();
        renderer.dispose();
      }
    }
  });

  describe("merging entries at one sort position", () => {
    const twoPart = (passes: [number, number] = [2, 2], animated = false) => {
      let pack = packWithRealMesh(2);
      const model = pack.entries.get("note/model/1")!;
      const entries = new Map(pack.entries);
      const uv = { uvAnimation: { resource: "uvc/test", tracks: [0] } };
      entries.set(model.name, {
        ...model,
        meta: {
          ...model.meta,
          materials: [
            material("mesh/m0", {
              pass: passes[0],
              sortDistanceOffset: 3,
              ...(animated ? uv : {}),
            }),
            material("mesh/m1", { pass: passes[1], sortDistanceOffset: 7 }),
          ],
        },
      });
      pack = { ...pack, entries };
      return animated ? withUvResource(pack) : pack;
    };
    const part = (mesh: "mesh/m0" | "mesh/m1", depth: number, world: number, key?: number) => {
      const item = instance(world, "note/model/1", mesh);
      const joint = new Float32Array(12);
      joint[3] = depth - (mesh === "mesh/m0" ? 3 : 7);
      return { ...item, sortJoint: joint, ...(key === undefined ? {} : { key }) } as typeof item & {
        frame?: number;
      };
    };
    const sceneOrder = <T extends { key: number; depth: number }>(entries: readonly T[]): T[] =>
      entries
        .map((entry, index) => ({ entry, index }))
        .sort(
          (a, b) => a.entry.key - b.entry.key || b.entry.depth - a.entry.depth || a.index - b.index,
        )
        .map(({ entry }) => entry);
    const run = (
      pack: Pack,
      instances: ReturnType<typeof part>[],
      over: Partial<NoteRendererOptions> = {},
    ) => {
      const recorded = recordingGl();
      const renderer = createNoteRenderer(
        recorded.gl,
        pack,
        options({ passOfMesh: undefined, ...over }),
      );
      const prepared = renderer.prepare({ instances, bands: [] }, order);
      const results = sceneOrder(prepared.entries).map((entry) => entry.draw());
      return { recorded, prepared, results, renderer };
    };

    it("submits entries sharing a sort position and mesh as one instanced draw", () => {
      const { recorded, prepared, results, renderer } = run(twoPart(), [
        part("mesh/m1", 17, 1),
        part("mesh/m1", 17, 2),
        part("mesh/m1", 17, 3),
      ]);
      try {
        expect(prepared.entries).toHaveLength(3);
        expect(results.map((r) => [r.draws, r.instances])).toEqual([
          [1, 3],
          [0, 0],
          [0, 0],
        ]);
        expect(recorded.draws.map((d) => d.instances)).toEqual([3]);
        expect(recorded.uploads).toEqual([{ offset: 0, length: 36 }]);
        expect(prepared.stats).toMatchObject({ draws: 1, instances: 3 });
      } finally {
        renderer.dispose();
      }
    });

    it("writes the merged instances in arrival order", () => {
      const written: number[][] = [];
      const recorded = recordingGl();
      const sub = recorded.gl.bufferSubData.bind(recorded.gl);
      recorded.gl.bufferSubData = ((
        t: number,
        o: number,
        d: Float32Array,
        s: number,
        n: number,
      ) => {
        written.push(Array.from(d.subarray(s, s + n)));
        return sub(t, o, d, s, n);
      }) as never;
      const renderer = createNoteRenderer(
        recorded.gl,
        twoPart(),
        options({ passOfMesh: undefined }),
      );
      try {
        const prepared = renderer.prepare(
          {
            instances: [part("mesh/m1", 17, 5), part("mesh/m1", 17, 6), part("mesh/m1", 17, 7)],
            bands: [],
          },
          order,
        );
        written.length = 0;
        for (const entry of sceneOrder(prepared.entries)) entry.draw();
        expect(written).toHaveLength(1);
        const translations = [0, 1, 2].map((i) => written[0][i * 12 + 9]);
        expect(translations).toEqual([5, 6, 7]);
      } finally {
        renderer.dispose();
      }
    });

    it("merges the parts of instance-major arrival once the sort separates the meshes", () => {
      const { recorded, results, renderer } = run(twoPart(), [
        part("mesh/m0", 3, 1),
        part("mesh/m1", 7, 1),
        part("mesh/m0", 3, 2),
        part("mesh/m1", 7, 2),
      ]);
      try {
        expect(recorded.draws.map((d) => d.instances)).toEqual([2, 2]);
        expect(results.reduce((sum, r) => sum + r.draws, 0)).toBe(2);
      } finally {
        renderer.dispose();
      }
    });

    it("lets whichever merged entry is submitted first draw the run", () => {
      const recorded = recordingGl();
      const renderer = createNoteRenderer(
        recorded.gl,
        twoPart(),
        options({ passOfMesh: undefined }),
      );
      try {
        const prepared = renderer.prepare(
          { instances: [part("mesh/m1", 17, 1), part("mesh/m1", 17, 2)], bands: [] },
          order,
        );
        expect(prepared.entries[1].draw()).toMatchObject({ draws: 1, instances: 2 });
        expect(prepared.entries[0].draw()).toMatchObject({ draws: 0, instances: 0 });
        expect(() => prepared.entries[0].draw()).toThrow(/submitted/);
      } finally {
        renderer.dispose();
      }
    });

    it("does not merge entries whose keys differ", () => {
      const { recorded, renderer } = run(twoPart(), [
        part("mesh/m1", 17, 1),
        part("mesh/m1", 17, 2, sortKey(0x8580, 21, 1)),
      ]);
      try {
        expect(recorded.draws.map((d) => d.instances)).toEqual([1, 1]);
      } finally {
        renderer.dispose();
      }
    });

    it("does not merge entries at different depths", () => {
      const { recorded, renderer } = run(twoPart(), [
        part("mesh/m1", 17, 1),
        part("mesh/m1", 18, 2),
      ]);
      try {
        expect(recorded.draws.map((d) => d.instances)).toEqual([1, 1]);
      } finally {
        renderer.dispose();
      }
    });

    it("does not merge across another mesh that holds the same sort position", () => {
      const { recorded, renderer } = run(twoPart(), [
        part("mesh/m0", 10, 1),
        part("mesh/m1", 10, 1),
        part("mesh/m0", 10, 2),
      ]);
      try {
        expect(recorded.draws.map((d) => d.instances)).toEqual([1, 1, 1]);
      } finally {
        renderer.dispose();
      }
    });

    it("leaves a pass without a declared sort mode unmerged", () => {
      const { recorded, renderer } = run(
        twoPart([0, 2]),
        [part("mesh/m0", 10, 1), part("mesh/m0", 10, 2)],
        { passSortModes: new Map([[2, "keyAscending"]]) },
      );
      try {
        expect(recorded.draws.map((d) => d.instances)).toEqual([1, 1]);
      } finally {
        renderer.dispose();
      }
    });

    it("merges across keys in a pass that orders by depth alone", () => {
      const { recorded, renderer } = run(
        twoPart([0, 2]),
        [part("mesh/m0", 10, 1), part("mesh/m0", 10, 2, sortKey(0x8580, 21, 1))],
        {
          passSortModes: new Map([
            [0, "depthDescending"],
            [2, "keyAscending"],
          ]),
        },
      );
      try {
        expect(recorded.draws.map((d) => d.instances)).toEqual([2]);
      } finally {
        renderer.dispose();
      }
    });

    it("does not merge across a same-depth entry of another mesh in a depth-only pass", () => {
      const { recorded, renderer } = run(
        twoPart([0, 0]),
        [part("mesh/m0", 10, 1), part("mesh/m1", 10, 1), part("mesh/m0", 10, 2)],
        { passSortModes: new Map([[0, "depthDescending"]]) },
      );
      try {
        expect(recorded.draws.map((d) => d.instances)).toEqual([1, 1, 1]);
      } finally {
        renderer.dispose();
      }
    });

    it("merges only instances that sample the same animation frame", () => {
      const sameFrame = run(twoPart([2, 2], true), [
        { ...part("mesh/m0", 3, 1), frame: 0 },
        { ...part("mesh/m0", 3, 2), frame: 0 },
        { ...part("mesh/m0", 3, 3), frame: 4 },
      ]);
      try {
        expect(sameFrame.recorded.draws.map((d) => d.instances)).toEqual([2, 1]);
      } finally {
        sameFrame.renderer.dispose();
      }
      const alternating = run(twoPart([2, 2], true), [
        { ...part("mesh/m0", 3, 1), frame: 0 },
        { ...part("mesh/m0", 3, 2), frame: 4 },
        { ...part("mesh/m0", 3, 3), frame: 0 },
      ]);
      try {
        expect(alternating.recorded.draws.map((d) => d.instances)).toEqual([1, 1, 1]);
      } finally {
        alternating.renderer.dispose();
      }
    });
  });

  it("rejects missing ordering metadata and missing models without submitting partial draws", () => {
    const recorded = recordingGl();
    const renderer = createNoteRenderer(recorded.gl, packWithRealMesh(1), options());
    try {
      expect(() => renderer.prepare({ instances: [instance(1)], bands: [] }, order)).toThrow(
        /sort distance/i,
      );
      expect(() =>
        renderer.prepare({ instances: [instance(1, "note/model/absent")], bands: [] }, order),
      ).toThrow(/model/i);
      expect(recorded.draws).toHaveLength(0);
    } finally {
      renderer.dispose();
    }
  });
});

it("rejects a required model before entering a ready renderer when its shader has no usable binding", () => {
  const recorded = recordingGl();
  expect(() =>
    createNoteRenderer(
      recorded.gl,
      packWithRealMesh(1),
      options({
        requiredModels: ["note/model/absent"],
      }),
    ),
  ).toThrow(/required model.*absent/i);
  expect(recorded.deleted.programs.length).toBeGreaterThan(0);
});

it("does not count an empty prepared band as a submitted draw", () => {
  const recorded = recordingGl();
  const renderer = createNoteRenderer(
    recorded.gl,
    withBands(packWithRealMesh(1)),
    options({ texturesByName: new Map([["band-image", {} as WebGLTexture]]) }),
  );
  try {
    const frame = renderer.prepare(
      {
        instances: [],
        bands: [{ profile: "note/band/hold", first: 0, vertices: 0, key: 1, scalar: 1 }],
      },
      { modelDepth: () => 0, bandDepth: () => 0, cameraPosition: [0, 0, 0] },
    );
    expect(frame.entries).toHaveLength(0);
    expect(frame.stats.draws).toBe(0);
  } finally {
    renderer.dispose();
  }
});

describe("materials whose fragment stage scrolls its UV", () => {
  it("refuses a required model whose scrolling material has neither a UV binding nor a packed transform", () => {
    const { gl } = recordingGl();
    expect(() =>
      createNoteRenderer(gl, scrollingPack(), options({ requiredModels: ["note/model/1"] })),
    ).toThrow(/note\/model\/1.*mesh\/m0.*UV/);
  });

  it("draws a scrolling material with its packed transform", () => {
    const { gl, draws, uniformUploads } = recordingGl();
    const renderer = createNoteRenderer(
      gl,
      scrollingPack({
        uniforms: {
          uDiffuse: { type: "vec4", value: [1, 1, 1, 1] },
          uUvOffsetScale: { type: "vec4", value: [0, 0, 1, 1] },
        },
      }),
      options({ requiredModels: ["note/model/1"] }),
    );
    try {
      renderer.frame({ instances: [instance(1)], bands: [] });
      expect(draws.map((d) => d.instances)).toEqual([1]);
      expect(uniformUploads.filter((u) => u.name === "uUvOffsetScale").map((u) => u.value)).toEqual(
        [[0, 0, 1, 1]],
      );
    } finally {
      renderer.dispose();
    }
  });

  it("refuses a required model whose instance colour carries a transform the material never animates", () => {
    const { gl } = recordingGl();
    expect(() =>
      createNoteRenderer(
        gl,
        scrollingPack({
          instanceUvBytes: true,
          uniforms: { uUvOffsetScale: { type: "vec4", value: [0, 0, 1, 1] } },
        }),
        options({ requiredModels: ["note/model/1"] }),
      ),
    ).toThrow(/note.model.1.*instance colour/);
    expect(() =>
      createNoteRenderer(
        gl,
        withUvResource(
          scrollingPack({
            uvAnimation: { resource: "uvc/test", tracks: [0] },
            instanceUvBytes: 1,
          }),
        ),
        options({ requiredModels: ["note/model/1"] }),
      ),
    ).toThrow(/note.model.1.*instance colour/);
  });

  it("draws a scrolling material with a UV animation binding", () => {
    const { gl, draws } = recordingGl();
    const renderer = createNoteRenderer(
      gl,
      withUvResource(scrollingPack({ uvAnimation: { resource: "uvc/test", tracks: [0] } })),
      options({ requiredModels: ["note/model/1"] }),
    );
    try {
      renderer.frame({ instances: [instance(1)], bands: [], animationFrame: 0 });
      expect(draws.map((d) => d.instances)).toEqual([1]);
    } finally {
      renderer.dispose();
    }
  });
});

describe("material samplers", () => {
  /** The real-mesh pack with model 1's single material replaced by `over`. */
  const withMaterial = (over: Record<string, unknown>): Pack => {
    const pack = packWithRealMesh(1);
    const entries = new Map(pack.entries);
    const model = entries.get("note/model/1")!;
    entries.set(model.name, {
      ...model,
      meta: { ...model.meta, materials: [material("mesh/m0", over)] },
    });
    return { ...pack, entries };
  };

  it("samples each slot through a sampler built from its material's recorded state, released after the draw", () => {
    const { gl, draws, samplers, boundSampler } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(1), options());
    try {
      renderer.frame({ instances: [instance(1)], bands: [] });
      expect(samplers).toHaveLength(1);
      expect(draws.map((draw) => draw.sampler)).toEqual([samplers[0]]);
      expect([...samplers[0].params].sort((a, b) => a[0] - b[0])).toEqual([
        [gl.TEXTURE_MAG_FILTER, gl.LINEAR],
        [gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR],
        [gl.TEXTURE_WRAP_S, gl.REPEAT],
        [gl.TEXTURE_WRAP_T, gl.REPEAT],
      ]);
      expect(boundSampler(0)).toBeNull();
    } finally {
      renderer.dispose();
    }
  });

  it("shares one sampler between materials of equal state and deletes it on dispose", () => {
    const { gl, samplers, deleted } = recordingGl();
    const renderer = createNoteRenderer(gl, packWithRealMesh(1, 1), options());
    expect(samplers).toHaveLength(1);
    renderer.dispose();
    expect(deleted.samplers).toEqual(samplers);
  });

  it("gives each material its own sampler when their recorded states differ", () => {
    const { gl, samplers } = recordingGl();
    const pack = packWithRealMesh(1, 1);
    const entries = new Map(pack.entries);
    const extra = entries.get("note/model/extra0")!;
    entries.set(extra.name, {
      ...extra,
      meta: {
        ...extra.meta,
        materials: [material("mesh/extra0", { samplers: [{ ...MODEL_SAMPLER, addressU: 3 }] })],
      },
    });
    const renderer = createNoteRenderer(gl, { ...pack, entries }, options());
    try {
      expect(samplers.map((sampler) => sampler.params.get(gl.TEXTURE_WRAP_S))).toEqual([
        gl.REPEAT,
        gl.CLAMP_TO_EDGE,
      ]);
    } finally {
      renderer.dispose();
    }
  });

  it("refuses a required model whose sampled material records no sampler state", () => {
    for (const samplers of [undefined, []]) {
      const { gl } = recordingGl();
      expect(() =>
        createNoteRenderer(
          gl,
          withMaterial({ samplers }),
          options({ requiredModels: ["note/model/1"] }),
        ),
      ).toThrow(/note\/model\/1 part 0 records no sampler state/);
    }
  });

  it("refuses a required model whose material sampler cannot be reproduced", () => {
    const { gl, samplers, deleted } = recordingGl();
    expect(() =>
      createNoteRenderer(
        gl,
        withMaterial({ samplers: [{ ...MODEL_SAMPLER, minFilter: 3, maxAnisotropy: 16 }] }),
        options({ requiredModels: ["note/model/1"] }),
      ),
    ).toThrow(/note\/model\/1 part 0 slot 0 samples anisotropically/);
    expect(deleted.samplers).toEqual(samplers);
  });

  it("records no sampler for a material that samples no image", () => {
    const { gl, samplers, draws } = recordingGl();
    const renderer = createNoteRenderer(
      gl,
      withMaterial({ textures: [], samplers: [] }),
      options(),
    );
    try {
      renderer.frame({ instances: [instance(1)], bands: [] });
      expect(samplers).toHaveLength(0);
      expect(draws).toHaveLength(1);
    } finally {
      renderer.dispose();
    }
  });
});
