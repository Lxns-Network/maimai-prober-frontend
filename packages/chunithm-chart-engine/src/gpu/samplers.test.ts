import { describe, expect, it, vi } from "vitest";
import { createSamplerCache, samplerParameters, stageSamplerParameters } from "./samplers";
const state = {
  addressU: 1,
  addressV: 3,
  minFilter: 3,
  magFilter: 2,
  mipFilter: 1,
  maxMipLevel: 0,
  maxAnisotropy: 16,
};
function context(limit: number | null) {
  const ext = { TEXTURE_MAX_ANISOTROPY_EXT: 20, MAX_TEXTURE_MAX_ANISOTROPY_EXT: 21 };
  const created: WebGLSampler[] = [];
  const gl = {
    REPEAT: 1,
    MIRRORED_REPEAT: 2,
    CLAMP_TO_EDGE: 3,
    NEAREST: 4,
    LINEAR: 5,
    NEAREST_MIPMAP_NEAREST: 6,
    NEAREST_MIPMAP_LINEAR: 7,
    LINEAR_MIPMAP_NEAREST: 8,
    LINEAR_MIPMAP_LINEAR: 9,
    TEXTURE_WRAP_S: 10,
    TEXTURE_WRAP_T: 11,
    TEXTURE_MIN_FILTER: 12,
    TEXTURE_MAG_FILTER: 13,
    getExtension: vi.fn(() => (limit === null ? null : ext)),
    getParameter: vi.fn(() => limit),
    createSampler: vi.fn(() => {
      const sampler = {} as WebGLSampler;
      created.push(sampler);
      return sampler;
    }),
    samplerParameteri: vi.fn(),
    samplerParameterf: vi.fn(),
    deleteSampler: vi.fn(),
  } as unknown as WebGL2RenderingContext;
  return { gl, ext, created };
}
describe("Stage anisotropic samplers", () => {
  it("binds the requested level, caches distinct states and releases them", () => {
    const { gl, ext, created } = context(16);
    const cache = createSamplerCache(gl);
    const parameters = stageSamplerParameters(gl, state, "Stage material");
    expect(parameters).toEqual({
      wrapS: gl.REPEAT,
      wrapT: gl.CLAMP_TO_EDGE,
      min: gl.LINEAR_MIPMAP_NEAREST,
      mag: gl.LINEAR,
      anisotropy: 16,
    });
    const first = cache.samplerFor(parameters, "Stage material");
    expect(cache.samplerFor(parameters)).toBe(first);
    expect(cache.samplerFor({ ...parameters, anisotropy: 4 })).not.toBe(first);
    expect(gl.samplerParameteri).toHaveBeenCalledWith(first, gl.TEXTURE_MIN_FILTER, parameters.min);
    expect(gl.samplerParameterf).toHaveBeenCalledWith(first, ext.TEXTURE_MAX_ANISOTROPY_EXT, 16);
    expect(gl.getExtension).toHaveBeenCalledTimes(1);
    cache.dispose();
    expect(gl.deleteSampler).toHaveBeenCalledTimes(2);
    for (const sampler of created) expect(gl.deleteSampler).toHaveBeenCalledWith(sampler);
  });
  it("requires an adequate device and keeps the note contract unchanged", () => {
    for (const [limit, reason] of [
      [null, /without the extension/],
      [8, /device anisotropy limit/],
    ] as const) {
      const { gl } = context(limit);
      const cache = createSamplerCache(gl);
      const parameters = stageSamplerParameters(gl, state, "Stage material");
      expect(() => cache.samplerFor(parameters, "Stage material")).toThrow(reason);
      expect(gl.createSampler).not.toHaveBeenCalled();
    }
    const { gl } = context(16);
    expect(() => samplerParameters(gl, state, "note")).toThrow(/anisotropic/);
    expect(() => stageSamplerParameters(gl, { ...state, maxAnisotropy: 0 }, "Stage")).toThrow(
      /invalid anisotropy/,
    );
    expect(stageSamplerParameters(gl, { ...state, minFilter: 2 }, "Stage").anisotropy).toBeNull();
  });
});
