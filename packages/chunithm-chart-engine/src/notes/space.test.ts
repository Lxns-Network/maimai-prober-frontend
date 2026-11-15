import { describe, expect, it } from "vitest";
import { depthAt, lanePosition, registerImmutableScroll, speedAt } from "./space";

function stateView(): DataView {
  const view = new DataView(new ArrayBuffer(0x400));
  view.setFloat32(0x354, 0.8, true);
  view.setFloat32(0x358, 1.5, true);
  view.setFloat32(0x3a4, 0, true);
  view.setFloat32(0x300, 0, true);
  return view;
}

const noScroll = () => new DataView(new ArrayBuffer(0));

describe("note space", () => {
  it("lanePosition matches the two-lane-centre sequence", () => {
    // Expected values come from calling the reference `createNoteSpace(table).lanePosition`
    // directly (probe `.bench/chunithm-p3-oracle/probe-lane.mjs`), not from hand arithmetic. The lane
    // index is truncated to int32 first, so a fractional lane matches its floor.
    expect(lanePosition(0, 1)).toBe(-30);
    expect(lanePosition(3, 2)).toBe(-16);
    expect(lanePosition(3.5, 2)).toBe(-16);
    expect(lanePosition(8, 1)).toBe(2);
    expect(lanePosition(16, 1)).toBe(34);
    expect(lanePosition(2, 3)).toBe(-18);
    expect(lanePosition(0, 16)).toBe(0);
  });

  it("depthAt is exact at the origin", () => {
    // Reference `depthAt(state, 0, 1, 1, scroll)` with the same state returns -65.
    expect(depthAt(stateView(), 0, 1, 1, noScroll())).toBe(-65);
  });

  it("depthAt is sign-symmetric around the origin at zero view offset", () => {
    // Reference values for the same state: x=10 -> -77, x=-10 -> -53.
    expect(depthAt(stateView(), 10, 1, 1, noScroll())).toBe(-77);
    expect(depthAt(stateView(), -10, 1, 1, noScroll())).toBe(-53);
  });

  it("depthAt ignores the display-offset branch when its flag is clear", () => {
    const withOffset = stateView();
    withOffset.setFloat32(0x3a4, 100, true);
    expect(depthAt(withOffset, 5, 0, 1, noScroll())).toBe(
      depthAt(stateView(), 5, 0, 1, noScroll()),
    );
    expect(depthAt(withOffset, 5, 1, 1, noScroll())).not.toBe(
      depthAt(stateView(), 5, 1, 1, noScroll()),
    );
  });

  it("speedAt returns one for an empty or uncovered record set", () => {
    expect(speedAt(noScroll(), 0)).toBe(1);
    expect(speedAt(noScroll(), 1234.5)).toBe(1);
  });

  it("speedAt rejects a record set that is not a whole number of rows", () => {
    expect(() => speedAt(new DataView(new ArrayBuffer(33)), 0)).toThrow(TypeError);
  });

  it("speedAt reads a covering row and skips zero-valued ones", () => {
    const rows = new DataView(new ArrayBuffer(64));
    const row = (index: number, start: number, end: number, value: number) => {
      rows.setFloat32(index * 32 + 8, start, true);
      rows.setFloat32(index * 32 + 16, value, true);
      rows.setFloat32(index * 32 + 28, end, true);
    };
    row(0, 0, 100, 2);
    row(1, 100, 200, 0);
    expect(speedAt(rows, 50)).toBe(2);
    expect(speedAt(rows, 150)).toBe(1);
    expect(speedAt(rows, 250)).toBe(1);
  });

  it("speedAt agrees between the indexed and the scanned path", () => {
    const build = () => {
      const rows = new DataView(new ArrayBuffer(96));
      const row = (index: number, start: number, end: number, value: number) => {
        rows.setFloat32(index * 32 + 8, start, true);
        rows.setFloat32(index * 32 + 16, value, true);
        rows.setFloat32(index * 32 + 28, end, true);
      };
      row(0, 0, 100, 2);
      row(1, 100, 200, 3);
      row(2, 200, 300, 4);
      return rows;
    };
    const scannedSet = build();
    const indexedSet = build();
    registerImmutableScroll(indexedSet);
    for (const query of [-10, 0, 1, 99, 100, 150, 199, 200, 299, 300, 1000]) {
      expect(speedAt(indexedSet, query)).toBe(speedAt(scannedSet, query));
    }
  });
});
