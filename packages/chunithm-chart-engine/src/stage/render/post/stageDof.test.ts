import { describe, expect, it } from "vitest";
import { compileTestShader, type TestImage } from "../../../gpu/glslLite.testkit.ts";
import { POST_PREFIX } from "./postKit";
import {
  DOF_COMBINE_SHADER,
  DOF_DOWN_SHADER,
  DOF_DEPTH_SHADER,
  DOF_NEAR_SHADER,
  DOF_SMALL_SHADER,
  DOF_COPY_SHADER,
  dofGaussianShader,
} from "./stageDof";

const width = 9;
const height = 7;
const image = (pixel: (x: number, y: number) => number[], filter: "nearest" | "linear") => {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { width, height, data, filter } satisfies TestImage;
};
const color = image((x, y) => [x / width, y / height, (x + y) / (width + height), 1], "linear");
const depth = image((x) => [x < 3 ? 0 : x < 6 ? 0.9 : x < 8 ? 0.99 : 1, 0, 0, 1], "nearest");
const medium = image((x, y) => [x / width, y / height, 0.4, x < 4 ? 0.3 : 0.6], "linear");
const large = image(() => [0.7, 0.2, 0.3, 0.4], "linear");
const uniforms = {
  textureSize0: [width, height, 1 / width, 1 / height],
  targetSize: [width, height, 1 / width, 1 / height],
  shaderParam0: [-0.002, 0.4, 0.001, -0.2],
  systemParam: [-1.001, -1.001],
  farAndSky: [0.001, -0.2, 0, 500],
  noBlurCoc: 0.5,
  direction: [1, 0],
  depthTexelSize: [1 / width, 1 / height],
};
const compile = (source: string, samplers: Record<string, TestImage>) =>
  compileTestShader(`${POST_PREFIX}\n${source}`, { samplers, uniforms });
const pixel = (img: TestImage, x: number, y: number) =>
  Array.from(img.data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
const close = (a: number[], b: number[]) =>
  a.forEach((value, i) => expect(value).toBeCloseTo(b[i], 6));
const clamp = (v: number) => Math.min(1, Math.max(0, v));

describe("depth-of-field shaders", () => {
  it("copies the sharp primary image instead of using the DOF helper's Gaussian slot", () => {
    const sharp = image((x, y) => [x % 2, y % 2, (x + y) % 2, 1], "linear");
    const shader = compile(DOF_COPY_SHADER, { texture0: sharp });
    for (const x of [0, 1, 4, 7, 8]) close(shader.pixel(x, 3, width, height), pixel(sharp, x, 3));
    for (const focusNoBlur of [false, true]) {
      const blurred = compile(dofGaussianShader(focusNoBlur), { texture0: sharp });
      expect(blurred.pixel(4, 3, width, height)[0]).toBeGreaterThan(0.4);
      expect(shader.pixel(4, 3, width, height)[0]).toBe(0);
    }
  });

  it("interpolates magnified depth without enabling linear filtering on a depth texture", () => {
    const input = image((x, y) => [(x + y * 2) / (width + height * 2), 0, 0, 1], "nearest");
    const shader = compile(
      `${DOF_DEPTH_SHADER}
      void main(){float depth=linearDofDepth(pixelUv());outputColor=vec4(depth,depth,depth,1.0);}`,
      { depthImage: input },
    );
    const reference = compile("void main(){outputColor=sampleImage(depthImage,pixelUv());}", {
      depthImage: { ...input, filter: "linear" },
    });
    for (const [w, h] of [
      [18, 14],
      [13, 11],
    ])
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const actual = shader.pixel(x, y, w, h);
          const expected = reference.pixel(x, y, w, h);
          close(actual, [expected[0], expected[0], expected[0], 1]);
        }
  });

  it("derives near and far circles of confusion from projected depth", () => {
    const shader = compile(DOF_DOWN_SHADER, { texture0: color, texture1: depth });
    for (const x of [1, 4, 7, 8]) {
      const y = 3;
      const d = pixel(depth, x, y)[0];
      const distance = uniforms.systemParam[1] / (d + uniforms.systemParam[0]);
      const coc = Math.max(clamp(-0.002 * distance + 0.4), clamp(0.001 * distance - 0.2));
      close(shader.pixel(x, y, width, height), [...pixel(color, x, y).slice(0, 3), coc]);
    }
  });

  it("expands foreground blur and copies the small pass at native zero offsets", () => {
    const near = compile(DOF_NEAR_SHADER, { texture0: medium, texture1: large });
    for (const x of [2, 5]) {
      const a = pixel(medium, x, 3);
      const b = pixel(large, x, 3);
      close(near.pixel(x, 3, width, height), [...a.slice(0, 3), 2 * Math.max(a[3], b[3]) - a[3]]);
    }
    const small = compile(DOF_SMALL_SHADER, { texture0: medium });
    for (const x of [2, 3, 4, 5, 7]) close(small.pixel(x, 3, width, height), pixel(medium, x, 3));
  });

  it("blends by depth but excludes the sky distance", () => {
    const shader = compile(DOF_COMBINE_SHADER, {
      texture0: color,
      texture1: medium,
      texture2: large,
      depthImage: depth,
    });
    for (const x of [1, 4, 7, 8]) {
      const y = 3;
      const original = pixel(color, x, y);
      const med = pixel(medium, x, y);
      const big = pixel(large, x, y);
      const d = pixel(depth, x, y)[0];
      const distance = uniforms.systemParam[1] / (d + uniforms.systemParam[0]);
      const coc = distance > 500 ? 0 : Math.max(med[3], clamp(0.001 * distance - 0.2));
      const a = clamp(-1.25 * coc + 1.25);
      const b = clamp(1.25 * coc - 0.24999998);
      const expected = original
        .slice(0, 3)
        .map((v, i) => v * (1 - coc) + (a * med[i] + b * big[i]) * coc);
      close(shader.pixel(x, y, width, height), [...expected, 1]);
      if (x === 7) expect(coc).toBeGreaterThan(0);
      if (x === 8) {
        expect(distance).toBeGreaterThan(uniforms.farAndSky[3]);
        close(shader.pixel(x, y, width, height), [...original.slice(0, 3), 1]);
      }
    }
  });

  it("applies both Gaussian directions and the focus-no-blur sampling rule", () => {
    const weights = [0.199471, 0.176033, 0.120985, 0.064759, 0.026995, 0.008764];
    for (const focusNoBlur of [false, true]) {
      const shader = compile(dofGaussianShader(focusNoBlur), { texture0: medium });
      for (const x of [2, 4, 7]) {
        const center = pixel(medium, x, 3);
        const sum = center.map((v) => v * weights[0]);
        let total = weights[0];
        for (let i = 1; i < weights.length; i++) {
          for (const offset of [-i, i]) {
            const tap = pixel(medium, Math.max(0, Math.min(width - 1, x + offset)), 3);
            if (focusNoBlur && tap[3] < uniforms.noBlurCoc) continue;
            for (let c = 0; c < (focusNoBlur ? 3 : 4); c++) sum[c] += tap[c] * weights[i];
            total += weights[i];
          }
        }
        const expected = sum.map((v, c) => (focusNoBlur && c === 3 ? v : v / total));
        close(shader.pixel(x, 3, width, height), expected);
      }
    }
  });
});
