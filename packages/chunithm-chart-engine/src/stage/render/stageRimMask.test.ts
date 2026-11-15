import { describe, expect, it } from "vitest";
import { compileTestShader, type TestImage } from "../../gpu/glslLite.testkit.ts";
import { POST_PREFIX } from "./post/postKit";
import { RIM_DEPTH_EDGE_SHADER } from "./stageRimMask";
describe("rim depth mask", () => {
  it("uses the asymmetric depth-neighbour reduction and distance threshold", () => {
    const data = new Float32Array(5 * 5 * 4);
    for (let i = 0; i < 25; i++) data[i * 4] = 0.9;
    const pixel = (x: number, y: number, depth: number) => {
      data[(y * 5 + x) * 4] = depth;
    };
    pixel(2, 2, 0.95);
    pixel(3, 2, 0.8);
    pixel(1, 2, 0.5);
    const texture1: TestImage = { width: 5, height: 5, data, filter: "nearest" };
    const uniforms = {
      textureSize0: [5, 5, 0.2, 0.2],
      systemParam: [-1.001, -1.001],
      monochrome: 1,
      shaderParam0: [0.25, 0, 0, 0],
    };
    const shader = compileTestShader(POST_PREFIX + RIM_DEPTH_EDGE_SHADER, {
      uniforms,
      samplers: { texture1 },
    });
    const distance = (depth: number) => -1.001 / (depth - 1.001);
    const expected = Math.min(
      1,
      Math.max(0, (distance(data[(2 * 5 + 2) * 4]) - distance(data[(2 * 5 + 3) * 4])) / 16 - 0.25),
    );
    for (const value of shader.pixel(2, 2, 5, 5)) expect(value).toBeCloseTo(expected, 5);
  });
});
