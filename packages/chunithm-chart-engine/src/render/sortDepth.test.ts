import { describe, expect, it } from "vitest";
import { createSortDepthCamera } from "./sortDepth";

const ENV = { fpcw: 0x027f, mxcsr: 0x1f80 };

const identity4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

describe("sort depth", () => {
  it("refuses malformed inputs and environments like the reference", () => {
    expect(() =>
      createSortDepthCamera(identity4(), identity4(), { fpcw: 0x1234, mxcsr: 0x1f80 }),
    ).toThrow(RangeError);
    expect(() => createSortDepthCamera(identity4(), identity4(), { fpcw: 0x7f, mxcsr: 0 })).toThrow(
      RangeError,
    );
    for (const fpcw of [0x007f, 0x027f, 0x037f])
      expect(() =>
        createSortDepthCamera(identity4(), identity4(), { fpcw, mxcsr: 0x1f80 }),
      ).not.toThrow();
    expect(() => createSortDepthCamera(identity4().slice(1), identity4(), ENV)).toThrow(RangeError);
    const camera = createSortDepthCamera(identity4(), identity4(), ENV);
    expect(() => camera.model(new Array(11).fill(1), 0)).toThrow(RangeError);
    expect(() => camera.primitive([1, 2], 0)).toThrow(RangeError);
    expect(() => camera.model(new Array(12).fill(1), 0.1)).toThrow(RangeError);
    expect(() => camera.model(new Array(12).fill(1), NaN)).toThrow(RangeError);
  });
});
