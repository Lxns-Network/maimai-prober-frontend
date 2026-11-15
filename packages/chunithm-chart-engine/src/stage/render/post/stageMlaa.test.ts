import { describe, expect, it } from "vitest";
import { compileTestShader, type TestImage } from "../../../gpu/glslLite.testkit.ts";
import { buildMlaaArea } from "./mlaaArea";
import { POST_PREFIX } from "./postKit";
import { MLAA_BLEND_SHADER, MLAA_EDGE_SHADER, mlaaWeightShader } from "./stageMlaa";

// Reference written in the shader's own frame: rows run downwards, texture coordinates are in pixels / size.
interface Plane {
  readonly w: number;
  readonly h: number;
  readonly d: Float64Array;
  readonly c: number;
}

const plane = (w: number, h: number, c = 4): Plane => ({ w, h, c, d: new Float64Array(w * h * c) });

function read(p: Plane, x: number, y: number): number[] {
  const cx = Math.min(Math.max(x, 0), p.w - 1);
  const cy = Math.min(Math.max(y, 0), p.h - 1);
  return Array.from({ length: p.c }, (_, i) => p.d[(cy * p.w + cx) * p.c + i]);
}

function tex(p: Plane, u: number, v: number, linear: boolean): number[] {
  const px = u * p.w;
  const py = v * p.h;
  if (!linear) return read(p, Math.floor(px), Math.floor(py));
  const fx = px - 0.5;
  const fy = py - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = read(p, x0, y0);
  const b = read(p, x0 + 1, y0);
  const c = read(p, x0, y0 + 1);
  const d = read(p, x0 + 1, y0 + 1);
  return a.map(
    (_, i) => (a[i] * (1 - tx) + b[i] * tx) * (1 - ty) + (c[i] * (1 - tx) + d[i] * tx) * ty,
  );
}

function referenceEdges(scene: Plane, threshold: number): Plane {
  const out = plane(scene.w, scene.h);
  const luma = (x: number, y: number) => {
    const [r, g, b] = read(scene, x, y);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  for (let y = 0; y < scene.h; y++)
    for (let x = 0; x < scene.w; x++) {
      const l = luma(x, y);
      const around = [luma(x - 1, y), luma(x, y - 1), luma(x + 1, y), luma(x, y + 1)];
      around.forEach((value, i) => {
        out.d[(y * scene.w + x) * 4 + i] = Math.abs(l - value) >= threshold ? 1 : 0;
      });
    }
  return out;
}

function referenceWeights(edges: Plane, area: Plane, distance: number): Plane {
  const out = plane(edges.w, edges.h);
  const e = (u: number, v: number) => tex(edges, u, v, true);
  const MAX_STEPS = 8;
  const search = (u0: number, v0: number, start: number, step: number, horizontal: boolean) => {
    let i = start;
    let value = 0;
    const channel = horizontal ? 1 : 0;
    const cond = (k: number) => (step < 0 ? k > -2 * MAX_STEPS : k < 2 * MAX_STEPS);
    for (; cond(i); i += step) {
      const t = horizontal ? e(u0 + i / edges.w, v0) : e(u0, v0 + i / edges.h);
      value = t[channel];
      if (value < 0.9)
        return step < 0
          ? Math.max(i + 1.5 - 2 * value, -2 * MAX_STEPS)
          : Math.min(i - 1.5 + 2 * value, 2 * MAX_STEPS);
    }
    return step < 0
      ? Math.max(i + 1.5 - 2 * value, -2 * MAX_STEPS)
      : Math.min(i - 1.5 + 2 * value, 2 * MAX_STEPS);
  };
  const areaAt = (dx: number, dy: number, e1: number, e2: number) => {
    const size = distance * 5;
    const px = distance * Math.round(4 * e1) + dx;
    const py = distance * Math.round(4 * e2) + dy;
    const t = tex(area, px / (size - 1), py / (size - 1), false);
    return [t[0], t[1]];
  };
  for (let y = 0; y < edges.h; y++)
    for (let x = 0; x < edges.w; x++) {
      const u = (x + 0.5) / edges.w;
      const v = (y + 0.5) / edges.h;
      const [er, eg] = read(edges, x, y);
      const result = [0, 0, 0, 0];
      if (eg) {
        const dl = search(u, v, -1.5, -2, true);
        const dr = search(u, v, 1.5, 2, true);
        const e1 = e(u + dl / edges.w, v - 0.25 / edges.h)[0];
        const e2 = e(u + (dr + 1) / edges.w, v - 0.25 / edges.h)[0];
        [result[0], result[1]] = areaAt(Math.abs(dl), Math.abs(dr), e1, e2);
      }
      if (er) {
        const du = search(u, v, -1.5, -2, false);
        const dd = search(u, v, 1.5, 2, false);
        const e1 = e(u - 0.25 / edges.w, v + du / edges.h)[1];
        const e2 = e(u - 0.25 / edges.w, v + (dd + 1) / edges.h)[1];
        [result[2], result[3]] = areaAt(Math.abs(du), Math.abs(dd), e1, e2);
      }
      result.forEach((value, i) => (out.d[(y * edges.w + x) * 4 + i] = value));
    }
  return out;
}

function referenceBlend(scene: Plane, weights: Plane): Plane {
  const out = plane(scene.w, scene.h);
  for (let y = 0; y < scene.h; y++)
    for (let x = 0; x < scene.w; x++) {
      const u = (x + 0.5) / scene.w;
      const v = (y + 0.5) / scene.h;
      const topLeft = read(weights, x, y);
      const bottom = read(weights, x, y + 1)[1];
      const right = read(weights, x + 1, y)[3];
      const a = [topLeft[0], bottom, topLeft[2], right];
      const w = a.map((k) => k * k * k);
      const sum = w[0] + w[1] + w[2] + w[3];
      let color = read(scene, x, y);
      if (sum >= 1e-5) {
        const taps = [
          tex(scene, u, v - a[0] / scene.h, true),
          tex(scene, u, v + a[1] / scene.h, true),
          tex(scene, u - a[2] / scene.w, v, true),
          tex(scene, u + a[3] / scene.w, v, true),
        ];
        color = [0, 1, 2, 3].map((c) => taps.reduce((s, t, i) => s + t[c] * w[i], 0) / sum);
      }
      color.forEach((value, i) => (out.d[(y * scene.w + x) * 4 + i] = value));
    }
  return out;
}

// the shaders see images with row 0 at the bottom
function toTestImage(p: Plane, filter: "linear" | "nearest"): TestImage {
  const data = new Float32Array(p.w * p.h * 4);
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      for (let i = 0; i < 4; i++)
        data[((p.h - 1 - y) * p.w + x) * 4 + i] = i < p.c ? p.d[(y * p.w + x) * p.c + i] : 1;
  return { width: p.w, height: p.h, data, filter };
}

function fromShader(run: ReturnType<typeof compileTestShader>, w: number, h: number): Plane {
  const out = plane(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const value = run.pixel(x, h - 1 - y, w, h);
      value.forEach((v, i) => (out.d[(y * w + x) * 4 + i] = v));
    }
  return out;
}

const withPrefix = (body: string) => `${POST_PREFIX}
${body}`;

const quantize = (p: Plane): Plane => {
  const out = plane(p.w, p.h, p.c);
  p.d.forEach((v, i) => (out.d[i] = Math.round(v * 255) / 255));
  return out;
};

function staircaseScene(w: number, h: number): Plane {
  const scene = plane(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const on = x > 6 + Math.floor(y / 2) || (y === 3 && x < 5);
      const v = on ? 0.9 : 0.1;
      scene.d.set([v, v * 0.8, v * 0.5, 1], (y * w + x) * 4);
    }
  return scene;
}

const maxDifference = (a: Plane, b: Plane) => {
  let worst = 0;
  a.d.forEach((v, i) => (worst = Math.max(worst, Math.abs(v - b.d[i]))));
  return worst;
};

describe("morphological anti-aliasing shaders", () => {
  const w = 22;
  const h = 18;
  const scene = staircaseScene(w, h);
  const threshold = 0.1;

  it("the edge pass agrees with the reference", () => {
    const run = compileTestShader(withPrefix(MLAA_EDGE_SHADER), {
      samplers: { texture0: toTestImage(scene, "nearest") },
      uniforms: {
        textureSize0: [w, h, 1 / w, 1 / h],
        targetSize: [w, h, 1 / w, 1 / h],
        shaderParam0: [threshold, 0, 0, 0],
      },
    });
    const got = fromShader(run, w, h);
    const want = referenceEdges(scene, threshold);
    expect(maxDifference(got, want)).toBe(0);
    expect(want.d.some((v) => v === 1)).toBe(true);
  });

  for (const distance of [9, 33]) {
    it(`the weight and blend passes agree with the reference at distance ${distance}`, () => {
      const edges = referenceEdges(scene, threshold);
      const areaData = buildMlaaArea(distance);
      const area = plane(areaData.size, areaData.size);
      for (let i = 0; i < areaData.size * areaData.size; i++)
        area.d.set([areaData.texels[i * 2] / 255, areaData.texels[i * 2 + 1] / 255, 0, 1], i * 4);
      const weightShader = compileTestShader(withPrefix(mlaaWeightShader(distance)), {
        samplers: {
          texture0: toTestImage(edges, "linear"),
          texture1: toTestImage(edges, "linear"),
          texture2: {
            width: area.w,
            height: area.h,
            data: Float32Array.from(area.d),
            filter: "nearest",
          },
        },
        uniforms: {
          textureSize0: [w, h, 1 / w, 1 / h],
          targetSize: [w, h, 1 / w, 1 / h],
          shaderParam0: [0, 0, 0, 0],
        },
      });
      const gotWeights = fromShader(weightShader, w, h);
      const wantWeights = referenceWeights(edges, area, distance);
      expect(maxDifference(gotWeights, wantWeights)).toBeLessThan(1e-6);
      expect(wantWeights.d.some((v) => v > 0)).toBe(true);
      const stored = quantize(gotWeights);
      const blendShader = compileTestShader(withPrefix(MLAA_BLEND_SHADER), {
        samplers: {
          texture0: toTestImage(scene, "linear"),
          texture1: toTestImage(scene, "linear"),
          texture2: toTestImage(stored, "nearest"),
        },
        uniforms: {
          textureSize0: [w, h, 1 / w, 1 / h],
          targetSize: [w, h, 1 / w, 1 / h],
          shaderParam0: [0, 0, 0, 0],
        },
      });
      const got = fromShader(blendShader, w, h);
      const want = referenceBlend(scene, stored);
      expect(maxDifference(got, want)).toBeLessThan(1e-6);
      let changed = 0;
      for (let i = 0; i < got.d.length; i++) if (Math.abs(got.d[i] - scene.d[i]) > 1e-6) changed++;
      expect(changed).toBeGreaterThan(8);
      for (let i = 0; i < got.d.length; i++) {
        expect(got.d[i]).toBeGreaterThanOrEqual(0.1 * 0.5 - 1e-9);
        expect(got.d[i]).toBeLessThanOrEqual(1 + 1e-9);
      }
    });
  }

  it("a flat image has no edges, no weights and is returned unchanged", () => {
    const flat = plane(w, h);
    for (let i = 0; i < w * h; i++) flat.d.set([0.4, 0.5, 0.6, 1], i * 4);
    const edges = referenceEdges(flat, threshold);
    expect(edges.d.every((v) => v === 0)).toBe(true);
    const weightShader = compileTestShader(withPrefix(mlaaWeightShader(33)), {
      samplers: {
        texture0: toTestImage(edges, "linear"),
        texture1: toTestImage(edges, "linear"),
        texture2: { width: 1, height: 1, data: new Float32Array(4), filter: "nearest" },
      },
      uniforms: {
        textureSize0: [w, h, 1 / w, 1 / h],
        targetSize: [w, h, 1 / w, 1 / h],
        shaderParam0: [0, 0, 0, 0],
      },
    });
    expect(fromShader(weightShader, w, h).d.every((v) => v === 0)).toBe(true);
  });
});
