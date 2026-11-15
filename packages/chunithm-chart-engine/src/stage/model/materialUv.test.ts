import { describe, expect, it } from "vitest";
import type { UvAnimation, UvTrack } from "../../assets/uvAnimation";
import type { StageShape } from "../pack";
import { bindStageMaterialUv, StageMaterialUvState } from "./materialUv";
const track = (
  materialName: string,
  channel: UvTrack["channel"],
  textureName = "image",
  values: UvTrack["staticValues"] = [0, 0, 1, 1],
): UvTrack => ({
  materialName,
  channel,
  textureName,
  frameCount: 1,
  staticValues: values,
  curves: [null, null, null, null],
});
const animation = (...tracks: UvTrack[]): UvAnimation => ({ frameCount: 1, tracks });
const shape = (name: string, textures: [string, string][] = []): StageShape =>
  ({
    state: { _name: name },
    textures: textures.map(([textureName, role]) => ({
      texture: { _name: textureName, _textureType: role },
    })),
  }) as unknown as StageShape;
const draw = (name: string, textures: [string, string][] = []) => ({
  shape: shape(name, textures),
});
const words = (values: Float32Array | null) => values && Array.from(values);
describe("material UV binding and parameter cells", () => {
  it("routes separate UV0 tracks by material and leaves unmatched cells untouched", () => {
    const uv = animation(
      track("beamEA_", "UV0", "image", [1, 2, 1, 1]),
      track("beamOq_", "UV0", "image", [3, 4, 1, 1]),
    );
    const draws = [draw("amp1_"), draw("beamEA_"), draw("beamOq_"), draw("lens_")];
    const binding = bindStageMaterialUv(uv, draws);
    expect(binding.tracksByDraw).toEqual([[], [0], [1], []]);
    const state = new StageMaterialUvState(draws.length);
    state.apply(uv, binding, 0);
    expect(words(state.parameter(0, 0))).toBeNull();
    expect(words(state.parameter(1, 0))).toEqual([1, 2, 1, 1]);
    expect(words(state.parameter(2, 0))).toEqual([3, 4, 1, 1]);
    expect(words(state.parameter(3, 0))).toBeNull();
  });
  it("applies duplicate target writes in track order after node texture offsets", () => {
    const uv = animation(
      track("comentset_", "UV0", "image", [1, 2, 1, 1]),
      track("comentset_", "Others", "image", [0.375, 4, 1, 1]),
    );
    const draws = [draw("comentset_", [["image", "base"]]), draw("other")];
    const binding = bindStageMaterialUv(uv, draws);
    expect(binding.parameters).toEqual([0, 0]);
    const state = new StageMaterialUvState(2);
    const offsets = new Float32Array(28);
    offsets[0] = 0.25;
    offsets[1] = -0.5;
    state.publishOffsets(offsets);
    state.apply(uv, binding, 0);
    expect(words(state.parameter(0, 0))).toEqual([0.375, 4, 1, 1]);
    expect(words(state.parameter(1, 0))).toEqual([0.25, -0.5, 1, 1]);
    state.publishOffsets(offsets);
    expect(words(state.parameter(0, 0))).toEqual([0.25, -0.5, 1, 1]);
  });
  it("resolves Others once per track across matching draws in supplied order", () => {
    const uv = animation(track("material", "Others", "image", [1, 2, 1, 1]));
    const draws = [
      draw("material", [
        ["image", "normal"],
        ["image", "base"],
      ]),
      draw("material", [["image", "specular"]]),
      draw("material", [["other", "base"]]),
      draw("not-material", [["image", "incandescence"]]),
    ];
    const binding = bindStageMaterialUv(uv, draws);
    expect(binding.parameters).toEqual([2]);
    const state = new StageMaterialUvState(draws.length);
    state.apply(uv, binding, 0);
    for (const index of [0, 1, 2]) expect(words(state.parameter(index, 2))).toEqual([1, 2, 1, 1]);
    expect(state.parameter(0, 3)).toBeNull();
    expect(state.parameter(3, 2)).toBeNull();
  });
  it("rejects absent track or draw identities instead of guessing", () => {
    expect(() => bindStageMaterialUv(animation(track("", "UV0")), [draw("x")])).toThrow(
      /empty track identity/,
    );
    expect(() => bindStageMaterialUv(animation(track("x", "UV0")), [draw("")])).toThrow(
      /missing material name/,
    );
    expect(() =>
      bindStageMaterialUv(animation(track("x", "Others")), [draw("x", [["", "base"]])]),
    ).toThrow(/missing texture identity/);
  });
  it("rejects invalid bindings before changing any draw", () => {
    const uv = animation(track("material", "UV0", "image", [1, 2, 1, 1]));
    const state = new StageMaterialUvState(2);
    expect(() => state.apply(uv, { parameters: [0], tracksByDraw: [[0], [1]] }, 0)).toThrow(
      /invalid bound track/,
    );
    expect(state.parameter(0, 0)).toBeNull();
    expect(() => state.apply(uv, { parameters: [14], tracksByDraw: [[], []] }, 0)).toThrow(
      /invalid bound parameter/,
    );
    expect(state.parameter(0, 0)).toBeNull();
  });
});
