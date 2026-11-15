import { describe, expect, it } from "vitest";
import { MESH_LAYOUTS, bindMesh, meshRuns, type MeshTarget } from "./meshBinding";
/**
 * A fake context that models vertex-array state, because `bindVertexArray` and `bindBuffer` are not
 * independent: `ELEMENT_ARRAY_BUFFER` is recorded by whichever array is current at the time.
 *
 * The first fake recorded calls but not state, so it could not tell a mesh whose index buffer landed
 * in its own array from one whose array inherited a neighbour's. That is the whole of the ordering
 * contract below, so the state has to be modelled for the test to have anything to assert.
 */
function fakeElementStateGl() {
  // Every buffer carries the byte length its upload gave it, so the index run in an array can be
  // named by size rather than by identity.
  const buffers: {
    byteLength: number;
  }[] = [];
  const current = { array: null as WebGLVertexArrayObject | null, element: null as unknown };
  const arrays = new Map<
    WebGLVertexArrayObject,
    {
      element: unknown;
    }
  >();
  const target = {
    FLOAT: 0x1406,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    createBuffer: () => {
      const buffer = { byteLength: 0 };
      buffers.push(buffer);
      return buffer as unknown as WebGLBuffer;
    },
    createVertexArray: () => ({}) as WebGLVertexArrayObject,
    bindBuffer: (t: number, buffer: unknown) => {
      // Only the element-buffer binding is array state; the array-buffer binding is global.
      if (t !== 0x8893) return;
      current.element = buffer;
      if (current.array) arrays.get(current.array)!.element = buffer;
    },
    bufferData: (t: number, data: ArrayBufferView) => {
      if (t === 0x8893 && current.element)
        (
          current.element as {
            byteLength: number;
          }
        ).byteLength = data.byteLength;
    },
    bindVertexArray: (vao: WebGLVertexArrayObject | null) => {
      current.array = vao;
      // Binding an array restores the element-buffer binding that array recorded.
      if (vao && !arrays.has(vao)) arrays.set(vao, { element: null });
      if (vao) current.element = arrays.get(vao)!.element;
    },
    vertexAttribPointer: () => {},
    enableVertexAttribArray: () => {},
  } as unknown as MeshTarget;
  const created = { buffers: [], vertexArrays: [] } as unknown as {
    buffers: WebGLBuffer[];
    vertexArrays: WebGLVertexArrayObject[];
  };
  return { target, created, arrays, buffers };
}
/** The byte length of the index run the given array recorded, or null when it recorded none. */
const indexBytesOf = (
  harness: ReturnType<typeof fakeElementStateGl>,
  vao: WebGLVertexArrayObject,
) =>
  (
    harness.arrays.get(vao)?.element as {
      byteLength: number;
    } | null
  )?.byteLength ?? null;
/** Records the binding calls so the layout can be asserted without a GL context. */
function fakeMeshGl() {
  const attributes: {
    index: number;
    size: number;
    type: number;
    normalized: boolean;
    stride: number;
    offset: number;
  }[] = [];
  const arrays: {
    target: number;
    byteLength: number;
  }[] = [];
  const target: MeshTarget = {
    // The enum values the binding reads; the real values are irrelevant to the layout assertions,
    // but the binding must not assume they are undefined.
    FLOAT: 0x1406,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    createBuffer: () => ({}) as WebGLBuffer,
    createVertexArray: () => ({}) as WebGLVertexArrayObject,
    bindBuffer: () => {},
    bufferData: (_t, data) =>
      arrays.push({
        target: -1,
        byteLength: (
          data as {
            byteLength: number;
          }
        ).byteLength,
      }),
    bindVertexArray: () => {},
    vertexAttribPointer: (index, size, type, normalized, stride, offset) =>
      attributes.push({ index, size, type, normalized, stride, offset }),
    enableVertexAttribArray: () => {},
  };
  const created = { buffers: [], vertexArrays: [] } as unknown as {
    buffers: WebGLBuffer[];
    vertexArrays: WebGLVertexArrayObject[];
  };
  return { target, attributes, arrays, created };
}
describe("packed mesh layouts", () => {
  it("lays each layout out end to end with no gaps and no overlap", () => {
    // The offsets are the packer's, and the packer writes the runs contiguously; a gap or an
    // overlap here would read a neighbour's bytes as a position or a colour.
    for (const layout of Object.values(MESH_LAYOUTS)) {
      const spans = Object.values(layout.attributes)
        .map((a) => ({ start: a.offset, end: a.offset + a.size * (a.normalized ? 1 : 4) }))
        .sort((a, b) => a.start - b.start);
      let expected = 0;
      for (const span of spans) {
        expect({ layout: layout.name, start: span.start }).toEqual({
          layout: layout.name,
          start: expected,
        });
        expected = span.end;
      }
      expect({ layout: layout.name, end: expected }).toEqual({
        layout: layout.name,
        end: layout.stride,
      });
    }
  });
  it("records the colour attribute as normalised bytes", () => {
    // Colour is four u8 components, not four floats: binding it as FLOAT would read the following
    // vertices' bytes as colour and shift every attribute after it.
    expect(MESH_LAYOUTS.pos_uv0_color.attributes.aColor).toEqual({
      offset: 20,
      size: 4,
      normalized: true,
    });
    expect(MESH_LAYOUTS.pos_uv0_uv1_color.attributes.aColor).toEqual({
      offset: 28,
      size: 4,
      normalized: true,
    });
  });
});
describe("meshRuns", () => {
  it("splits the index run off the end of the entry", () => {
    // 3 vertices x 20 bytes + 3 u16 indices.
    const bytes = new Uint8Array(60 + 6);
    const runs = meshRuns(bytes, 3, "u16");
    expect(runs.vertices.length).toBe(60);
    expect(runs.indices.length).toBe(6);
  });
  it("rejects an entry too short for its index count", () => {
    expect(() => meshRuns(new Uint8Array(4), 100, "u16")).toThrow(/cannot hold/);
  });
});
describe("bindMesh", () => {
  it("binds each attribute at its own offset and stride", () => {
    const { target, attributes, created } = fakeMeshGl();
    const locations = new Map([
      ["aPosition", 0],
      ["aUv0", 1],
      ["aColor", 2],
    ]);
    bindMesh(
      target,
      {
        name: "mesh/test",
        layout: "pos_uv0_color",
        stride: 24,
        vertexCount: 1,
        indexCount: 3,
        indexType: "u16",
      },
      new Uint8Array(24 + 6),
      locations,
      created,
    );
    expect(attributes).toEqual([
      { index: 0, size: 3, type: expect.any(Number), normalized: false, stride: 24, offset: 0 },
      { index: 1, size: 2, type: expect.any(Number), normalized: false, stride: 24, offset: 12 },
      { index: 2, size: 4, type: expect.any(Number), normalized: true, stride: 24, offset: 20 },
    ]);
  });
  it("skips an attribute the program does not declare", () => {
    // A program without aUv1 must not be bound to it; binding location -1 is a silent no-op on some
    // drivers and an error on others, so the attribute is left alone.
    const { target, attributes, created } = fakeMeshGl();
    const locations = new Map([
      ["aPosition", 0],
      ["aUv0", 1],
      ["aUv1", -1],
      ["aColor", 2],
    ]);
    bindMesh(
      target,
      {
        name: "mesh/test",
        layout: "pos_uv0_uv1_color",
        stride: 32,
        vertexCount: 1,
        indexCount: 3,
        indexType: "u16",
      },
      new Uint8Array(32 + 6),
      locations,
      created,
    );
    expect(attributes.map((a) => a.index)).toEqual([0, 1, 2]);
  });
  it("rejects a stride that disagrees with the recorded layout", () => {
    const { target, created } = fakeMeshGl();
    expect(() =>
      bindMesh(
        target,
        {
          name: "mesh/bad",
          layout: "pos_uv0",
          stride: 24,
          vertexCount: 1,
          indexCount: 3,
          indexType: "u16",
        },
        new Uint8Array(24 + 6),
        new Map(),
        created,
      ),
    ).toThrow(/layout pos_uv0 is 20/);
  });
  it("rejects an unknown layout name rather than guessing offsets", () => {
    const { target, created } = fakeMeshGl();
    expect(() =>
      bindMesh(
        target,
        {
          name: "mesh/bad",
          layout: "pos_uv0_tangent",
          stride: 24,
          vertexCount: 1,
          indexCount: 3,
          indexType: "u16",
        },
        new Uint8Array(24 + 6),
        new Map(),
        created,
      ),
    ).toThrow(/Unknown packed mesh layout/);
  });
  it("rejects a vertex run that does not cover the recorded vertex count", () => {
    const { target, created } = fakeMeshGl();
    expect(() =>
      bindMesh(
        target,
        {
          name: "mesh/bad",
          layout: "pos_uv0",
          stride: 20,
          vertexCount: 4,
          indexCount: 3,
          indexType: "u16",
        },
        new Uint8Array(20 + 6),
        new Map(),
        created,
      ),
    ).toThrow(/vertex run is/);
  });
});
describe("element buffer ownership", () => {
  it("records each mesh's own index run, not the previously bound mesh's", () => {
    // `ELEMENT_ARRAY_BUFFER` is vertex-array state, so an index buffer bound while a *different*
    // array is current is recorded by that other array. Binding the second mesh then drawing the
    // first would use the second mesh's indices — wrong geometry, no error, and the count mismatch
    // that follows is what raised INVALID_OPERATION on every multi-mesh model.
    const harness = fakeElementStateGl();
    const { target, created } = harness;
    const locations = new Map([
      ["aPosition", 0],
      ["aUv0", 1],
    ]);
    // Two meshes with different index counts, so their runs are distinguishable by size.
    const mesh = (indexCount: number) => ({
      name: `mesh/${indexCount}`,
      layout: "pos_uv0",
      stride: 20,
      vertexCount: 1,
      indexCount,
      indexType: "u16" as const,
    });
    const first = bindMesh(target, mesh(3), new Uint8Array(20 + 6), locations, created);
    const second = bindMesh(target, mesh(9), new Uint8Array(20 + 18), locations, created);
    expect(indexBytesOf(harness, first.vertexArray)).toBe(6);
    expect(indexBytesOf(harness, second.vertexArray)).toBe(18);
  });
  it("records the index run for a mesh whose geometry another program already built", () => {
    // A shared mesh skips geometry creation, so no index buffer is made on this call — the array
    // built here still has to record the mesh's existing one. Skipping that bind leaves the array
    // with whatever the previously current array recorded.
    const harness = fakeElementStateGl();
    const { target, created } = harness;
    const entry = {
      name: "mesh/shared",
      layout: "pos_uv0",
      stride: 20,
      vertexCount: 1,
      indexCount: 9,
      indexType: "u16" as const,
    };
    const donor = bindMesh(
      target,
      entry,
      new Uint8Array(20 + 18),
      new Map([["aPosition", 0]]),
      created,
    );
    // A second program's array over the same geometry; its own index run is already made.
    const shared = bindMesh(
      target,
      entry,
      new Uint8Array(20 + 18),
      new Map([["aPosition", 2]]),
      created,
      donor.geometry,
    );
    expect(shared.vertexArray).not.toBe(donor.vertexArray);
    expect(indexBytesOf(harness, shared.vertexArray)).toBe(18);
  });
});
describe("shared mesh geometry", () => {
  it("reuses the mesh's buffers across programs but builds a fresh vertex array each time", () => {
    // The buffers belong to the mesh and the vertex array belongs to the program: a program's
    // attribute locations differ from its neighbours' (measured on the real pack: the world-matrix
    // slots are 2..5, 3..6 and 4..7 in different programs), so one vertex array cannot serve two
    // programs. Sharing the buffers is what keeps 185 meshes from being uploaded five times over.
    const { target, created } = fakeMeshGl();
    const entry = {
      name: "mesh/test",
      layout: "pos_uv0",
      stride: 20,
      vertexCount: 1,
      indexCount: 3,
      indexType: "u16" as const,
    };
    const bytes = new Uint8Array(20 + 6);
    const first = bindMesh(
      target,
      entry,
      bytes,
      new Map([
        ["aPosition", 0],
        ["aUv0", 1],
      ]),
      created,
    );
    const second = bindMesh(
      target,
      entry,
      bytes,
      new Map([
        ["aPosition", 2],
        ["aUv0", 3],
      ]),
      created,
      first.geometry,
    );
    expect(second.geometry).toBe(first.geometry);
    expect(second.vertexArray).not.toBe(first.vertexArray);
    // Two buffers total (the mesh's), not four: the second call created no geometry.
    expect(created.buffers.length).toBe(2);
    expect(created.vertexArrays.length).toBe(2);
  });
});
