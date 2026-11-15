import { describe, expect, it } from "vitest";
import { stageBlendSortFlags, stageNodeBlend } from "./blend";

describe("stage node blend", () => {
  it("leaves a zero row alone", () => {
    expect(stageNodeBlend(17, 0)).toBeNull();
    expect(stageNodeBlend(49, 0)).toBeNull();
  });

  it("maps the multiply row with depth write off and test on", () => {
    expect(stageNodeBlend(17, 6)).toEqual({
      enable: 1,
      source: 1,
      destination: 3,
      operation: 1,
      alphaTest: 0,
      depthTest: 1,
      depthWrite: 0,
    });
  });

  it("maps the additive row with both depth tests off", () => {
    expect(stageNodeBlend(49, 4)).toEqual({
      enable: 1,
      source: 5,
      destination: 2,
      operation: 1,
      alphaTest: 0,
      depthTest: 0,
      depthWrite: 0,
    });
  });

  it("maps the normal row and keeps depth on without flags", () => {
    expect(stageNodeBlend(1, 3)).toEqual({
      enable: 1,
      source: 5,
      destination: 6,
      operation: 1,
      alphaTest: 0,
      depthTest: 1,
      depthWrite: 1,
    });
  });

  it("maps the alpha-tested rows with and without blending", () => {
    expect(stageNodeBlend(1, 1)).toEqual({
      enable: 0,
      source: 5,
      destination: 6,
      operation: 1,
      alphaTest: 1,
      depthTest: 1,
      depthWrite: 1,
    });
    expect(stageNodeBlend(1, 2)).toMatchObject({ enable: 1, alphaTest: 1 });
    expect(stageBlendSortFlags(stageNodeBlend(1, 1)!)).toBe(0x40);
    expect(stageBlendSortFlags(stageNodeBlend(1, 2)!)).toBe(0x60);
  });

  it("rejects rows outside the table", () => {
    expect(() => stageNodeBlend(1, 9)).toThrow(RangeError);
    expect(() => stageNodeBlend(1, -1)).toThrow(RangeError);
  });

  it("sorts blending draws as translucent", () => {
    expect(stageBlendSortFlags(stageNodeBlend(17, 6)!)).toBe(0x20);
  });
});
