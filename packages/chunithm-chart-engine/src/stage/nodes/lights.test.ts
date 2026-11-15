import { describe, expect, it } from "vitest";
import {
  lightColor,
  lightReachesGroup,
  lightingForGroup,
  pointFalloffScale,
  stageFogHeight,
  stageFogRange,
} from "./lights";
const bits = (values: readonly number[]) => {
  const view = new DataView(new ArrayBuffer(values.length * 4));
  values.forEach((value, i) => view.setFloat32(i * 4, value, true));
  return Array.from({ length: values.length }, (_, i) => view.getUint32(i * 4, true));
};
describe("stage fog", () => {
  it("builds the distance ramp bit for bit", () => {
    expect(bits(stageFogRange(2, 0, 800, Math.fround(0.25), Math.fround(0.95)))).toEqual([
      1145569280, 979722305, 1061158912, 1028443344,
    ]);
  });
  it("measures the ramp from the near distance", () => {
    const [end, slope] = stageFogRange(2, 60, 100, Math.fround(0.1), Math.fround(0.8));
    expect(end).toBe(100);
    const high = Math.fround(1 - Math.fround(0.1));
    const low = Math.fround(1 - Math.fround(0.8));
    expect(slope).toBe(Math.fround(Math.fround(high - low) / 40));
  });
  it("builds the normal ramp as one over the span", () => {
    expect(stageFogRange(1, 5000, 8000, Math.fround(0.2), Math.fround(0.8))).toEqual([
      8000,
      Math.fround(1 / 3000),
      Math.fround(0.8),
      Math.fround(1 - Math.fround(0.8)),
    ]);
  });
  it("keeps a degenerate span from dividing by zero", () => {
    expect(stageFogRange(1, 10, 10, 0, 0)[1]).toBe(Math.fround(1 / Math.fround(0.001)));
    expect(stageFogRange(1, 0, 15000, 0, 0)[1]).toBe(Math.fround(1 / 15000));
  });
  it("uses the unscaled distance slope for height fog", () => {
    expect(stageFogRange(3, 60, 100, Math.fround(0.1), Math.fround(0.8))).toEqual([
      100,
      Math.fround(1 / 40),
      Math.fround(1 - Math.fround(0.1)),
      Math.fround(1 - Math.fround(0.8)),
    ]);
    expect(stageFogRange(3, 100, 60, 0, 0)[1]).toBe(Math.fround(-1 / 40));
    expect(stageFogRange(3, 0.0005, 0, 0, 0)[1]).toBe(Math.fround(1 / Math.fround(0.001)));
  });
  it("builds the height limits and distance ramp, including reversed and near-zero spans", () => {
    expect(stageFogHeight(10, -10, 50, 150)).toEqual([10, -10, 150, Math.fround(1 / 100)]);
    expect(stageFogHeight(-10, 10, 150, 50)).toEqual([-10, 10, 50, Math.fround(-1 / 100)]);
    expect(stageFogHeight(1, 1, 0, 0)).toEqual([1, 1, 0, Math.fround(1 / Math.fround(0.001))]);
    expect(stageFogHeight(1, 1, 0.0005, 0)[3]).toBe(Math.fround(1 / Math.fround(0.001)));
  });
  it("reads an opaque black colour as zero", () => {
    expect(lightColor(0xff000000)).toEqual([0, 0, 0]);
  });
});
describe("stage point light", () => {
  it("scales the falloff by the span from its start to its end", () => {
    expect(pointFalloffScale(10, 20)).toBe(Math.fround(0.1));
    expect(pointFalloffScale(30, 20)).toBe(3.4028234663852886e38);
    expect(pointFalloffScale(20, 20)).toBe(3.4028234663852886e38);
  });
});
describe("stage light groups", () => {
  it("reaches a group through its own bit only", () => {
    expect(lightReachesGroup(0x84, 2)).toBe(true);
    expect(lightReachesGroup(0x84, 7)).toBe(true);
    expect(lightReachesGroup(0x84, 0)).toBe(false);
    expect(lightReachesGroup(0xffffffff, 31)).toBe(false);
    expect(lightReachesGroup(0x3ff, 33)).toBe(true);
  });
  it("gives each group the lights whose mask holds its bit, in the order listed", () => {
    const lighting = {
      lights: [
        { kind: "ambient" as const, mask: 0x2, color: [1, 1, 1] },
        {
          kind: "parallel" as const,
          mask: 0x3,
          direction: [0, 0, 1],
          diffuse: [1, 1, 1, 1],
          specular: [1, 1, 1, 1],
        },
        {
          kind: "parallel" as const,
          mask: 0x1,
          direction: [0, 1, 0],
          diffuse: [2, 2, 2, 1],
          specular: [0, 0, 0, 1],
        },
      ],
    };
    const zero = lightingForGroup(lighting, 0);
    expect(zero.ambient).toBeNull();
    expect(zero.parallel.map((l) => l.direction)).toEqual([
      [0, 0, 1],
      [0, 1, 0],
    ]);
    const one = lightingForGroup(lighting, 1);
    expect(one.ambient).toEqual([1, 1, 1]);
    expect(one.parallel).toHaveLength(1);
    expect(lightingForGroup(lighting, 2).parallel).toHaveLength(0);
  });
  it("counts ambient and hemisphere lights separately after group filtering", () => {
    const lighting = {
      lights: [
        { kind: "ambient" as const, mask: 1, color: [1, 0, 0] },
        { kind: "ambient" as const, mask: 2, color: [2, 0, 0] },
        { kind: "ambient" as const, mask: 1, color: [3, 0, 0] },
        { kind: "ambient" as const, mask: 1, color: [4, 0, 0] },
        {
          kind: "hemisphere" as const,
          mask: 3,
          direction: [0, 1, 0],
          sky: [1, 1, 1],
          ground: [0, 0, 0],
        },
        {
          kind: "hemisphere" as const,
          mask: 1,
          direction: [0, -1, 0],
          sky: [1, 1, 1],
          ground: [0, 0, 0],
        },
      ],
    };
    const zero = lightingForGroup(lighting, 0);
    expect(zero.ambient).toEqual([4, 0, 0]);
    expect(zero.hemisphere).toBeNull();
    const one = lightingForGroup(lighting, 1);
    expect(one.ambient).toEqual([2, 0, 0]);
    expect(one.hemisphere?.direction).toEqual([0, 1, 0]);
    expect(lightingForGroup(lighting, 2)).toMatchObject({ ambient: null, hemisphere: null });
  });
});
