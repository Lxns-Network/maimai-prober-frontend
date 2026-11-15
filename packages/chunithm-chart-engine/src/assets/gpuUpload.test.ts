import { describe, expect, it } from "vitest";
import { uploadKtx2 } from "./gpuUpload";
import { VK_FORMAT } from "./ktx2";

function fakeGl(exts: Record<string, object | null>) {
  const calls: unknown[][] = [];
  const gl = {
    TEXTURE_2D: 0x0de1,
    TEXTURE_CUBE_MAP: 0x8513,
    TEXTURE_CUBE_MAP_POSITIVE_X: 0x8515,
    RGBA: 0x1908,
    RGBA8: 0x8058,
    UNSIGNED_BYTE: 0x1401,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    TEXTURE_BASE_LEVEL: 0x813c,
    TEXTURE_MAX_LEVEL: 0x813d,
    createTexture: () => ({ id: 1 }),
    bindTexture: (...a: unknown[]) => calls.push(["bind", ...a]),
    texParameteri: (...a: unknown[]) => calls.push(["param", ...a]),
    texStorage2D: (...a: unknown[]) => calls.push(["storage", ...a]),
    texSubImage2D: (...a: unknown[]) =>
      calls.push(["sub", a[1], a[4], a[5], (a[8] as Uint8Array).byteLength, a[0]]),
    compressedTexSubImage2D: (...a: unknown[]) =>
      calls.push(["csub", a[1], a[4], a[5], a[6], (a[7] as Uint8Array).byteLength, a[0]]),
    getExtension: (n: string) => exts[n] ?? null,
  };
  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}

function ktx2(vk: number, w: number, h: number, sizes: number[], faces = 1) {
  const indexAt = 12 + 4 * 9 + 4 * 4 + 8 * 2;
  let at = indexAt + sizes.length * 24;
  const out = new Uint8Array(at + sizes.reduce((a, b) => a + b, 0));
  out.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(out.buffer);
  v.setUint32(12, vk, true);
  v.setUint32(20, w, true);
  v.setUint32(24, h, true);
  v.setUint32(36, faces, true);
  v.setUint32(40, sizes.length, true);
  sizes.forEach((n, i) => {
    v.setBigUint64(indexAt + i * 24, BigInt(at), true);
    v.setBigUint64(indexAt + i * 24 + 8, BigInt(n), true);
    at += n;
  });
  return out;
}

describe("uploadKtx2", () => {
  it("uploads DXT3 blocks as BC2 without decoding them", () => {
    const { gl, calls } = fakeGl({
      WEBGL_compressed_texture_s3tc: { COMPRESSED_RGBA_S3TC_DXT3_EXT: 0x83f2 },
    });
    const image = ktx2(VK_FORMAT.BC2_UNORM, 8, 8, [64, 16]);
    uploadKtx2(gl, image, { target: "bc", dropTopMip: false, compare: false });
    expect(calls.find((c) => c[0] === "storage")).toEqual([
      "storage",
      gl.TEXTURE_2D,
      2,
      0x83f2,
      8,
      8,
    ]);
    expect(calls.filter((c) => c[0] === "csub").map((c) => [c[1], c[4], c[5]])).toEqual([
      [0, 0x83f2, 64],
      [1, 0x83f2, 16],
    ]);
  });

  it("uploads BC3 blocks with compressedTexSubImage2D and no pixel decode", () => {
    const { gl, calls } = fakeGl({
      WEBGL_compressed_texture_s3tc: {
        COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3,
        COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1,
      },
    });
    const r = uploadKtx2(gl, ktx2(VK_FORMAT.BC3_UNORM, 8, 8, [64, 16]), {
      target: "bc",
      dropTopMip: false,
      compare: false,
    });
    expect(calls.filter((c) => c[0] === "storage")[0]).toEqual([
      "storage",
      0x0de1,
      2,
      0x83f3,
      8,
      8,
    ]);
    expect(calls.filter((c) => c[0] === "csub").map((c) => [c[1], c[2], c[3], c[5]])).toEqual([
      [0, 8, 8, 64],
      [1, 4, 4, 16],
    ]);
    expect(r.gpuBytes).toBe(80);
  });

  it("uploads RGBA8 with texSubImage2D", () => {
    const { gl, calls } = fakeGl({});
    uploadKtx2(gl, ktx2(VK_FORMAT.R8G8B8A8_UNORM, 2, 2, [16, 4]), {
      target: "rgba8",
      dropTopMip: false,
      compare: true,
    });
    expect(calls.filter((c) => c[0] === "sub").map((c) => c[1])).toEqual([0, 1]);
  });

  it("drops the top mip when asked", () => {
    const { gl, calls } = fakeGl({});
    const r = uploadKtx2(gl, ktx2(VK_FORMAT.R8G8B8A8_UNORM, 4, 4, [64, 16, 4]), {
      target: "rgba8",
      dropTopMip: true,
      compare: false,
    });
    expect(r.width).toBe(2);
    expect(calls.filter((c) => c[0] === "sub").map((c) => c[1])).toEqual([0, 1]);
  });

  it("uploads each face and mip to its own cube target", () => {
    const { gl, calls } = fakeGl({});
    const result = uploadKtx2(gl, ktx2(VK_FORMAT.R8G8B8A8_UNORM, 2, 2, [96, 24], 6), {
      target: "rgba8",
      dropTopMip: false,
      compare: true,
    });
    expect(result.target).toBe(gl.TEXTURE_CUBE_MAP);
    expect(result.gpuBytes).toBe(120);
    expect(calls.filter((c) => c[0] === "storage")[0]).toEqual([
      "storage",
      gl.TEXTURE_CUBE_MAP,
      2,
      gl.RGBA8,
      2,
      2,
    ]);
    expect(calls.filter((c) => c[0] === "sub").map((c) => [c[1], c[4], c[5]])).toEqual(
      [0, 1].flatMap((level) =>
        Array.from({ length: 6 }, (_, face) => [
          level,
          level === 0 ? 16 : 4,
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        ]),
      ),
    );
  });

  it("rejects a cube level missing a face before allocating a texture", () => {
    const { gl, calls } = fakeGl({});
    expect(() =>
      uploadKtx2(gl, ktx2(VK_FORMAT.R8G8B8A8_UNORM, 2, 2, [80], 6), {
        target: "rgba8",
        dropTopMip: false,
        compare: true,
      }),
    ).toThrow(/level size/);
    expect(calls).toEqual([]);
  });

  it("throws when the extension for a compressed payload is missing", () => {
    const { gl } = fakeGl({});
    expect(() =>
      uploadKtx2(gl, ktx2(VK_FORMAT.ASTC_4x4_UNORM, 4, 4, [16]), {
        target: "astc",
        dropTopMip: false,
        compare: false,
      }),
    ).toThrow(/ASTC/);
  });
});
