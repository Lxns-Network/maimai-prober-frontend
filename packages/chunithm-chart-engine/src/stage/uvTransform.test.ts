import { describe, expect, it } from "vitest";
import { stageUvTransforms } from "./material";
import { bindStageMaterialUv, StageMaterialUvState } from "./model/materialUv";
import type { UvAnimation } from "../assets/uvAnimation";
describe("UV transforms", () => {
  const material = {
    uvOffsetMask: (1 << 0) | (1 << 2),
    layers: [
      { slot: 0, uv: 0, offsetScale: [0.5, 0.25, 2, 3] },
      { slot: 1, uv: 1, offsetScale: [0, 0, 1, 1] },
    ],
    specularMap: { slot: 2, uv: 0, offsetScale: [0.1, 0.2, 4, 5] },
  } as unknown as Parameters<typeof stageUvTransforms>[0];
  it("keeps the shape's own transforms while no node offsets exist", () => {
    const t = stageUvTransforms(material, null);
    expect(t.layers).toEqual([
      [0.5, 0.25, 2, 3],
      [0, 0, 1, 1],
    ]);
    expect(t.specular).toEqual([0.1, 0.2, 4, 5]);
  });
  it("replaces every map's transform by its slot's offset with unit scale", () => {
    const offsets = Float32Array.from({ length: 28 }, (_, i) => i);
    const t = stageUvTransforms(material, offsets);
    expect(t.layers).toEqual([
      [0, 1, 1, 1],
      [2, 3, 1, 1],
    ]);
    expect(t.specular).toEqual([4, 5, 1, 1]);
  });
  it("uses identity for absent maps", () => {
    const t = stageUvTransforms({ layers: [], specularMap: null } as never, null);
    expect(t.layers).toEqual([
      [0, 0, 1, 1],
      [0, 0, 1, 1],
    ]);
    expect(t.specular).toEqual([0, 0, 1, 1]);
  });
  it("overlays only written material slots on a shape's node offsets and own transforms", () => {
    const animation: UvAnimation = {
      frameCount: 1,
      tracks: [
        {
          materialName: "material",
          textureName: "image",
          channel: "Others",
          frameCount: 1,
          staticValues: [0.25, 0.5, 1, 1],
          curves: [null, null, null, null],
        },
      ],
    };
    const draw = {
      shape: {
        state: { _name: "material" },
        textures: [{ texture: { _name: "image", _textureType: "specular" } }],
      },
    } as unknown as Parameters<typeof bindStageMaterialUv>[1][number];
    const state = new StageMaterialUvState(1);
    state.apply(animation, bindStageMaterialUv(animation, [draw]), 0);
    const t = stageUvTransforms(material, null, { state, draw: 0 });
    expect(t.layers[0]).toEqual([0.5, 0.25, 2, 3]);
    expect(Array.from(t.specular)).toEqual([0.25, 0.5, 1, 1]);
    const offsets = Float32Array.from({ length: 28 }, (_, i) => i);
    const withOffsets = stageUvTransforms(material, offsets, { state, draw: 0 });
    expect(withOffsets.layers[0]).toEqual([0, 1, 1, 1]);
    expect(Array.from(withOffsets.specular)).toEqual([0.25, 0.5, 1, 1]);
  });
  it("routes node offsets and material writes to individual Blend maps", () => {
    const blend = {
      ...material,
      blendMaps: Array.from({ length: 7 }, (_, slot) => ({ slot: slot + 1, uv: 0 })),
      uvOffsetMask: 0,
    };
    const animation: UvAnimation = {
      frameCount: 1,
      tracks: [
        {
          materialName: "blend",
          textureName: "image",
          channel: "Others",
          frameCount: 1,
          staticValues: [0.25, 0.5, 2, 3],
          curves: [null, null, null, null],
        },
      ],
    };
    const draws = [
      {
        shape: {
          state: { _name: "blend" },
          textures: [{ texture: { _name: "image", _textureType: "ex6" } }],
        },
      },
    ] as unknown as Parameters<typeof bindStageMaterialUv>[1];
    const state = new StageMaterialUvState(1);
    const binding = bindStageMaterialUv(animation, draws);
    state.apply(animation, binding, 0);
    const cells = { state, draw: 0 };
    expect(Array.from(stageUvTransforms(blend, null, cells).blend!)).toEqual(
      Array.from({ length: 7 }, () => [0, 0, 1, 1]).flat(),
    );
    const offsets = Float32Array.from({ length: 28 }, (_, index) => index / 16);
    state.publishOffsets(offsets);
    state.apply(animation, binding, 0);
    const expected = Array.from({ length: 7 }, (_, index) => [
      offsets[(index + 6) * 2],
      offsets[(index + 6) * 2 + 1],
      1,
      1,
    ]).flat();
    expected.splice(6 * 4, 4, 0.25, 0.5, 2, 3);
    expect(Array.from(stageUvTransforms(blend, offsets, cells).blend!)).toEqual(expected);
    expect(Array.from(stageUvTransforms(blend, null, cells).blend!)).toEqual(expected);
  });
  it("keeps material animation latent until its shader feature is enabled", () => {
    const state = new StageMaterialUvState(1);
    const offsets = Float32Array.from({ length: 28 }, (_, i) => i + 1);
    const disabled = { ...material, uvOffsetMask: 0 };
    const animation = { state, draw: 0 };
    const before = stageUvTransforms(disabled, null, animation);
    expect(before.layers[0]).toEqual([0, 0, 1, 1]);
    expect(before.specular).toEqual([0, 0, 1, 1]);
    state.publishOffsets(offsets);
    const after = stageUvTransforms(disabled, offsets, animation);
    expect(after.layers[0]).toEqual([1, 2, 1, 1]);
    expect(after.specular).toEqual([5, 6, 1, 1]);
    expect(stageUvTransforms(disabled, null, animation)).toEqual(after);
  });
});
