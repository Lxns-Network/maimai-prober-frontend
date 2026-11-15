export const VK_FORMAT = {
  R8G8B8A8_UNORM: 37,
  BC1_RGBA_UNORM: 133,
  BC2_UNORM: 135,
  BC3_UNORM: 137,
  ETC2_R8G8B8_UNORM: 147,
  ETC2_R8G8B8A8_UNORM: 151,
  ASTC_4x4_UNORM: 157,
} as const;

export interface Ktx2Level {
  byteOffset: number;
  byteLength: number;
  width: number;
  height: number;
}
export interface Ktx2Image {
  vkFormat: number;
  width: number;
  height: number;
  faces: 1 | 6;
  levels: Ktx2Level[];
}

const ID = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];

/** Reads the KTX2 header and level index; pixel data is not decoded. */
export function parseKtx2(bytes: Uint8Array): Ktx2Image {
  if (bytes.length < 80 || ID.some((b, i) => bytes[i] !== b))
    throw new RangeError("Not a KTX2 file");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vkFormat = v.getUint32(12, true);
  const width = v.getUint32(20, true);
  const height = v.getUint32(24, true);
  const faces = v.getUint32(36, true);
  if (
    !width ||
    !height ||
    v.getUint32(28, true) !== 0 ||
    v.getUint32(32, true) !== 0 ||
    (faces !== 1 && faces !== 6) ||
    (faces === 6 && width !== height)
  )
    throw new RangeError("Unsupported KTX2 dimensions or faces");
  const levelCount = Math.max(1, v.getUint32(40, true));
  if (levelCount > Math.floor(Math.log2(Math.max(width, height))) + 1)
    throw new RangeError("Invalid KTX2 level count");
  if (v.getUint32(44, true) !== 0) throw new RangeError("KTX2 supercompression is not supported");
  const levelIndex = 12 + 4 * 9 + 4 * 4 + 8 * 2;
  if (levelIndex + levelCount * 24 > bytes.length) throw new RangeError("Truncated KTX2 index");
  const levels: Ktx2Level[] = [];
  for (let i = 0; i < levelCount; i++) {
    const offset = v.getBigUint64(levelIndex + i * 24, true);
    const length = v.getBigUint64(levelIndex + i * 24 + 8, true);
    if (offset + length > BigInt(bytes.length))
      throw new RangeError(`KTX2 level ${i} out of range`);
    const byteOffset = Number(offset);
    const byteLength = Number(length);
    levels.push({
      byteOffset,
      byteLength,
      width: Math.max(1, width >> i),
      height: Math.max(1, height >> i),
    });
  }
  return { vkFormat, width, height, faces, levels };
}
