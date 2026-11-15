import { describe, expect, it } from "vitest";
import { extapFrame } from "./extapClock";
import { motionFrame, motionSeed } from "./motionClock";

const bits = new DataView(new ArrayBuffer(8));
const bitsOf = (value: number) => (bits.setFloat32(0, value, true), bits.getUint32(0, true));

describe("motion clock", () => {
  it("keeps the ExTAP wrapper identical to the generic clock", () => {
    for (const absolute of [216000, 216049.5, 216049, 216001.25]) {
      for (const tick of [
        { frameDelta: 0.5, paused: false },
        { frameDelta: 1, paused: true },
      ])
        expect(bitsOf(extapFrame(absolute, tick))).toBe(
          bitsOf(motionFrame({ upper: 50, loop: true }, absolute, tick)),
        );
    }
  });

  it("scales the timeline seed in float32 and rejects unsupported values", () => {
    expect(motionSeed(216000.5, 1)).toBe(216000.5);
    expect(motionSeed(216000.5, 0.4000000059604645)).toBe(
      Math.fround(216000.5 * 0.4000000059604645),
    );
    expect(() => motionSeed(NaN, 1)).toThrow(RangeError);
    expect(() =>
      motionFrame({ upper: 20, loop: true }, Infinity, { frameDelta: 0.5, paused: false }),
    ).toThrow(RangeError);
    expect(() =>
      motionFrame({ upper: -1, loop: true }, 1, { frameDelta: 0.5, paused: false }),
    ).toThrow(RangeError);
  });
});
