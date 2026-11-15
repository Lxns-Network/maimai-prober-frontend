import { describe, expect, it } from "vitest";
import {
  computePlacement,
  flatModelFor,
  holdTailModelFor,
  placementScale,
  placementWidth,
} from "./placement";
import { MODEL_INDICES } from "./tables";
describe("computePlacement", () => {
  it("writes a zero y and a unit y scale", () => {
    // The reference's placement writes the middle translation from a constant and the y scale from
    // the one bit pattern; neither is read from the record.
    const record = new DataView(new ArrayBuffer(356));
    record.setInt32(0x28, 3, true);
    record.setInt32(0x2c, 1, true);
    const placement = computePlacement(record, 16);
    expect(placement.y).toBe(0);
    expect(placement.sy).toBe(1);
  });
  it("scales by the width over the model's units", () => {
    // One mesh serves every width in a family, so the scale is the width divided by the set's unit
    // width — in float32, at the same two rounding points the reference uses.
    expect(placementScale(16, 16)).toBe(1);
    expect(placementScale(8, 16)).toBe(0.5);
    expect(placementScale(3, 16)).toBe(Math.fround(Math.fround(3) / Math.fround(16)));
    // A set that declares no units, or a non-positive one, falls back to one rather than dividing.
    expect(placementScale(8, null)).toBe(1);
    expect(placementScale(8, 0)).toBe(1);
    expect(placementScale(8, -4)).toBe(1);
  });
  it("reads the width in lane units, not the raw index", () => {
    // A record stores the width as a table index; the lane units come from the table. Reading the
    // index directly would move every note.
    const record = new DataView(new ArrayBuffer(356));
    record.setInt32(0x2c, 0, true);
    expect(placementWidth(record)).toBe(1);
    record.setInt32(0x2c, 15, true);
    expect(placementWidth(record)).toBe(16);
    record.setInt32(0x2c, 99, true);
    expect(placementWidth(record)).toBe(0);
  });
  it("quantises the record's own time to frames at the reference's factor", () => {
    const record = new DataView(new ArrayBuffer(356));
    record.setFloat32(8, 1000, true);
    record.setInt32(0x70, 7, true);
    const placement = computePlacement(record, 16);
    expect(placement.timeFrames).toBe(Math.fround(Math.fround(1000) * 0.05999999865889549));
    expect(placement.timelineKey).toBe(7);
  });
});
describe("flatModelFor", () => {
  it("selects the tap family, branching on the variant and the alternate flag", () => {
    // A tap picks its mesh from two object flags before indexing by width: the primary variant
    // chooses tap versus the two alternates, and the alternate flag chooses between those two.
    // Swapping any pair of these sends notes to the wrong mesh, which no other test would catch.
    expect(flatModelFor(0, 0, false, 0)).toBe(MODEL_INDICES.tap[0]);
    expect(flatModelFor(4, 0, false, 0)).toBe(MODEL_INDICES.tap[0]);
    expect(flatModelFor(0, 1, false, 0)).toBe(MODEL_INDICES.tapAlt0[0]);
    expect(flatModelFor(0, 1, true, 0)).toBe(MODEL_INDICES.tapAlt1[0]);
    expect(flatModelFor(4, 1, false, 3)).toBe(MODEL_INDICES.tapAlt0[3]);
  });
  it("keeps the mine and flick families apart", () => {
    // Mine is primary type 11 and flick is 6; a swap would draw a mine as a flick with no error.
    expect(flatModelFor(11, 0, false, 0)).toBe(MODEL_INDICES.mine[0]);
    expect(flatModelFor(6, 0, false, 0)).toBe(MODEL_INDICES.flick[0]);
    expect(MODEL_INDICES.mine).not.toEqual(MODEL_INDICES.flick);
  });
  it("takes no secondary type, so a secondary cannot suppress the primary", () => {
    // An attached AIR note is a *second* object; the primary is drawn with its own model either way.
    // The parameter's absence is what makes that structural: a port that read the secondary as a
    // veto dropped every attached note's parent from the frame, and no argument here can restore
    // that mistake.
    expect(flatModelFor.length).toBe(4);
  });
  it("declines a primary type with no flat model", () => {
    // SLIDE (2), AIR LADDER (9), AIR SOLID (10) and the EX container (12) are not flat models;
    // claiming any of them would draw the note from a mesh set that is not its own. Type 3 and 5
    // appear only as secondaries, so as primaries they select nothing either.
    for (const type of [2, 3, 5, 7, 9, 10, 12]) expect(flatModelFor(type, 0, false, 0)).toBeNull();
  });
  it("selects a hold's head by the same variant and alternate flags a tap uses", () => {
    expect(flatModelFor(1, 0, false, 0)).toBe(MODEL_INDICES.holdHead[0]);
    expect(flatModelFor(1, 1, false, 4)).toBe(MODEL_INDICES.tapAlt0[4]);
    expect(flatModelFor(1, 1, true, 4)).toBe(MODEL_INDICES.tapAlt1[4]);
  });
  it("selects a hold's tail by whether an AIR is attached", () => {
    expect(holdTailModelFor(false, 3)).toBe(MODEL_INDICES.holdTail[3]);
    expect(holdTailModelFor(true, 3)).toBe(MODEL_INDICES.holdTailAir[3]);
    expect(MODEL_INDICES.holdTail).not.toEqual(MODEL_INDICES.holdTailAir);
  });
  it("indexes the family by the width table index", () => {
    // The index is used directly (the caller has already resolved it), so the last index must reach
    // the last entry rather than clamping early.
    expect(flatModelFor(11, 0, false, 15)).toBe(MODEL_INDICES.mine[15]);
    expect(flatModelFor(6, 0, false, 15)).toBe(MODEL_INDICES.flick[15]);
  });
});
