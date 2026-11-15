import { describe, expect, it } from "vitest";
import { compileTestShader, type TestImage } from "../../../gpu/glslLite.testkit.ts";
import { POST_PREFIX } from "./postKit";
import { FXAA3_SHADER } from "./stageFxaa3";

// Reference written in the shader's own frame: rows run downwards.
const W = 24;
const H = 20;

function scene(): Float64Array {
  const data = new Float64Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const diagonal = x * 1.3 + y > 18 ? 1 : 0.15;
      const stripe = (x + 2 * y) % 7 === 0 ? 0.35 : 0;
      data.set(
        [diagonal * 0.9 + stripe * 0.2, diagonal * 0.6 + stripe, diagonal * 0.3, 0.25 + x / 40],
        (y * W + x) * 4,
      );
    }
  return data;
}

function sample(data: Float64Array, u: number, v: number): number[] {
  const fx = u * W - 0.5;
  const fy = v * H - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const read = (x: number, y: number) => {
    const cx = Math.min(Math.max(x, 0), W - 1);
    const cy = Math.min(Math.max(y, 0), H - 1);
    return Array.from(data.subarray((cy * W + cx) * 4, (cy * W + cx) * 4 + 4));
  };
  const a = read(x0, y0);
  const b = read(x0 + 1, y0);
  const c = read(x0, y0 + 1);
  const d = read(x0 + 1, y0 + 1);
  return a.map(
    (_, i) => (a[i] * (1 - tx) + b[i] * tx) * (1 - ty) + (c[i] * (1 - tx) + d[i] * tx) * ty,
  );
}

function reference(data: Float64Array, x: number, y: number): number[] {
  const luma = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const u = (x + 0.5) / W;
  const v = (y + 0.5) / H;
  const rx = 1 / W;
  const ry = 1 / H;
  const zu = u - rx * 0.25;
  const zv = v - ry * 0.25;
  const nw = sample(data, zu, zv);
  const ne = sample(data, zu + rx, zv);
  const sw = sample(data, zu, zv + ry);
  const se = sample(data, zu + rx, zv + ry);
  const base = sample(data, u, v);
  const lnw = luma(nw);
  const lne = luma(ne);
  const lsw = luma(sw);
  const lse = luma(se);
  const lm = luma(base);
  const lumaMin = Math.min(lm, Math.min(Math.min(lnw, lne), Math.min(lsw, lse)));
  const lumaMax = Math.max(lm, Math.max(Math.max(lnw, lne), Math.max(lsw, lse)));
  let dx = -(lnw + lne - (lsw + lse));
  let dy = lnw + lsw - (lne + lse);
  const reduce = Math.max((lnw + lne + lsw + lse) * (0.25 / 8), 1 / 128);
  const rcp = 1 / (Math.min(Math.abs(dx), Math.abs(dy)) + reduce);
  dx = Math.min(8, Math.max(-8, dx * rcp)) * rx;
  dy = Math.min(8, Math.max(-8, dy * rcp)) * ry;
  const tap = (t: number) => sample(data, u + dx * (t - 0.5), v + dy * (t - 0.5));
  const a1 = tap(1 / 3);
  const a2 = tap(2 / 3);
  const rgbA = [0, 1, 2].map((i) => 0.5 * (a1[i] + a2[i]));
  const b1 = tap(0);
  const b2 = tap(1);
  const rgbB = [0, 1, 2].map((i) => rgbA[i] * 0.5 + 0.25 * (b1[i] + b2[i]));
  const lumaB = luma(rgbB);
  const rgb = lumaB < lumaMin || lumaB > lumaMax ? rgbA : rgbB;
  return [...rgb, base[3]];
}

describe("edge-smoothing shader", () => {
  const data = scene();
  // the shader sees the image with row 0 at the bottom
  const flipped = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      for (let i = 0; i < 4; i++)
        flipped[((H - 1 - y) * W + x) * 4 + i] = data[(y * W + x) * 4 + i];
  const image: TestImage = { width: W, height: H, data: flipped, filter: "linear" };
  const run = compileTestShader(`${POST_PREFIX}\n${FXAA3_SHADER}`, {
    samplers: { texture0: image },
    uniforms: {
      textureSize0: [W, H, 1 / W, 1 / H],
      targetSize: [W, H, 1 / W, 1 / H],
      shaderParam0: [0, 0, 0, 0],
    },
  });

  it("agrees with the reference at every pixel", () => {
    let worst = 0;
    let changed = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const got = run.pixel(x, H - 1 - y, W, H);
        const want = reference(data, x, y);
        got.forEach((v, i) => (worst = Math.max(worst, Math.abs(v - want[i]))));
        if (Math.abs(got[0] - data[(y * W + x) * 4]) > 1e-4) changed++;
        expect(got[3]).toBeCloseTo(data[(y * W + x) * 4 + 3], 6);
      }
    expect(worst).toBeLessThan(1e-6);
    expect(changed).toBeGreaterThan(20);
  });

  it("leaves a flat image unchanged", () => {
    const flat = new Float32Array(W * H * 4).fill(0.4);
    const flatRun = compileTestShader(`${POST_PREFIX}\n${FXAA3_SHADER}`, {
      samplers: { texture0: { width: W, height: H, data: flat, filter: "linear" } },
      uniforms: {
        textureSize0: [W, H, 1 / W, 1 / H],
        targetSize: [W, H, 1 / W, 1 / H],
        shaderParam0: [0, 0, 0, 0],
      },
    });
    for (const [x, y] of [
      [0, 0],
      [5, 7],
      [W - 1, H - 1],
    ])
      for (const v of flatRun.pixel(x, y, W, H)) expect(v).toBeCloseTo(0.4, 6);
  });
});
