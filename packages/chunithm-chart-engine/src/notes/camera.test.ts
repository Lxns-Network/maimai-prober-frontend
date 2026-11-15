import { describe, expect, it } from "vitest";
import { NOTE_CAMERA, cameraViewProjection } from "./camera";
const bitsOf = (value: number) => {
  const b = new DataView(new ArrayBuffer(4));
  b.setFloat32(0, value, true);
  return b.getUint32(0, true);
};
describe("cameraViewProjection", () => {
  it("returns the template unchanged for a square canvas", () => {
    const got = cameraViewProjection(NOTE_CAMERA, 1024, 1024);
    for (let i = 0; i < 16; i++)
      expect(bitsOf(got[i])).toBe(bitsOf(Math.fround(NOTE_CAMERA.base[i])));
  });
  it("scales only the aspect entry for a wide canvas", () => {
    // The reference adjusts one entry — the x scale — when the canvas is wider than tall. Every
    // other entry must be untouched, or the camera would also move or tilt with the window.
    const wide = cameraViewProjection(NOTE_CAMERA, 1280, 720);
    const square = cameraViewProjection(NOTE_CAMERA, 1024, 1024);
    for (let i = 0; i < 16; i++) {
      if (i === NOTE_CAMERA.aspectEntry) continue;
      expect({ i, value: bitsOf(wide[i]) }).toEqual({ i, value: bitsOf(square[i]) });
    }
    expect(bitsOf(wide[NOTE_CAMERA.aspectEntry])).not.toBe(bitsOf(square[NOTE_CAMERA.aspectEntry]));
  });
  it("leaves a portrait canvas on the square form", () => {
    // The reference tests the ratio, not either dimension: a taller-than-wide viewport does not
    // stretch the camera.
    const portrait = cameraViewProjection(NOTE_CAMERA, 600, 900);
    const square = cameraViewProjection(NOTE_CAMERA, 1024, 1024);
    expect([...portrait]).toEqual([...square]);
  });
  it("writes into a caller's matrix when given one", () => {
    // The frame path may not allocate, so the caller supplies the destination.
    const out = new Float32Array(16);
    const returned = cameraViewProjection(NOTE_CAMERA, 1280, 720, out);
    expect(returned).toBe(out);
    expect(bitsOf(out[0])).toBe(bitsOf(cameraViewProjection(NOTE_CAMERA, 1280, 720)[0]));
  });
  it("rejects a size that is not positive and finite", () => {
    for (const [w, h] of [
      [0, 100],
      [100, 0],
      [-1, 100],
      [NaN, 100],
      [100, Infinity],
    ] as const)
      expect(() => cameraViewProjection(NOTE_CAMERA, w, h)).toThrow(/positive and finite/);
  });
  it("rejects a destination that is not sixteen floats", () => {
    expect(() => cameraViewProjection(NOTE_CAMERA, 100, 100, new Float32Array(12))).toThrow(
      /sixteen floats/,
    );
  });
});
describe("the camera template's own invariants", () => {
  it("stores every base entry as an exact float32", () => {
    // The template is written into a Float32Array, so an entry that is not already exact would be
    // rounded on the way in — and the rounding would then happen at a different point than the
    // reference's. Every literal is exact today, which is what makes the store a copy rather than a
    // conversion; this pins that so a future hand-edit of the table cannot change the matrix
    // silently.
    const inexact = NOTE_CAMERA.base
      .map((v, i) => ({ i, v }))
      .filter(({ v }) => Math.fround(v) !== v);
    expect(inexact).toEqual([]);
  });
  it("names a real matrix entry as the aspect entry", () => {
    expect(NOTE_CAMERA.aspectEntry).toBeGreaterThanOrEqual(0);
    expect(NOTE_CAMERA.aspectEntry).toBeLessThan(16);
    expect(NOTE_CAMERA.base.length).toBe(16);
  });
});
