import { describe, expect, it } from "vitest";
import { promoteExNotes } from "./promoteEx";

const RESOLUTION = 384;
function note(type: number, offset: number, lane: number, widthIdx: number, ex = 0, direction = 0) {
  const v = new DataView(new ArrayBuffer(0x164));
  v.setFloat32(4, offset, true);
  v.setInt32(0x10, type, true);
  v.setInt32(0x28, lane, true);
  v.setInt32(0x2c, widthIdx, true);
  v.setInt32(0x88, direction, true);
  v.setUint8(0x8c, ex);
  return v;
}
const width = (idx: number) => idx;

describe("promoteExNotes", () => {
  it("turns a tap covered by an EX tap on the same tick into an EX tap with its direction", () => {
    const ex = note(4, 1, 2, 4, 0, 5);
    const tap = note(0, 1, 3, 2);
    promoteExNotes([ex, tap], RESOLUTION, width);
    expect(tap.getInt32(0x10, true)).toBe(4);
    expect(tap.getInt32(0x88, true)).toBe(5);
  });

  it("flags a hold or slide covered by an EX hold as EX", () => {
    const exHold = note(1, 1, 0, 8, 1, 3);
    const hold = note(1, 1, 2, 2);
    const slide = note(2, 1, 4, 4);
    promoteExNotes([exHold, hold, slide], RESOLUTION, width);
    expect(hold.getUint8(0x8c)).toBe(1);
    expect(slide.getUint8(0x8c)).toBe(1);
    expect(slide.getInt32(0x88, true)).toBe(3);
  });

  it("takes the direction of the first covered lane", () => {
    const left = note(4, 1, 0, 2, 0, 1);
    const right = note(4, 1, 2, 2, 0, 6);
    const tap = note(0, 1, 1, 2);
    promoteExNotes([left, right, tap], RESOLUTION, width);
    expect(tap.getInt32(0x88, true)).toBe(1);
  });

  it("leaves notes alone when a lane or the tick is not covered", () => {
    const ex = note(4, 1, 0, 2, 0, 1);
    const wider = note(0, 1, 0, 3);
    const later = note(0, 1.5, 0, 2);
    const air = note(6, 1, 0, 2);
    promoteExNotes([ex, wider, later, air], RESOLUTION, width);
    expect(wider.getInt32(0x10, true)).toBe(0);
    expect(later.getInt32(0x10, true)).toBe(0);
    expect(air.getInt32(0x10, true)).toBe(6);
    expect(air.getUint8(0x8c)).toBe(0);
  });

  it("ignores non-EX holds as sources", () => {
    const hold = note(1, 1, 0, 4, 0, 2);
    const tap = note(0, 1, 0, 4);
    promoteExNotes([hold, tap], RESOLUTION, width);
    expect(tap.getInt32(0x10, true)).toBe(0);
  });
});
