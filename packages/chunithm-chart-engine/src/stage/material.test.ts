import { describe, expect, it } from "vitest";
import { type StageShape } from "./pack";
import { stageMaterial } from "./material";
describe("Fresnel material parameters", () => {
  const bits = (value: number) => new Uint32Array(Float32Array.of(value).buffer)[0];
  const integer = (name: string, value: number) => ({
    name,
    value: { _variantType: { u32: 1 }, _valueS32: { u32: value >>> 0 } },
  });
  const scalar = (name: string, value: number) => ({
    name,
    value: { _variantType: { u32: 0 }, _valueF32: { u32: bits(value) } },
  });
  const shape = (parameters: StageShape["parameters"]): StageShape =>
    ({
      state: {
        _lighting: "phong",
        _shaderName: "",
        _fillType: { u32: 0 },
        _alphaRef: { u32: 0 },
      },
      layout: [{ semantic: 3, index: 0, type: 8 }],
      textures: [],
      parameters,
    }) as unknown as StageShape;
  it("selects HalfLambert and TwoSideLighting independently of diffuse/specular channels", () => {
    for (const lighting of ["constant", "lambert", "phong"])
      for (const [shaderType, expected] of [
        [0, 0],
        [6, 1],
        [9, 2],
        [11, 0],
        [15, 0],
      ]) {
        const input = shape([integer("seaShaderType", shaderType)]);
        const material = stageMaterial({
          ...input,
          state: { ...input.state, _lighting: lighting },
        });
        expect(material.lightModel).toBe(expected);
        expect(material.lighting).toBe(lighting);
      }
    expect(() => stageMaterial(shape([integer("seaShaderType", 2)]))).toThrow(/seaShaderType/);
  });
  it("selects the default curve only when enabled and above the native scale threshold", () => {
    expect(stageMaterial(shape([])).fresnel).toBeNull();
    const enable = integer("seaUseFresnel", 1);
    expect(stageMaterial(shape([enable])).fresnel).toEqual([1, 0, 4]);
    for (const scale of [-1, 0, 1.1920928955078125e-7])
      expect(stageMaterial(shape([enable, scalar("tsFresnelScale", scale)])).fresnel).toBeNull();
    expect(
      stageMaterial(shape([enable, scalar("tsFresnelScale", 2.384185791015625e-7)])).fresnel,
    ).toEqual([2.384185791015625e-7, 0, 4]);
    expect(stageMaterial(shape([scalar("tsFresnelScale", 0.5)])).fresnel).toBeNull();
  });
  it("loads scale, bias and integer power, retaining the default for a nonpositive power", () => {
    for (const power of [-2, 0, 2, 7])
      expect(
        stageMaterial(
          shape([
            integer("seaUseFresnel", 1),
            scalar("tsFresnelScale", 0.5),
            scalar("tsFresnelBias", 0.125),
            integer("tsFresnelPower", power),
          ]),
        ).fresnel,
      ).toEqual([0.5, 0.125, power > 0 ? power : 4]);
  });
  it("lets the explicit vector replace converted scalars regardless of parameter order", () => {
    const explicit = {
      name: "fresnel",
      value: { _variantType: { u32: 2 }, _valueColor: { words: [0.75, 0.25, 3, 0].map(bits) } },
    };
    const parameters = [
      integer("seaUseFresnel", 1),
      scalar("tsFresnelScale", 0.5),
      scalar("tsFresnelBias", 0.125),
      integer("tsFresnelPower", 2),
    ];
    for (const ordered of [
      [explicit, ...parameters],
      [...parameters, explicit],
    ])
      expect(stageMaterial(shape(ordered)).fresnel).toEqual([0.75, 0.25, 3]);
    expect(() =>
      stageMaterial(shape([integer("seaUseFresnel", 1), scalar("tsFresnelScale", NaN)])),
    ).toThrow("non-finite value");
  });
});
it.each([[], [0], [1], [0, 1]].map((sets) => ({ sets })))(
  "retains UV declarations without base textures: $sets",
  ({ sets }) => {
    const shape = {
      state: {
        _lighting: "constant",
        _shaderName: "",
        _fillType: { u32: 2 },
        _alphaRef: { u32: 25 },
      },
      layout: sets.map((index) => ({ semantic: 5, index, type: 1 })),
      textures: [],
      parameters: [],
    } as unknown as StageShape;
    const material = stageMaterial(shape);
    expect(material.hasTexcoords).toBe(sets.length !== 0);
    expect(material.layers).toEqual([]);
    expect(material.pixelAlphaTest).toBe(true);
  },
);
it("retains explicit UV cells independently of the initial feature mask", () => {
  const bits = new DataView(new ArrayBuffer(4));
  const word = (value: number) => (bits.setFloat32(0, value, true), bits.getUint32(0, true));
  const transform = [0.25, -0.5, 2, 3];
  const shape = {
    state: { _lighting: "constant", _shaderName: "", _fillType: { u32: 0 }, _alphaRef: { u32: 0 } },
    layout: [
      { semantic: 5, index: 0, type: 1 },
      { semantic: 3, index: 0, type: 1 },
      { semantic: 6, index: 0, type: 8 },
    ],
    textures: ["base", "specular", "normal", "incandescence"].map((role, ordinal) => ({
      ordinal,
      texture: { _textureType: role, _flag: { u32: 0 }, _uvSetIndex: { u32: 0 } },
    })),
    parameters: [
      { name: "tsEnableUVOffset", value: { _variantType: { u32: 1 }, _valueS32: { u32: 0 } } },
      ...["tsUVScrollUV0", "tsUVScrollSpecular", "tsUVScrollNormal", "tsUVScrollIncandescence"].map(
        (name) => ({
          name,
          value: { _variantType: { u32: 2 }, _valueColor: { words: transform.map(word) } },
        }),
      ),
    ],
  } as unknown as StageShape;
  const material = stageMaterial(shape);
  expect(material.uvOffsetMask).toBe(0);
  expect(material.layers[0].offsetScale).toEqual(transform);
  expect(material.specularMap!.offsetScale).toEqual(transform);
  expect(material.normalMap!.offsetScale).toEqual(transform);
  expect(material.incandescenceMap!.offsetScale).toEqual(transform);
  expect(stageMaterial({ ...shape, parameters: [] }).layers[0].offsetScale).toEqual([0, 0, 1, 1]);
});
it.each([0, 0x10])("selects normal decoding from texture flag %s", (flag) => {
  const shape = {
    state: { _lighting: "phong", _shaderName: "", _fillType: { u32: 0 }, _alphaRef: { u32: 0 } },
    layout: [
      { semantic: 5, index: 1, type: 1 },
      { semantic: 3, index: 0, type: 8 },
      { semantic: 6, index: 0, type: 8 },
    ],
    textures: [
      {
        ordinal: 0,
        texture: { _textureType: "normal", _flag: { u32: flag }, _uvSetIndex: { u32: 1 } },
      },
    ],
    parameters: [],
  } as unknown as StageShape;
  expect(stageMaterial(shape).normalMap).toEqual({
    slot: 0,
    uv: 1,
    offsetScale: [0, 0, 1, 1],
    compressed: flag === 0x10,
  });
  const unrelatedFlag = {
    ...shape,
    textures: [
      { ...shape.textures[0], texture: { ...shape.textures[0].texture, _flag: { u32: 8 } } },
    ],
  };
  expect(() => stageMaterial(unrelatedFlag)).toThrow("texture role normal/8");
});
it("reads the material fog scattering scale, using zero when absent", () => {
  const bits = new DataView(new ArrayBuffer(4));
  const word = (value: number) => (bits.setFloat32(0, value, true), bits.getUint32(0, true));
  const shape = {
    state: { _lighting: "constant", _shaderName: "", _fillType: { u32: 0 }, _alphaRef: { u32: 0 } },
    layout: [],
    textures: [],
    parameters: [],
  } as unknown as StageShape;
  expect(stageMaterial(shape).fogRate).toBe(0);
  for (const value of [0, Math.fround(0.35), 1, 1.5, -1]) {
    const parameters = [
      {
        name: "tsScatteringScale",
        value: { _variantType: { u32: 0 }, _valueF32: { u32: word(value) } },
      },
    ];
    expect(stageMaterial({ ...shape, parameters }).fogRate).toBe(value);
  }
});
it.each([0, 1, 2, 3])("accepts specular map mode %s without changing its UV selection", (mode) => {
  const shape = {
    state: { _lighting: "phong", _shaderName: "", _fillType: { u32: 0 }, _alphaRef: { u32: 0 } },
    layout: [{ semantic: 5, index: 1, type: 1 }],
    textures: [
      {
        ordinal: 0,
        texture: { _textureType: "specular", _flag: { u32: 0 }, _uvSetIndex: { u32: 1 } },
      },
    ],
    parameters: [
      { name: "seaSpecularMapType", value: { _variantType: { u32: 1 }, _valueS32: { u32: mode } } },
    ],
  } as unknown as StageShape;
  expect(stageMaterial(shape).specularMap).toEqual({
    slot: 0,
    uv: 1,
    mapType: mode,
    offsetScale: [0, 0, 1, 1],
  });
});
