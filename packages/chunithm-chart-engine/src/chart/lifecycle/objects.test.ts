import { describe, expect, it } from "vitest";
import { noteObjects } from "./objects";
function record(primary: number, secondary: number): DataView {
  const view = new DataView(new ArrayBuffer(0x164));
  view.setInt32(0x10, primary, true);
  view.setInt32(0x14, secondary, true);
  return view;
}
describe("noteObjects", () => {
  it("orders objects by spawn step, then record, with a record's secondary object first", () => {
    const records = [record(0, -1), record(6, 3), record(12, -1), record(1, 5), record(9, -1)];
    const objects = noteObjects(records, Int32Array.of(4, 2, 2, 2, -1));
    expect(
      objects.map(({ record: r, className, slot, spawn }) => [r, className, slot, spawn]),
    ).toEqual([
      [1, "AirNote", 9, 2],
      [1, "FlickNote", 8, 2],
      [3, "AirHoldNote", 9, 2],
      [3, "HoldNote", 8, 2],
      [0, "TapNote", 8, 4],
    ]);
    expect(objects.map((o) => o.order)).toEqual([0, 1, 2, 3, 4]);
  });
  it("builds no secondary object without a primary route", () => {
    expect(noteObjects([record(12, 3)], Int32Array.of(0))).toEqual([]);
  });
});
