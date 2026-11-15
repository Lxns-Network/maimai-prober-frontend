import { describe, expect, it } from "vitest";
import { parseKtx2, VK_FORMAT } from "./ktx2";

function ktx2(vkFormat: number, w: number, h: number, levelBytes: number[]): Uint8Array {
  const id = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  const headerSize = 12 + 4 * 9 + 4 * 4 + 8 * 2 + levelBytes.length * 24;
  let offset = headerSize;
  const levels = levelBytes.map((n) => {
    const at = offset;
    offset += n;
    return { at, n };
  });
  const out = new Uint8Array(offset);
  out.set(id, 0);
  const v = new DataView(out.buffer);
  v.setUint32(12, vkFormat, true);
  v.setUint32(16, 1, true); // typeSize
  v.setUint32(20, w, true);
  v.setUint32(24, h, true);
  v.setUint32(28, 0, true); // depth
  v.setUint32(32, 0, true); // layers
  v.setUint32(36, 1, true); // faces
  v.setUint32(40, levelBytes.length, true);
  v.setUint32(44, 0, true); // supercompression
  const levelIndex = 12 + 4 * 9 + 4 * 4 + 8 * 2;
  levels.forEach(({ at, n }, i) => {
    v.setBigUint64(levelIndex + i * 24, BigInt(at), true);
    v.setBigUint64(levelIndex + i * 24 + 8, BigInt(n), true);
    v.setBigUint64(levelIndex + i * 24 + 16, BigInt(n), true);
  });
  return out;
}

describe("parseKtx2", () => {
  it("reads format, size and per-level byte ranges without touching pixels", () => {
    const img = parseKtx2(ktx2(VK_FORMAT.BC3_UNORM, 256, 128, [32768, 8192, 2048]));
    expect(img.vkFormat).toBe(VK_FORMAT.BC3_UNORM);
    expect(img.levels.map((l) => [l.width, l.height])).toEqual([
      [256, 128],
      [128, 64],
      [64, 32],
    ]);
    expect(img.levels[1].byteLength).toBe(8192);
  });
  it("rejects a non-KTX2 file", () => {
    expect(() => parseKtx2(new Uint8Array(80))).toThrow(/KTX2/);
  });
  it("rejects supercompressed payloads", () => {
    const b = ktx2(VK_FORMAT.BC1_RGBA_UNORM, 4, 4, [8]);
    new DataView(b.buffer).setUint32(44, 1, true);
    expect(() => parseKtx2(b)).toThrow(/supercompression/);
  });
  it("reads complete cube surfaces and rejects invalid face counts or dimensions", () => {
    const b = ktx2(VK_FORMAT.BC1_RGBA_UNORM, 4, 4, [48]);
    const v = new DataView(b.buffer);
    v.setUint32(36, 6, true);
    expect(parseKtx2(b).faces).toBe(6);
    v.setUint32(24, 2, true);
    expect(() => parseKtx2(b)).toThrow(/dimensions/);
    v.setUint32(24, 4, true);
    v.setUint32(36, 5, true);
    expect(() => parseKtx2(b)).toThrow(/faces/);
  });
  it("rejects level ranges past the end", () => {
    const b = ktx2(VK_FORMAT.BC1_RGBA_UNORM, 4, 4, [8]);
    expect(() => parseKtx2(b.subarray(0, b.length - 4))).toThrow(/range/);
  });
});
