import { describe, expect, it } from "vitest";
import { sampleCurve } from "./animation";
const curve = (frames: number[], values: number[], modes: number[], tangents: number[]) => ({
  kind: 0 as const,
  frames: Int32Array.from(frames),
  modes: Uint8Array.from(modes),
  values: Float32Array.from(values),
  tangents: Float32Array.from(tangents),
});
describe("animation curves", () => {
  it("returns each key's value at its frame, holds under mode 2 and ends on the last key", () => {
    const c = curve([0, 4, 10], [1, 3, -2], [0, 2, 0], [0, 0, 0]);
    expect(sampleCurve(c, 0)).toBe(1);
    expect(sampleCurve(c, 4)).toBe(3);
    expect(sampleCurve(c, 7)).toBe(3);
    expect(sampleCurve(c, 10)).toBe(-2);
    expect(sampleCurve(c, 50)).toBe(-2);
  });
  it("follows the Hermite form between keys with zero tangents and rejects a sample before the first key", () => {
    const c = curve([2, 6], [0, 8], [0, 0], [0, 0]);
    expect(sampleCurve(c, 4)).toBe(4);
    expect(() => sampleCurve(c, 1)).toThrow(RangeError);
  });
  it("uses the native unnormalized frame distance under mode 3", () => {
    const c = curve([0, 10], [0, 10], [3, 0], [0, 0]);
    expect(sampleCurve(c, 2.5)).toBe(-65);
  });
});
