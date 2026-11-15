/**
 * Mesh geometry binding: the `mesh/*` pack entries turned into drawable buffers.
 *
 * Each packed mesh is one interleaved vertex run followed by an index run, with the layout, stride
 * and index type recorded in its own `meta`. Nothing here assumes a layout: the attribute offsets
 * come from the recorded layout name, so a mesh without a second UV set or without vertex colours
 * does not get bound to attributes its shader cannot read.
 *
 * The buffers are created once per distinct mesh and shared by every model entry that references
 * them — the pack deduplicates meshes by content, and 185 meshes back 322 model entries, so binding
 * per model entry would upload the same geometry many times over.
 */

import type { Pack } from "../assets/packFormat";

/** Byte offsets and component counts of the attributes a packed layout carries. */
export interface MeshLayout {
  readonly name: string;
  readonly stride: number;
  /** Attribute name to `{ offset, size, normalized }`, in the order the vertex stage declares them. */
  readonly attributes: Readonly<
    Record<string, { offset: number; size: number; normalized: boolean }>
  >;
}

/**
 * The three layouts the packer emits, keyed by the name it records.
 *
 * `pos_uv0_color` carries colour as four normalised u8 components, which is why the attribute table
 * has to travel with the layout rather than being derived from the stride alone.
 */
export const MESH_LAYOUTS: Readonly<Record<string, MeshLayout>> = Object.freeze({
  pos_uv0: Object.freeze({
    name: "pos_uv0",
    stride: 20,
    attributes: Object.freeze({
      aPosition: { offset: 0, size: 3, normalized: false },
      aUv0: { offset: 12, size: 2, normalized: false },
    }),
  }),
  pos_uv0_color: Object.freeze({
    name: "pos_uv0_color",
    stride: 24,
    attributes: Object.freeze({
      aPosition: { offset: 0, size: 3, normalized: false },
      aUv0: { offset: 12, size: 2, normalized: false },
      aColor: { offset: 20, size: 4, normalized: true },
    }),
  }),
  pos_uv0_uv1_color: Object.freeze({
    name: "pos_uv0_uv1_color",
    stride: 32,
    attributes: Object.freeze({
      aPosition: { offset: 0, size: 3, normalized: false },
      aUv0: { offset: 12, size: 2, normalized: false },
      aUv1: { offset: 20, size: 2, normalized: false },
      aColor: { offset: 28, size: 4, normalized: true },
    }),
  }),
});

/** GL entry points the binding needs; structural, so a fake context can stand in. */
export interface MeshTarget {
  readonly FLOAT: number;
  readonly UNSIGNED_BYTE: number;
  readonly UNSIGNED_SHORT: number;
  readonly UNSIGNED_INT: number;
  readonly ARRAY_BUFFER: number;
  readonly ELEMENT_ARRAY_BUFFER: number;
  readonly STATIC_DRAW: number;
  createBuffer(): WebGLBuffer | null;
  createVertexArray(): WebGLVertexArrayObject | null;
  bindBuffer(target: number, buffer: WebGLBuffer | null): void;
  bufferData(target: number, data: ArrayBufferView, usage: number): void;
  bindVertexArray(vao: WebGLVertexArrayObject | null): void;
  vertexAttribPointer(
    index: number,
    size: number,
    type: number,
    normalized: boolean,
    stride: number,
    offset: number,
  ): void;
  enableVertexAttribArray(index: number): void;
}

/** One mesh's geometry: the buffers and counts, shared by every program that draws it. */
export interface MeshGeometry {
  readonly name: string;
  readonly vertexBuffer: WebGLBuffer;
  readonly indexBuffer: WebGLBuffer;
  readonly indexCount: number;
  readonly indexType: number;
  /** Layout name the mesh was packed with, for reporting. */
  readonly layout: string;
}

/** One mesh ready to draw with a particular program: its geometry and that program's vertex array. */
export interface BoundMesh {
  readonly name: string;
  readonly geometry: MeshGeometry;
  readonly vertexArray: WebGLVertexArrayObject;
}

/** Splits a packed mesh entry into its vertex and index runs. */
export function meshRuns(
  bytes: Uint8Array,
  indexCount: number,
  indexType: "u16" | "u32",
): {
  vertices: Uint8Array;
  indices: Uint8Array;
} {
  const indexBytes = indexType === "u16" ? 2 : 4;
  const split = bytes.length - indexCount * indexBytes;
  if (split < 0)
    throw new RangeError(
      `A mesh of ${bytes.length} bytes cannot hold ${indexCount} ${indexType} indices`,
    );
  return { vertices: bytes.subarray(0, split), indices: bytes.subarray(split) };
}

/**
 * Binds one mesh into a vertex array.
 *
 * The attribute table is taken from the layout the packer recorded; a layout name the runtime does
 * not know throws rather than falling back, because binding the wrong offsets would draw garbage
 * geometry that no later check would attribute to this step.
 */
export function bindMesh(
  gl: MeshTarget,
  entry: {
    name: string;
    layout: string;
    stride: number;
    vertexCount: number;
    indexCount: number;
    indexType: "u16" | "u32";
  },
  bytes: Uint8Array,
  locations: ReadonlyMap<string, number>,
  created: { buffers: WebGLBuffer[]; vertexArrays: WebGLVertexArrayObject[] },
  geometry?: MeshGeometry,
): BoundMesh {
  const layout = MESH_LAYOUTS[entry.layout];
  if (!layout) throw new RangeError(`Unknown packed mesh layout ${entry.layout}`);
  if (layout.stride !== entry.stride)
    throw new RangeError(
      `Mesh ${entry.name} records stride ${entry.stride} but layout ${entry.layout} is ${layout.stride}`,
    );

  // The index type is read from the entry rather than inferred from the byte count: a length that
  // happens to divide both ways would silently split the runs in the wrong place, and the geometry
  // would come out as garbage rather than as an error.
  const { indexType } = entry;
  const runs = meshRuns(bytes, entry.indexCount, indexType);
  if (runs.vertices.length !== entry.vertexCount * layout.stride)
    throw new RangeError(
      `Mesh ${entry.name} vertex run is ${runs.vertices.length} bytes, expected ` +
        `${entry.vertexCount * layout.stride}`,
    );

  // The buffers belong to the mesh; the vertex array belongs to the program, because the attribute
  // locations differ between programs and a vertex array records the locations it was built with.
  //
  // The array is created and bound *before* any element-buffer work, because `ELEMENT_ARRAY_BUFFER`
  // is vertex-array state rather than global state: an index buffer bound while a different array is
  // current is recorded by that other array, and this array would come out holding whatever it
  // inherited. A mesh bound second would then draw the first mesh's index run.
  const vertexArray = gl.createVertexArray();
  if (!vertexArray) throw new Error("A mesh vertex array is required");
  created.vertexArrays.push(vertexArray);
  gl.bindVertexArray(vertexArray);

  let shared = geometry;
  if (!shared) {
    const vertexBuffer = gl.createBuffer();
    if (!vertexBuffer) throw new Error("Mesh buffers are required");
    created.buffers.push(vertexBuffer);
    const indexBuffer = gl.createBuffer();
    if (!indexBuffer) throw new Error("Mesh buffers are required");
    created.buffers.push(indexBuffer);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, runs.vertices, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, runs.indices, gl.STATIC_DRAW);
    shared = {
      name: entry.name,
      vertexBuffer,
      indexBuffer,
      indexCount: entry.indexCount,
      indexType: indexType === "u16" ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
      layout: layout.name,
    };
  }

  // Geometry is shared between programs, so a mesh already built for another program arrives with
  // its buffers made; the array built here still has to record this mesh's index buffer itself.
  gl.bindBuffer(gl.ARRAY_BUFFER, shared.vertexBuffer);
  for (const [name, attribute] of Object.entries(layout.attributes)) {
    const index = locations.get(name);
    // An attribute the program does not declare is skipped, not bound at -1: binding location -1 is
    // a silent no-op in some drivers and an error in others.
    if (index === undefined || index < 0) continue;
    gl.enableVertexAttribArray(index);
    gl.vertexAttribPointer(
      index,
      attribute.size,
      attribute.normalized ? gl.UNSIGNED_BYTE : gl.FLOAT,
      attribute.normalized,
      layout.stride,
      attribute.offset,
    );
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, shared.indexBuffer);

  return { name: entry.name, geometry: shared, vertexArray };
}

/** Reads a mesh entry's binding fields out of its packed metadata. */
export function meshBindingOf(
  pack: Pack,
  name: string,
): {
  layout: string;
  stride: number;
  vertexCount: number;
  indexCount: number;
  indexType: "u16" | "u32";
  bytes: Uint8Array;
} {
  const entry = pack.entries.get(name);
  if (!entry) throw new RangeError(`No packed mesh named ${name}`);
  const meta = entry.meta as {
    layout?: unknown;
    stride?: unknown;
    vertexCount?: unknown;
    indexCount?: unknown;
    indexType?: unknown;
  };
  const layout = typeof meta.layout === "string" ? meta.layout : null;
  const stride = typeof meta.stride === "number" ? meta.stride : null;
  const vertexCount = typeof meta.vertexCount === "number" ? meta.vertexCount : null;
  const indexCount = typeof meta.indexCount === "number" ? meta.indexCount : null;
  const indexType = meta.indexType === "u16" || meta.indexType === "u32" ? meta.indexType : null;
  if (
    layout === null ||
    stride === null ||
    vertexCount === null ||
    indexCount === null ||
    indexType === null
  )
    throw new RangeError(`Mesh ${name} is missing its binding fields`);
  return {
    layout,
    stride,
    vertexCount,
    indexCount,
    indexType,
    bytes: pack.bytes.subarray(entry.offset, entry.offset + entry.length),
  };
}
