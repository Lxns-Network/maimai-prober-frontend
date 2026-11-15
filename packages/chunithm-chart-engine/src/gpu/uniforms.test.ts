import { describe, expect, it } from "vitest";
import {
  applyPackedTextures,
  applyPackedUniforms,
  applyProgramUniforms,
  componentsOf,
  createUniformScratch,
  resolveUniforms,
  type PackedUniform,
  type UniformTarget,
} from "./uniforms";
/** Records the upload calls so the types can be asserted without a GL context. */
function fakeGl() {
  const calls: {
    kind: string;
    name: string;
    value: number | number[];
  }[] = [];
  const locations = new Map<string, WebGLUniformLocation>();
  const target: UniformTarget = {
    FLOAT: 0x1406,
    INT: 0x1404,
    BOOL: 0x8b56,
    getUniformLocation: (_p, name) => {
      const existing = locations.get(name);
      if (existing) return existing;
      const created = { name } as unknown as WebGLUniformLocation;
      locations.set(name, created);
      return created;
    },
    uniform1f: (l, v) => calls.push({ kind: "f", name: nameOf(l), value: v }),
    uniform1i: (l, v) => calls.push({ kind: "i", name: nameOf(l), value: v }),
    uniform2fv: (l, v) => calls.push({ kind: "2fv", name: nameOf(l), value: [...v] }),
    uniform3fv: (l, v) => calls.push({ kind: "3fv", name: nameOf(l), value: [...v] }),
    uniform4fv: (l, v) => calls.push({ kind: "4fv", name: nameOf(l), value: [...v] }),
    uniformMatrix4fv: (l, _t, v) => calls.push({ kind: "m4", name: nameOf(l), value: [...v] }),
  };
  return { target, calls };
}
const nameOf = (location: WebGLUniformLocation | null): string =>
  (
    location as unknown as {
      name: string;
    } | null
  )?.name ?? "<null>";
describe("componentsOf", () => {
  it("maps the vector types and declines the rest", () => {
    expect(componentsOf("vec2")).toBe(2);
    expect(componentsOf("vec3")).toBe(3);
    expect(componentsOf("vec4")).toBe(4);
    expect(componentsOf("float")).toBeNull();
    expect(componentsOf("mat4")).toBeNull();
  });
  it("does not guess at an unknown type", () => {
    // A type with no upload path must be refused rather than defaulted, or a value would be sent
    // through the wrong entry point and interpreted as a different type.
    expect(componentsOf("ivec4")).toBeNull();
    expect(componentsOf("vec5")).toBeNull();
  });
});
describe("applyPackedUniforms", () => {
  it("uploads each value through the entry point its type names", () => {
    const { target, calls } = fakeGl();
    const uniforms: Record<string, PackedUniform> = {
      uLodBias: { type: "float", value: -1.5 },
      uTexture0: { type: "int", value: 0 },
      uAlphaTestEnabled: { type: "bool", value: true },
      uIncandescenceBase: { type: "vec3", value: [0, 0, 0] },
      uDiffuse: { type: "vec4", value: [1, 1, 1, 1] },
    };
    const locations = resolveUniforms(target, {} as WebGLProgram, uniforms);
    applyPackedUniforms(target, locations, uniforms, createUniformScratch());
    expect(calls).toEqual([
      { kind: "f", name: "uLodBias", value: -1.5 },
      { kind: "i", name: "uTexture0", value: 0 },
      { kind: "i", name: "uAlphaTestEnabled", value: 1 },
      { kind: "3fv", name: "uIncandescenceBase", value: [0, 0, 0] },
      { kind: "4fv", name: "uDiffuse", value: [1, 1, 1, 1] },
    ]);
  });
  it("sends a false bool as zero", () => {
    const { target, calls } = fakeGl();
    const uniforms: Record<string, PackedUniform> = { uFlag: { type: "bool", value: false } };
    applyPackedUniforms(
      target,
      resolveUniforms(target, {} as WebGLProgram, uniforms),
      uniforms,
      createUniformScratch(),
    );
    expect(calls).toEqual([{ kind: "i", name: "uFlag", value: 0 }]);
  });
  it("writes only as many components as the type declares", () => {
    // A vec3 uploaded through uniform4fv would leave the fourth component holding the previous
    // draw's value, so the component count has to come from the type rather than from the array.
    const { target, calls } = fakeGl();
    const uniforms: Record<string, PackedUniform> = { uVec3: { type: "vec3", value: [1, 2, 3] } };
    applyPackedUniforms(
      target,
      resolveUniforms(target, {} as WebGLProgram, uniforms),
      uniforms,
      createUniformScratch(),
    );
    expect(calls[0].kind).toBe("3fv");
    expect(calls[0].value).toEqual([1, 2, 3]);
  });
  it("skips a uniform the shader optimized away", () => {
    // An unused uniform resolves to null; uploading to null is a no-op on every implementation, so
    // the packed value costs nothing rather than throwing.
    const { target, calls } = fakeGl();
    const uniforms: Record<string, PackedUniform> = { uUnused: { type: "float", value: 1 } };
    const locations = new Map([["uUnused", null]]);
    applyPackedUniforms(target, locations, uniforms, createUniformScratch());
    expect(calls).toEqual([]);
  });
  it("rejects a vector whose length disagrees with its declared type", () => {
    const { target } = fakeGl();
    const uniforms = { uTooShort: { type: "vec4", value: [1, 1, 1] } } as Record<
      string,
      PackedUniform
    >;
    expect(() =>
      applyPackedUniforms(
        target,
        resolveUniforms(target, {} as WebGLProgram, uniforms),
        uniforms,
        createUniformScratch(),
      ),
    ).toThrow(/needs 4 values, got 3/);
  });
  it("rejects a scalar whose value is not a number", () => {
    const { target } = fakeGl();
    const uniforms = { uScalar: { type: "float", value: [1] } } as unknown as Record<
      string,
      PackedUniform
    >;
    expect(() =>
      applyPackedUniforms(
        target,
        resolveUniforms(target, {} as WebGLProgram, uniforms),
        uniforms,
        createUniformScratch(),
      ),
    ).toThrow(/needs a number/);
  });
  it("refuses a type it has no upload path for", () => {
    const { target } = fakeGl();
    const uniforms: Record<string, PackedUniform> = { uMat: { type: "mat4", value: 1 } };
    expect(() =>
      applyPackedUniforms(
        target,
        resolveUniforms(target, {} as WebGLProgram, uniforms),
        uniforms,
        createUniformScratch(),
      ),
    ).toThrow(/no upload path/);
  });
});
describe("applyProgramUniforms", () => {
  it("applies a block once to a program until another block replaces it", () => {
    const { target, calls } = fakeGl();
    const first = { uScale: { type: "float", value: 2 } } as const;
    const second = { uScale: { type: "float", value: 4 } } as const;
    const locations = resolveUniforms(target, {} as WebGLProgram, first);
    const applied = new Map<WebGLProgram, unknown>();
    const program = {} as WebGLProgram;
    const scratch = createUniformScratch();
    applyProgramUniforms(target, applied, program, locations, first, scratch);
    applyProgramUniforms(target, applied, program, locations, first, scratch);
    expect(calls).toHaveLength(1);
    applyProgramUniforms(target, applied, program, locations, second, scratch);
    applyProgramUniforms(target, applied, program, locations, first, scratch);
    expect(calls.map((c) => c.value)).toEqual([2, 4, 2]);
    applyProgramUniforms(target, applied, {} as WebGLProgram, locations, first, scratch);
    expect(calls).toHaveLength(4);
  });
});
describe("applyPackedTextures", () => {
  function fakeTextureGl() {
    const bound: {
      unit: number;
      texture: unknown;
    }[] = [];
    const samplers: {
      name: string;
      value: number;
    }[] = [];
    const samplerBindings = new Map<number, WebGLSampler | null>();
    const gl = {
      TEXTURE_2D: 0x0de1,
      TEXTURE0: 0x84c0,
      activeTexture: () => {},
      bindSampler: (unit: number, sampler: WebGLSampler | null) =>
        samplerBindings.set(unit, sampler),
      bindTexture: (_target: number, texture: WebGLTexture | null) =>
        bound.push({ unit: bound.length, texture }),
      getUniformLocation: (_p: WebGLProgram, name: string) =>
        ({ name }) as unknown as WebGLUniformLocation,
      uniform1i: (l: WebGLUniformLocation | null, value: number) =>
        samplers.push({ name: nameOf(l), value }),
    };
    return { gl, bound, samplers, samplerBindings };
  }
  it("binds each declared unit and points its sampler at the slot", () => {
    const { gl, samplers } = fakeTextureGl();
    const textures = new Map([
      [0, {} as WebGLTexture],
      [1, {} as WebGLTexture],
    ]);
    applyPackedTextures(gl, {} as WebGLProgram, [0, 1], textures);
    expect(samplers).toEqual([
      { name: "uTexture0", value: 0 },
      { name: "uTexture1", value: 1 },
    ]);
  });
  it("uses each texture's own sampling parameters instead of an inherited sampler", () => {
    const { gl, samplerBindings } = fakeTextureGl();
    const inherited = {} as WebGLSampler;
    gl.bindSampler(0, inherited);
    gl.bindSampler(1, inherited);
    gl.bindSampler(2, inherited);
    applyPackedTextures(
      gl,
      {} as WebGLProgram,
      [7, 3],
      new Map([
        [7, {} as WebGLTexture],
        [3, {} as WebGLTexture],
      ]),
    );
    expect([...samplerBindings]).toEqual([
      [0, null],
      [1, null],
      [2, inherited],
    ]);
  });
  it("binds the sampler a slot names, and none for a slot that names none", () => {
    const { gl, samplerBindings } = fakeTextureGl();
    const own = {} as WebGLSampler;
    applyPackedTextures(
      gl,
      {} as WebGLProgram,
      [0, 1],
      new Map([
        [0, {} as WebGLTexture],
        [1, {} as WebGLTexture],
      ]),
      [],
      undefined,
      [own],
    );
    expect([...samplerBindings]).toEqual([
      [0, own],
      [1, null],
    ]);
  });
  it("looks up each slot's sampler location once per program", () => {
    const { gl } = fakeTextureGl();
    const lookups: string[] = [];
    const lookup = gl.getUniformLocation;
    gl.getUniformLocation = (program: WebGLProgram, name: string) => {
      lookups.push(name);
      return lookup(program, name);
    };
    const program = {} as WebGLProgram;
    const textures = new Map([
      [0, {} as WebGLTexture],
      [1, {} as WebGLTexture],
    ]);
    applyPackedTextures(gl, program, [0, 1], textures);
    applyPackedTextures(gl, program, [0, 1], textures);
    expect(lookups).toEqual(["uTexture0", "uTexture1"]);
  });
  it("rejects a declared texture that was not uploaded", () => {
    // Drawing with whatever unit 0 happens to hold would be a silent material substitution.
    const { gl } = fakeTextureGl();
    expect(() =>
      applyPackedTextures(gl, {} as WebGLProgram, [0, 1], new Map([[0, {} as WebGLTexture]])),
    ).toThrow(/not uploaded/);
  });
  it("binds by image name when the caller uploaded by name", () => {
    // Every material binds slot 0, so the unit index cannot say which image a part samples — two
    // parts would both take whatever unit 0 holds. The name is what distinguishes them.
    const { gl, samplers } = fakeTextureGl();
    const body = {} as WebGLTexture;
    const effect = {} as WebGLTexture;
    applyPackedTextures(
      gl,
      {} as WebGLProgram,
      [0],
      new Map([[0, {} as WebGLTexture]]),
      ["ntt_ahact_01"],
      new Map([
        ["ntt_ahact_01", body],
        ["ntt_ahact_eff", effect],
      ]),
    );
    expect(samplers).toEqual([{ name: "uTexture0", value: 0 }]);
  });
  it("binds each slot to its own named image, not one image to both", () => {
    // The two-unit family (a body sampling two images through `uTexture0`/`uTexture1`) is the case
    // where a unit-keyed table silently binds the same image twice.
    const { gl, bound } = fakeTextureGl();
    const effect = {} as WebGLTexture;
    const body = {} as WebGLTexture;
    applyPackedTextures(
      gl,
      {} as WebGLProgram,
      [0, 1],
      new Map(),
      ["ntt_airlad_effEx", "ntt_airlad_add"],
      new Map([
        ["ntt_airlad_effEx", effect],
        ["ntt_airlad_add", body],
      ]),
    );
    expect(bound.map((b) => b.texture)).toEqual([effect, body]);
  });
  it("rejects a named image when the caller supplied no name map", () => {
    const { gl } = fakeTextureGl();
    expect(() =>
      applyPackedTextures(gl, {} as WebGLProgram, [0], new Map([[0, {} as WebGLTexture]]), [
        "a.dds",
      ]),
    ).toThrow(/image a\.dds, which was not uploaded/);
  });
  it("rejects a named image that was not uploaded", () => {
    const { gl } = fakeTextureGl();
    expect(() =>
      applyPackedTextures(
        gl,
        {} as WebGLProgram,
        [0],
        new Map(),
        ["ntt_ahact_01"],
        new Map([["ntt_ahact_eff", {} as WebGLTexture]]),
      ),
    ).toThrow(/image ntt_ahact_01/);
  });
});
