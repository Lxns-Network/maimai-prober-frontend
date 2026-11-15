import { describe, expect, it } from "vitest";
import { buildMlaaArea } from "./mlaaArea";
import { MLAA_DISTANCES } from "../../nodes/mlaa";

const texel = (
  area: ReturnType<typeof buildMlaaArea>,
  tile: number,
  k: number,
  y: number,
  x: number,
) => {
  const at = ((Math.floor(k / 5) * tile + y) * area.size + (k % 5) * tile + x) * 2;
  return [area.texels[at], area.texels[at + 1]];
};

describe("morphological anti-aliasing area lookup", () => {
  it("is a 5x5 grid of tiles one texel wider than the distance", () => {
    for (const distance of MLAA_DISTANCES) {
      const area = buildMlaaArea(distance);
      expect(area.size).toBe((distance + 1) * 5);
      expect(area.texels).toHaveLength(area.size * area.size * 2);
    }
  });

  it("the tiles without crossing edges are empty and every value is at most a half", () => {
    const distance = 33;
    const tile = distance + 1;
    const area = buildMlaaArea(distance);
    for (const k of [0, 2, 4, 7, 10, 11, 12, 13, 14, 17, 20, 22, 24])
      for (let y = 0; y < tile; y++)
        for (let x = 0; x < tile; x++) expect(texel(area, tile, k, y, x)).toEqual([0, 0]);
    expect(Math.max(...area.texels)).toBeLessThanOrEqual(127);
  });

  it("follows the closed form along the first row of a tile", () => {
    const tile = 34;
    const area = buildMlaaArea(33);
    expect(texel(area, tile, 5, 0, 0)).toEqual([0, 32]);
    for (let j = 1; j < tile; j++)
      expect(texel(area, tile, 5, 0, j)[1]).toBe(
        Math.trunc(Math.fround(((0.5 * j) / (j + 1)) * 255 + 0.5)),
      );
    expect(texel(area, tile, 15, 0, 3)).toEqual([96, 0]);
  });

  it("each tile is the transpose-sum of the same triangular table", () => {
    const tile = 10;
    const area = buildMlaaArea(9);
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        const [, a] = texel(area, tile, 6, y, x);
        const [, b] = texel(area, tile, 5, y, x);
        const [, c] = texel(area, tile, 5, x, y);
        expect(a).toBeLessThanOrEqual(b + c + 1);
        expect(a).toBeGreaterThanOrEqual(b + c - 1);
      }
  });

  it("no value sits so close to a rounding boundary that a reciprocal approximation could move it", () => {
    for (const distance of MLAA_DISTANCES) {
      const tile = distance + 1;
      const f = Math.fround;
      const near = (v: number) => {
        const x = v * 255 + 0.5;
        const frac = x - Math.floor(x);
        return frac < 2e-4 || frac > 1 - 2e-4;
      };
      for (let i = 0; i < tile; i++) {
        expect(near(f(0.125 / (2 * i + 1)))).toBe(false);
        for (let j = i + 1; j < tile; j++)
          expect(
            near(
              i === 0
                ? f(f(f(f(j - 1) * 0.25) / (j + 1)) + 0.25)
                : f(f(f(2 * (j - i)) * 0.25) * f(1 / (j + i + 1))),
            ),
          ).toBe(false);
      }
    }
  });
});
