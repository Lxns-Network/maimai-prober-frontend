import { describe, expect, it } from "vitest";
import { modelFlagsOf } from "./modelFlags";

const record = (over: {
  type?: number;
  marker?: number;
  beat?: number;
  group?: number;
  lane?: number;
  width?: number;
}) => {
  const view = new DataView(new ArrayBuffer(356));
  view.setInt32(16, over.type ?? 0, true);
  view.setUint8(0x8c, over.marker ?? 0);
  view.setFloat32(0, over.group ?? 0, true);
  view.setFloat32(4, over.beat ?? 0, true);
  view.setInt32(40, over.lane ?? 0, true);
  view.setInt32(44, over.width ?? 0, true);
  return view;
};

describe("modelFlagsOf", () => {
  it("leaves a plain tap on the plain family", () => {
    const { variant, alternate } = modelFlagsOf([record({ type: 0, marker: 1 })]);
    expect([variant[0], alternate[0]]).toEqual([0, 0]);
  });

  it("marks a character tap, and a hold or slide head only when the marker byte is set", () => {
    const { variant } = modelFlagsOf([
      record({ type: 4 }),
      record({ type: 1, marker: 1 }),
      record({ type: 2, marker: 0 }),
      record({ type: 6, marker: 1 }),
    ]);
    expect([...variant]).toEqual([1, 1, 0, 0]);
  });

  it("sets the alternate flag on the later records at one beat, lane and width", () => {
    const first = record({ type: 4, beat: 1, lane: 2, width: 3 });
    const same = record({ type: 4, beat: 1, lane: 2, width: 3 });
    const otherLane = record({ type: 4, beat: 1, lane: 5, width: 3 });
    const { alternate } = modelFlagsOf([first, same, otherLane]);
    expect([...alternate]).toEqual([0, 1, 0]);
  });

  it("counts every variant record toward a position, not only the character taps", () => {
    const head = record({ type: 1, marker: 1, beat: 2, lane: 0, width: 1 });
    const tap = record({ type: 4, beat: 2, lane: 0, width: 1 });
    const { alternate } = modelFlagsOf([head, tap]);
    expect([...alternate]).toEqual([0, 1]);
  });
});
