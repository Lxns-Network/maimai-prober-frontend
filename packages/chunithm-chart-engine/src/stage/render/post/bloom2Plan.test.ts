import { describe, expect, it } from "vitest";
import type { StageBloom2 } from "../../nodes/bloom2";
import { bloom2LevelSizes, buildBloom2Plan, lumExtParams } from "./bloom2Plan";

const bloom: StageBloom2 = {
  pass: 17,
  toneMode: 4,
  blueShift: true,
  starCount: 4,
  starRotation: 45,
  starLength: 1.5,
  starRetinaRatio: 0.1,
  starRange: 1,
  starIntensity: 1,
  starOffset: 0.1,
  starShift: Float32Array.of(0, 0, 0),
  bloomRetinaRatio: 0.1,
  bloomRange: 1.5,
  bloomLevelRange: 0.25,
  bloomIntensity: 0.8,
  bloomOffset: 0.1,
  bloomShift: Float32Array.of(2, 0, -2),
  toneRetinaRatio: 0.5,
  toneRetinaSpeed: 0.2,
  toneMiddleGray: 0.5,
  shoulderStrength: 0.22,
  linearStrength: 0.3,
  linearAngle: 0.1,
  toeStrength: 0.2,
  toeNumerator: 0.01,
  toeDenominator: 0.3,
  whitePoint: 11.2,
};

describe("tone-mapping bloom plan", () => {
  it("reduces by four, rounding up, until both sides reach the minimum", () => {
    expect(bloom2LevelSizes(1920, 1080).map((s) => [s.width, s.height])).toEqual([
      [480, 270],
      [120, 68],
      [30, 17],
      [8, 5],
    ]);
    expect(bloom2LevelSizes(960, 540).map((s) => [s.width, s.height])).toEqual([
      [240, 135],
      [60, 34],
      [15, 9],
    ]);
    expect(bloom2LevelSizes(16, 16)).toEqual([]);
  });

  it("chooses the exact reduction only for exact quarter steps", () => {
    const plan = buildBloom2Plan(bloom, 1920, 1080);
    expect(plan.reduction.map((s) => s.shader)).toEqual([
      "reduce",
      "reduce16",
      "reduce",
      "reduce16",
    ]);
    expect(plan.reduction[0].inputs).toEqual([{ kind: "scene" }]);
    expect(plan.reduction[3].inputs).toEqual([{ kind: "level", index: 2 }]);
  });

  it("builds the bloom levels from coarsest to finest, each blurred in both directions", () => {
    const plan = buildBloom2Plan(bloom, 1920, 1080);
    expect(plan.bloom.map((s) => s.shader)).toEqual([
      ...Array.from({ length: 4 }, () => ["lumExt", "gaussW", "gaussH"]).flat(),
      "copy",
    ]);
    const lum = plan.bloom.filter((s) => s.shader === "lumExt");
    expect(lum.map((s) => (s.target as { index: number }).index)).toEqual([3, 2, 1, 0]);
    expect(lum.map((s) => s.argument[0])).toEqual([0.75, 0.5, 0.25, 0]);
    expect(lum[0].inputs[2]).toEqual({ kind: "none" });
    expect(lum[1].inputs).toEqual([
      { kind: "level", index: 2 },
      { kind: "tone" },
      { kind: "result", index: 3 },
    ]);
    expect(plan.final).toMatchObject({
      shader: "toneBright",
      target: "output",
      inputs: [
        { kind: "scene" },
        { kind: "result", index: 0 },
        { kind: "star", index: 2 },
        { kind: "tone" },
      ],
    });
  });

  it("packs the shader parameters in the shader's own layout", () => {
    const params = lumExtParams(bloom, 1920);
    expect(Array.from(params.subarray(0, 4))).toEqual([
      1.5,
      Math.fround(0.1),
      Math.fround(0.8),
      Math.fround(0.1),
    ]);
    expect(params[4]).toBe(Math.fround(2 * Math.fround(1 / 1920)));
    expect(params[5]).toBe(0);
    expect(params[7]).toBe(0.5);
    const final = buildBloom2Plan(bloom, 1920, 1080).final.params;
    expect(Array.from(final.subarray(2, 4))).toEqual([0.5, 0.5]);
    expect(Array.from(final.subarray(4, 8)).map((x) => +x.toFixed(2))).toEqual([
      0.22, 0.3, 0.1, 0.2,
    ]);
    expect(Array.from(final.subarray(8, 11)).map((x) => +x.toFixed(2))).toEqual([0.01, 0.3, 11.2]);
  });
});
