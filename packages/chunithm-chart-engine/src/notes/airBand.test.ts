import { describe, expect, it } from "vitest";
import { createAirBand } from "./airBand";
import { registerImmutableScroll } from "./space";
import type { NoteTimelineScore } from "./timing";

function setup() {
  const scroll = new DataView(new ArrayBuffer(0));
  registerImmutableScroll(scroll);
  const score = { records: [], timeline: new Map(), scroll } as unknown as NoteTimelineScore;
  return { scroll, score };
}

describe("AIR band geometry against the legacy generator", () => {
  it("rejects a vertex buffer that is too small", () => {
    const { score } = setup();
    const manager = new DataView(new ArrayBuffer(0x3b0));
    manager.setFloat32(0x354, 4, true);
    manager.setFloat32(0x358, 1.5, true);
    expect(() =>
      createAirBand().writeAirBand(new DataView(new ArrayBuffer(24)), 0, {
        mode: 0,
        depthArgs: [0, 1],
        times: [1, 2],
        narrow: 0,
        generator: { i10: 0, i1c: 1, i28: 2, vMin: 0, vMax: 1, head: 0 },
        elements: [
          { width: 2, lane: 5, height: 0, flag: 0 },
          { width: 2, lane: 5, height: 10, flag: 1 },
        ],
        joints: [{ enabled: true }, { enabled: true }, { enabled: true }],
        manager,
        score,
        statics: { zeroDepth: { initialized: false } },
        x87: "extended",
      }),
    ).toThrow(RangeError);
  });
});
