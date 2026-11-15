import { describe, expect, it, vi } from "vitest";
import { VK_FORMAT } from "../assets/ktx2";
import { loadEffectTextures, type EffectTextureCache } from "./textures";

const S3TC = { COMPRESSED_RGBA_S3TC_DXT1_EXT: 0x83f1, COMPRESSED_RGBA_S3TC_DXT5_EXT: 0x83f3 };
const ASTC = { COMPRESSED_RGBA_ASTC_4x4_KHR: 0x93b0 };
const ETC = { COMPRESSED_RGB8_ETC2: 0x9274, COMPRESSED_RGBA8_ETC2_EAC: 0x9278 };

function fakeGl(extensions: Record<string, object>) {
  const uploads: { kind: "image" | "compressed"; level: number; width: number; height: number }[] =
    [];
  const storage: { levels: number; format: number; width: number; height: number }[] = [];
  const gl = {
    TEXTURE_2D: 1,
    RGBA: 2,
    RGBA8: 3,
    UNSIGNED_BYTE: 4,
    TEXTURE_BASE_LEVEL: 5,
    TEXTURE_MAX_LEVEL: 6,
    MAX_TEXTURE_SIZE: 7,
    UNPACK_FLIP_Y_WEBGL: 8,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 9,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 10,
    NONE: 0,
    getExtension: (name: string) => extensions[name] ?? null,
    getParameter: () => 16384,
    createTexture: () => ({}),
    bindTexture: () => {},
    pixelStorei: () => {},
    texParameteri: () => {},
    deleteTexture: () => {},
    texStorage2D: (_t: number, levels: number, format: number, width: number, height: number) =>
      storage.push({ levels, format, width, height }),
    texSubImage2D: (
      _t: number,
      level: number,
      _x: number,
      _y: number,
      _f: number,
      _type: number,
      source: { width: number; height: number },
    ) => uploads.push({ kind: "image", level, width: source.width, height: source.height }),
    compressedTexSubImage2D: (
      _t: number,
      level: number,
      _x: number,
      _y: number,
      width: number,
      height: number,
    ) => uploads.push({ kind: "compressed", level, width, height }),
  };
  return { gl: gl as unknown as WebGL2RenderingContext, uploads, storage };
}

function ktx2(vkFormat: number, width: number, height: number, bytesPerBlock: number) {
  const indexAt = 12 + 4 * 9 + 4 * 4 + 8 * 2;
  const size = Math.ceil(width / 4) * Math.ceil(height / 4) * bytesPerBlock;
  const out = new Uint8Array(indexAt + 24 + size);
  out.set([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(out.buffer);
  view.setUint32(12, vkFormat, true);
  view.setUint32(20, width, true);
  view.setUint32(24, height, true);
  view.setUint32(36, 1, true);
  view.setUint32(40, 1, true);
  view.setBigUint64(indexAt, BigInt(indexAt + 24), true);
  view.setBigUint64(indexAt + 8, BigInt(size), true);
  return out;
}

const MANIFEST = "https://assets.test/effects/resources.json";

/** One effect with one single-level texture of `size`², published as a PNG and, when `tiers`, as KTX2 tiers of the given sizes. */
function assets(size: number, tiers: { bc?: number; astc?: number; etc2?: number } | null) {
  const files = new Map<string, () => Response>();
  const requested: string[] = [];
  files.set(MANIFEST, () =>
    Response.json({
      schema: "web-autoplay-page-resources-v1",
      effects: [{ id: 24, textures: { url: "textures/list.json" } }],
    }),
  );
  const tierFiles: Record<string, { url: string }> = {};
  if (tiers) {
    const formats = {
      bc: [VK_FORMAT.BC1_RGBA_UNORM, 8],
      astc: [VK_FORMAT.ASTC_4x4_UNORM, 16],
      etc2: [VK_FORMAT.ETC2_R8G8B8_UNORM, 8],
    } as const;
    for (const [tier, published] of Object.entries(tiers)) {
      const url = `images/sheet.${tier}.bin`;
      tierFiles[tier] = { url };
      const [vk, block] = formats[tier as keyof typeof formats];
      files.set(
        `https://assets.test/effects/textures/${url}`,
        () => new Response(ktx2(vk, published, published, block)),
      );
    }
  }
  files.set("https://assets.test/effects/textures/list.json", () =>
    Response.json({
      schema: "web-autoplay-effect-png-v1",
      textures: [
        {
          resourceIndex: 0,
          levels: [{ width: size, height: size, asset: { url: "images/sheet.png" } }],
          ...(tiers ? { tiers: tierFiles } : {}),
        },
      ],
    }),
  );
  files.set(
    "https://assets.test/effects/textures/images/sheet.png",
    () => new Response(JSON.stringify({ width: size, height: size })),
  );
  const fetcher = (async (input: URL | RequestInfo) => {
    const href = String(input);
    requested.push(href.slice(href.lastIndexOf("/") + 1));
    const file = files.get(href);
    return file ? file() : new Response(null, { status: 404 });
  }) as typeof fetch;
  return { fetcher, requested };
}

function stubDevice(kind: "desktop" | "phone") {
  vi.stubGlobal(
    "navigator",
    kind === "phone"
      ? { userAgent: "Mozilla/5.0 (Linux; Android 14)", deviceMemory: 8 }
      : { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
  );
  vi.stubGlobal(
    "createImageBitmap",
    async (blob: Blob, options?: { resizeWidth?: number; resizeHeight?: number }) => {
      const { width, height } = JSON.parse(await blob.text());
      return {
        width: options?.resizeWidth ?? width,
        height: options?.resizeHeight ?? height,
        close() {},
      };
    },
  );
}

const signal = new AbortController().signal;

describe("loadEffectTextures tiers", () => {
  it("uploads a large texture's BC tier at full size where BC decodes, without its PNG", async () => {
    stubDevice("desktop");
    const { gl, uploads, storage } = fakeGl({ WEBGL_compressed_texture_s3tc: S3TC });
    const { fetcher, requested } = assets(2048, { bc: 2048, astc: 2048, etc2: 2048 });
    const textures = await loadEffectTextures(gl, MANIFEST, { signal, fetch: fetcher });
    expect(requested).toContain("sheet.bc.bin");
    expect(requested).not.toContain("sheet.png");
    expect(storage).toEqual([
      { levels: 1, format: S3TC.COMPRESSED_RGBA_S3TC_DXT1_EXT, width: 2048, height: 2048 },
    ]);
    expect(uploads).toEqual([{ kind: "compressed", level: 0, width: 2048, height: 2048 }]);
    expect(textures.reduced).toEqual([]);
    expect(textures.texture(24, 0)).not.toBeNull();
  });

  it("keeps a large texture compressed on a phone that would otherwise take RGBA8", async () => {
    stubDevice("phone");
    const { gl, storage } = fakeGl({
      WEBGL_compressed_texture_astc: ASTC,
      WEBGL_compressed_texture_etc: ETC,
    });
    const { fetcher, requested } = assets(2048, { bc: 2048, astc: 2048, etc2: 2048 });
    const textures = await loadEffectTextures(gl, MANIFEST, { signal, fetch: fetcher });
    expect(requested).toContain("sheet.astc.bin");
    expect(requested).not.toContain("sheet.png");
    expect(storage[0]).toMatchObject({ format: ASTC.COMPRESSED_RGBA_ASTC_4x4_KHR, width: 2048 });
    expect(textures.reduced).toEqual([]);
  });

  it("uses the compressed tier for small textures on phones too", async () => {
    stubDevice("phone");
    const { gl, uploads } = fakeGl({
      WEBGL_compressed_texture_astc: ASTC,
      WEBGL_compressed_texture_etc: ETC,
    });
    const { fetcher, requested } = assets(512, { bc: 512, astc: 512, etc2: 512 });
    await loadEffectTextures(gl, MANIFEST, { signal, fetch: fetcher });
    expect(requested).toContain("sheet.astc.bin");
    expect(requested).not.toContain("sheet.png");
    expect(uploads).toEqual([{ kind: "compressed", level: 0, width: 512, height: 512 }]);
  });

  it("reduces a large texture's PNG where no published tier decodes", async () => {
    stubDevice("desktop");
    const { gl, uploads } = fakeGl({});
    const { fetcher, requested } = assets(2048, { bc: 2048, astc: 2048, etc2: 2048 });
    const textures = await loadEffectTextures(gl, MANIFEST, { signal, fetch: fetcher });
    expect(requested.filter((name) => name.endsWith(".bin"))).toEqual([]);
    expect(uploads).toEqual([{ kind: "image", level: 0, width: 1024, height: 1024 }]);
    expect(textures.reduced).toEqual(["24:0"]);
  });

  it("uploads the full-size PNG when asked for the published images", async () => {
    stubDevice("desktop");
    const { gl, uploads } = fakeGl({ WEBGL_compressed_texture_s3tc: S3TC });
    const { fetcher, requested } = assets(2048, { bc: 2048 });
    await loadEffectTextures(gl, MANIFEST, { signal, fetch: fetcher, full: true });
    expect(requested).not.toContain("sheet.bc.bin");
    expect(uploads).toEqual([{ kind: "image", level: 0, width: 2048, height: 2048 }]);
  });

  it("uploads the full-size PNG for an explicit RGBA8 override", async () => {
    stubDevice("desktop");
    const { gl, uploads } = fakeGl({ WEBGL_compressed_texture_s3tc: S3TC });
    const { fetcher } = assets(2048, { bc: 2048 });
    const textures = await loadEffectTextures(gl, MANIFEST, {
      signal,
      fetch: fetcher,
      override: "rgba8",
    });
    expect(uploads).toEqual([{ kind: "image", level: 0, width: 2048, height: 2048 }]);
    expect(textures.reduced).toEqual([]);
  });

  it("rejects a tier whose size disagrees with the texture list", async () => {
    stubDevice("desktop");
    const { gl } = fakeGl({ WEBGL_compressed_texture_s3tc: S3TC });
    const { fetcher } = assets(2048, { bc: 1024 });
    await expect(loadEffectTextures(gl, MANIFEST, { signal, fetch: fetcher })).rejects.toThrow(
      RangeError,
    );
  });

  it("shares uploads between difficulty loads until the last owner releases them", async () => {
    stubDevice("desktop");
    const { gl, storage } = fakeGl({ WEBGL_compressed_texture_s3tc: S3TC });
    const deleted = vi.spyOn(gl, "deleteTexture");
    const { fetcher, requested } = assets(512, { bc: 512 });
    const cache: EffectTextureCache = new Map();
    const first = await loadEffectTextures(gl, MANIFEST, { signal, fetch: fetcher, cache });
    const second = await loadEffectTextures(gl, MANIFEST, { signal, fetch: fetcher, cache });
    expect(first.texture(24, 0)).toBe(second.texture(24, 0));
    expect(storage).toHaveLength(1);
    expect(requested.filter((name) => name === "sheet.bc.bin")).toHaveLength(1);
    first.dispose();
    expect(deleted).not.toHaveBeenCalled();
    second.dispose();
    expect(deleted).toHaveBeenCalledTimes(1);
    expect(cache.size).toBe(0);
  });

  it("uses the mobile atlas automatically while preserving explicit full-size selection", async () => {
    stubDevice("phone");
    const { gl, storage } = fakeGl({ WEBGL_compressed_texture_astc: ASTC });
    const original = assets(4096, { astc: 4096 });
    const fetcher = (async (input: URL | RequestInfo) => {
      if (String(input).endsWith("mobile.bin"))
        return new Response(ktx2(VK_FORMAT.ASTC_4x4_UNORM, 2048, 2048, 16));
      const response = await original.fetcher(input);
      if (!String(input).endsWith("list.json")) return response;
      const list = await response.json();
      list.textures[0].mobile = {
        width: 2048,
        height: 2048,
        tiers: { astc: { url: "images/mobile.bin" } },
      };
      return Response.json(list);
    }) as typeof fetch;
    const auto = await loadEffectTextures(gl, MANIFEST, { signal, fetch: fetcher });
    expect(storage[0]).toMatchObject({ width: 2048, height: 2048 });
    expect(auto.reduced).toEqual(["24:0"]);
    const full = await loadEffectTextures(gl, MANIFEST, {
      signal,
      fetch: fetcher,
      override: "astc",
    });
    expect(storage[1]).toMatchObject({ width: 4096, height: 4096 });
    expect(full.reduced).toEqual([]);
    auto.dispose();
    full.dispose();
  });
});
