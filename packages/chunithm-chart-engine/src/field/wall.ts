export interface FieldWallData {
  /** The 12 vertices as the reference lays them out: position, colour bytes at 12..15, uv at 16..23. */
  readonly template: Uint8Array;
  /** Binary32 bit patterns of the z of each selectable row. */
  readonly zBits: Uint32Array;
  readonly stride: number;
  readonly count: number;
}

export interface FieldWallAttributes {
  readonly aPosition: Float32Array;
  readonly aColor: Float32Array;
  readonly aUv0: Float32Array;
}

const bits = new DataView(new ArrayBuffer(4));
const Z_OFFSET = 8;
const COLOR_AT = [14, 13, 12, 15] as const;

export function wallZ(wall: FieldWallData, rawId: number): number {
  if (!Number.isInteger(rawId) || rawId < 0 || rawId >= wall.zBits.length)
    throw new RangeError("FieldWall rawId must be 0..16");
  bits.setUint32(0, wall.zBits[rawId], true);
  return bits.getFloat32(0, true);
}

export function wallVertexBytes(wall: FieldWallData, rawId: number): Uint8Array {
  const z = wallZ(wall, rawId);
  const bytes = Uint8Array.from(wall.template);
  const view = new DataView(bytes.buffer);
  for (let offset = Z_OFFSET; offset < bytes.length; offset += wall.stride)
    view.setFloat32(offset, z, true);
  return bytes;
}

export function wallAttributes(wall: FieldWallData, rawId: number): FieldWallAttributes {
  const bytes = wallVertexBytes(wall, rawId);
  const view = new DataView(bytes.buffer);
  const aPosition = new Float32Array(wall.count * 3);
  const aColor = new Float32Array(wall.count * 4);
  const aUv0 = new Float32Array(wall.count * 2);
  for (let v = 0; v < wall.count; v++) {
    const offset = v * wall.stride;
    for (let c = 0; c < 3; c++) aPosition[v * 3 + c] = view.getFloat32(offset + c * 4, true);
    COLOR_AT.forEach((at, c) => {
      aColor[v * 4 + c] = Math.fround(view.getUint8(offset + at) / 255);
    });
    aUv0[v * 2] = view.getFloat32(offset + 16, true);
    aUv0[v * 2 + 1] = view.getFloat32(offset + 20, true);
  }
  return { aPosition, aColor, aUv0 };
}
