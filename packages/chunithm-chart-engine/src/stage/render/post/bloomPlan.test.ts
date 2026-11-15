import { describe, expect, it } from "vitest";
import type { StageBloom } from "../../nodes/bloom";
import {
  bloomCosine,
  bloomSine,
  bloomTargetSizes,
  bloomWeights,
  buildBloomPlan,
  type BloomDraw,
} from "./bloomPlan";
import fixture from "./bloomPlan.fixture.json";

const reference: StageBloom = {
  glow: true,
  range: 0.5,
  intensity: 2,
  attenuation: 1,
  shift: new Float32Array(3),
  starCount: 4,
  starRotation: 45,
  starRange: 1,
  starIntensity: 1,
  starLength: 0,
  starAttenuation: 1.8,
  starShift: new Float32Array(3),
};

const bits = (values: ArrayLike<number>) =>
  Array.from(new Uint32Array(Float32Array.from(values as number[]).buffer));

describe("bloom plan", () => {
  it("reproduces the recorded draw sequence for a full-size scene", () => {
    const plan = buildBloomPlan(reference, fixture.size[0], fixture.size[1]);
    expect(plan).toHaveLength(fixture.plan.length);
    plan.forEach((step, index) => {
      const expected = fixture.plan[index] as Record<string, unknown>;
      expect(step.kind).toBe(expected.kind);
      expect(step.target).toBe(expected.target);
      if (step.kind !== "draw") return;
      const draw = step as BloomDraw;
      expect(draw.shader, `step ${index}`).toBe(expected.shader);
      expect(draw.inputs, `step ${index}`).toEqual(expected.inputs);
      expect(draw.blend, `step ${index}`).toBe(expected.blend);
      expect(bits(draw.params), `parameters of step ${index}`).toEqual(expected.params);
      expect(bits(draw.argument), `argument of step ${index}`).toEqual(expected.argument);
    });
  });

  it("sizes the six targets", () => {
    expect(bloomTargetSizes(1920, 1080).map((s) => [s.width, s.height])).toEqual([
      [480, 270],
      [480, 270],
      [480, 270],
      [480, 270],
      [120, 67],
      [120, 67],
    ]);
    expect(fixture.targets.map((t) => t.shift)).toEqual([2, 2, 2, 2, 4, 4]);
  });

  it("weights are a normalised half-kernel for the given falloff", () => {
    const weights = bloomWeights(1, 5);
    expect(weights[0]).toBeCloseTo(0.3989423, 6);
    expect(weights[1]).toBeCloseTo(0.2419707, 6);
    expect(bloomWeights(0, 3)[0]).toBeCloseTo(1 / (0.01 * Math.sqrt(2 * Math.PI)), 3);
  });

  it("the streak direction functions track the real sine and cosine", () => {
    for (let a = -7; a <= 7; a += 0.013) {
      expect(Math.abs(bloomSine(Math.fround(a)) - Math.sin(Math.fround(a)))).toBeLessThan(2e-7);
      expect(Math.abs(bloomCosine(Math.fround(a)) - Math.cos(Math.fround(a)))).toBeLessThan(2e-7);
    }
  });

  it("without glow the glow targets are cleared and the blur chain is skipped", () => {
    const plan = buildBloomPlan({ ...reference, glow: false }, 1280, 720);
    expect(plan.filter((s) => s.kind === "clear").map((s) => s.target)).toEqual([4, 3, 1]);
    expect(plan.filter((s) => s.kind === "draw" && s.shader === "blur")).toHaveLength(0);
    expect(plan[plan.length - 1]).toMatchObject({
      shader: "combine",
      target: "scene",
      blend: "add",
    });
  });

  it("star draws follow the star count and rotation", () => {
    const plan = buildBloomPlan({ ...reference, starCount: 3, starLength: 1.5 }, 1280, 720);
    const long = plan.filter((s) => s.kind === "draw" && s.shader === "starLong") as BloomDraw[];
    expect(long).toHaveLength(3);
    const angle = (i: number) => Math.atan2(long[i].argument[0], -long[i].argument[1]);
    expect(Math.hypot(long[0].argument[0], long[0].argument[1])).toBeCloseTo(1.5, 5);
    expect((angle(1) - angle(0) + 2 * Math.PI) % (2 * Math.PI)).toBeCloseTo(
      (120 * Math.PI) / 180,
      4,
    );
  });
});
