import { describe, expect, it } from "vitest";
import { affineToWebGL, matrixToWebGL } from "./matrices";

describe("matrix layout", () => {
  it("transposes a row-major 4x4 into WebGL column order", () => {
    const row = Float32Array.from({ length: 16 }, (_, i) => i + 1);
    expect(Array.from(matrixToWebGL(row))).toEqual([
      1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16,
    ]);
  });

  it("pads a row-major 3x4 affine into a column-major 4x4", () => {
    const affine = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(Array.from(affineToWebGL(affine))).toEqual([
      1, 5, 9, 0, 2, 6, 10, 0, 3, 7, 11, 0, 4, 8, 12, 1,
    ]);
  });

  it("refuses non-finite inputs", () => {
    expect(() => matrixToWebGL(new Float32Array(15))).toThrow(TypeError);
    expect(() => affineToWebGL([...Array(11).fill(0), Number.NaN])).toThrow(TypeError);
  });
});
