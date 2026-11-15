import { describe, expect, it, vi } from "vitest";
import type { HudGeometry, HudMaterial, HudScene } from "./hudScene";
import { createHudRenderer, luminanceAlphaPixels } from "./hudRenderer";

/** A WebGL2 stand-in that names every constant and records every call. */
function recordingGl() {
  const calls: string[] = [];
  let next = 1;
  const handles = new Map<string, number>();
  const name = (value: unknown): string => {
    if (value && typeof value === "object" && "handle" in value)
      return String((value as { handle: string }).handle);
    if (typeof value === "number") {
      for (const [key, id] of handles) if (id === value) return key;
      return String(value);
    }
    if (ArrayBuffer.isView(value)) return `[${(value as Float32Array).length}]`;
    return JSON.stringify(value);
  };
  const gl = new Proxy(
    {},
    {
      get(_, property: string) {
        if (/^[A-Z0-9_]+$/.test(property)) {
          if (!handles.has(property)) handles.set(property, 0x10000 + handles.size);
          return handles.get(property);
        }
        if (property === "getShaderParameter" || property === "getProgramParameter")
          return () => true;
        if (property === "getParameter") return () => 8;
        if (property === "getAttribLocation") return (_: unknown, attribute: string) => attribute;
        if (property === "getUniformLocation")
          return (_: unknown, uniform: string) => ({ handle: uniform });
        return (...args: unknown[]) => {
          if (property.startsWith("create")) return { handle: `${property.slice(6)}#${next++}` };
          calls.push(`${property}(${args.map(name).join(", ")})`);
          return undefined;
        };
      },
    },
  ) as WebGL2RenderingContext;
  return { gl, calls };
}

const material = (overrides: Partial<HudMaterial>): HudMaterial => ({
  texture: 0,
  sampling: null,
  blend: 0,
  secondary: null,
  ...overrides,
});

function sceneOf(materials: HudMaterial[]): HudScene {
  return {
    meta: {
      view: { width: 1920, height: 1080 },
      textures: [
        { id: "a", width: 4, height: 4, source: { kind: "file", url: "a.png" } },
        { id: "b", width: 4, height: 4, source: { kind: "packed", offset: 0, length: 64 } },
      ],
      materials,
      fonts: [],
      primitives: { count: 0, offset: 0 },
      gaugeLimit: 12000,
      slots: [],
    },
  } as unknown as HudScene;
}

function geometryOf(materials: number[]): HudGeometry {
  const n = materials.length;
  return {
    count: n,
    positions: new Float32Array(n * 18),
    uvs: new Float32Array(n * 12),
    secondaryUvs: new Float32Array(n * 12),
    multiply: new Uint8Array(n * 24),
    add: new Uint8Array(n * 24),
    materials: Uint16Array.from(materials),
  };
}

const images = [
  { width: 4, height: 4, pixels: new Uint8Array(64) },
  { width: 4, height: 4, pixels: new Uint8Array(64) },
];

describe("createHudRenderer", () => {
  it("draws runs of one material in order with that material's blend and textures", () => {
    const { gl, calls } = recordingGl();
    const renderer = createHudRenderer(
      gl,
      sceneOf([
        material({}),
        material({ blend: 3, texture: 1 }),
        material({ blend: 4, texture: -1 }),
        material({
          sampling: { minFilter: "nearest", magFilter: "nearest", wrapS: "clamp", wrapT: "clamp" },
          secondary: { texture: 1, blendMode: 12, sampling: null },
        }),
      ]),
      images,
    );
    renderer.resize(640, 360);
    calls.length = 0;
    renderer.draw(geometryOf([0, 0, 1, 2, 2, 2, 3, 0]), 1);
    const draws = calls.filter((call) => call.startsWith("drawArrays"));
    expect(draws).toEqual([
      "drawArrays(TRIANGLES, 0, 12)",
      "drawArrays(TRIANGLES, 12, 6)",
      "drawArrays(TRIANGLES, 18, 18)",
      "drawArrays(TRIANGLES, 36, 6)",
      "drawArrays(TRIANGLES, 42, 6)",
    ]);
    const blends = calls.filter((call) => call.startsWith("blendFuncSeparate"));
    expect(blends).toEqual([
      "blendFuncSeparate(ONE, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)",
      "blendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)",
      "blendFuncSeparate(SRC_ALPHA, ONE, ONE, ONE_MINUS_SRC_ALPHA)",
      "blendFuncSeparate(ONE, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)",
      "blendFuncSeparate(ONE, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)",
    ]);
    const premultiplied = calls.filter((call) => call.startsWith("uniform1i(uPremultiplied"));
    expect(premultiplied.map((call) => call.endsWith("1)"))).toEqual([
      true,
      false,
      false,
      true,
      true,
    ]);
    const textured = calls.filter((call) => call.startsWith("uniform1i(uTextured"));
    expect(textured.map((call) => call.endsWith("1)"))).toEqual([true, true, false, true, true]);
    const secondary = calls.filter((call) => call.startsWith("uniform1i(uSecondaryBlendMode"));
    expect(secondary).toEqual([
      "uniform1i(uSecondaryBlendMode, 0)",
      "uniform1i(uSecondaryBlendMode, 0)",
      "uniform1i(uSecondaryBlendMode, 0)",
      "uniform1i(uSecondaryBlendMode, 12)",
      "uniform1i(uSecondaryBlendMode, 0)",
    ]);
    expect(calls).toContain("uniform2f(uScreenParam, 960, 540)");
    expect(calls).toContain(`uniform2f(uPixelCenter, ${1 / 640}, ${-1 / 360})`);
    expect(calls).toContain("viewport(0, 0, 640, 360)");
  });

  it("uploads straight-alpha textures without flipping or premultiplying", () => {
    const { gl, calls } = recordingGl();
    createHudRenderer(gl, sceneOf([material({})]), images);
    expect(calls).toContain("pixelStorei(UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)");
    expect(calls).toContain("pixelStorei(UNPACK_FLIP_Y_WEBGL, false)");
    expect(calls).toContain("pixelStorei(UNPACK_COLORSPACE_CONVERSION_WEBGL, NONE)");
  });

  it("keeps its target in 8-bit RGBA so the composite reads quantized values", () => {
    const { gl, calls } = recordingGl();
    const renderer = createHudRenderer(gl, sceneOf([material({})]), images);
    renderer.resize(640, 360);
    expect(calls).toContain("texStorage2D(TEXTURE_2D, 1, RGBA8, 640, 360)");
  });

  it("draws with four samples per pixel and resolves them into the target", () => {
    const { gl, calls } = recordingGl();
    const renderer = createHudRenderer(gl, sceneOf([material({})]), images);
    renderer.resize(640, 360);
    expect(calls).toContain("renderbufferStorageMultisample(RENDERBUFFER, 4, RGBA8, 640, 360)");
    calls.length = 0;
    renderer.draw(geometryOf([0]), 1);
    const draw = calls.findIndex((call) => call.startsWith("drawArrays"));
    const blit = calls.findIndex((call) => call.startsWith("blitFramebuffer"));
    expect(calls[blit]).toBe(
      "blitFramebuffer(0, 0, 640, 360, 0, 0, 640, 360, COLOR_BUFFER_BIT, NEAREST)",
    );
    expect(blit).toBeGreaterThan(draw);
  });

  it("uses two samples for the mobile HUD", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Android Mobile" });
    try {
      const { gl, calls } = recordingGl();
      const renderer = createHudRenderer(gl, sceneOf([material({})]), images);
      renderer.resize(640, 360);
      expect(calls).toContain("renderbufferStorageMultisample(RENDERBUFFER, 2, RGBA8, 640, 360)");
      renderer.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("redraws only for a new revision or a new size", () => {
    const { gl, calls } = recordingGl();
    const renderer = createHudRenderer(gl, sceneOf([material({})]), images);
    renderer.resize(640, 360);
    const count = () => calls.filter((call) => call.startsWith("clear(")).length;
    renderer.draw(geometryOf([0]), 1);
    renderer.draw(geometryOf([0]), 1);
    expect(count()).toBe(1);
    renderer.draw(geometryOf([0]), 2);
    expect(count()).toBe(2);
    renderer.resize(640, 360);
    renderer.draw(geometryOf([0]), 2);
    expect(count()).toBe(2);
    renderer.resize(800, 450);
    renderer.draw(geometryOf([0]), 2);
    expect(count()).toBe(3);
  });

  it("composites premultiplied over the bound framebuffer", () => {
    const { gl, calls } = recordingGl();
    const renderer = createHudRenderer(gl, sceneOf([material({})]), images);
    renderer.resize(640, 360);
    calls.length = 0;
    renderer.composite();
    expect(calls).toContain(
      "blendFuncSeparate(ONE, ONE_MINUS_SRC_ALPHA, ONE, ONE_MINUS_SRC_ALPHA)",
    );
    expect(calls).not.toContain("bindFramebuffer(FRAMEBUFFER, null)");
    expect(calls.filter((call) => call.startsWith("drawArrays"))).toEqual([
      "drawArrays(TRIANGLES, 0, 3)",
    ]);
  });

  it("replaces a texture's image in place and redraws with it", () => {
    const { gl, calls } = recordingGl();
    const small = { width: 2, height: 2, pixels: new Uint8Array(16) };
    const renderer = createHudRenderer(gl, sceneOf([material({ texture: 1 })]), [images[0], small]);
    const upload = calls.indexOf(
      "texImage2D(TEXTURE_2D, 0, RGBA, 2, 2, 0, RGBA, UNSIGNED_BYTE, [16])",
    );
    const binding = (until: number) =>
      calls
        .slice(0, until)
        .filter((call) => call.startsWith("bindTexture("))
        .pop();
    const texture = binding(upload);
    renderer.resize(640, 360);
    renderer.draw(geometryOf([0]), 1);
    calls.length = 0;
    renderer.replaceTexture(1, { width: 8, height: 2, pixels: new Uint8Array(64) });
    const replaced = calls.indexOf(
      "texImage2D(TEXTURE_2D, 0, RGBA, 8, 2, 0, RGBA, UNSIGNED_BYTE, [64])",
    );
    expect(replaced).toBeGreaterThan(0);
    expect(binding(replaced)).toBe(texture);
    renderer.draw(geometryOf([0]), 1);
    expect(calls.filter((call) => call.startsWith("clear(")).length).toBe(1);
  });

  it("refuses a material whose texture was not loaded", () => {
    const { gl } = recordingGl();
    expect(() =>
      createHudRenderer(gl, sceneOf([material({ texture: 1 })]), [images[0], null]),
    ).toThrow(/b missing/);
  });

  it("keeps a grey texture in two channels and reads it as grey with alpha", () => {
    const { gl, calls } = recordingGl();
    const scene = sceneOf([material({ texture: 0 }), material({ texture: 1 })]);
    scene.meta.textures = scene.meta.textures.map((texture) => ({
      ...texture,
      channels: "luminance-alpha" as const,
    }));
    const decoded = { width: 4, height: 4 } as unknown as TexImageSource;
    const renderer = createHudRenderer(gl, scene, [decoded, images[1]]);
    expect(calls).toContain("texImage2D(TEXTURE_2D, 0, RG8, 4, 4, 0, RG, UNSIGNED_BYTE, [32])");
    expect(calls).toContain("texImage2D(TEXTURE_2D, 0, RG8, 4, 4, 0, RG, UNSIGNED_BYTE, null)");
    expect(calls).toContain("drawArrays(TRIANGLES, 0, 3)");
    renderer.resize(640, 360);
    calls.length = 0;
    renderer.draw(geometryOf([0, 1]), 1);
    const flags = calls.filter((call) => call.startsWith("uniform1i(uLuminanceAlpha"));
    expect(flags.map((call) => call.endsWith("1)"))).toEqual([true, true]);
  });

  it("reads an RGBA texture as stored", () => {
    const { gl, calls } = recordingGl();
    const renderer = createHudRenderer(gl, sceneOf([material({})]), images);
    renderer.resize(640, 360);
    calls.length = 0;
    renderer.draw(geometryOf([0]), 1);
    expect(calls).toContain("uniform1i(uLuminanceAlpha, 0)");
  });

  it("splits grey pixels into their grey level and alpha", () => {
    expect([...luminanceAlphaPixels(Uint8Array.from([10, 10, 10, 200, 255, 255, 255, 0]))]).toEqual(
      [10, 200, 255, 0],
    );
  });
});
