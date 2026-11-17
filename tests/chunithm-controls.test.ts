import { describe, expect, test } from "vitest";
import {
  NOTE_CAMERA,
  cameraViewProjection,
} from "@lxns-network/chunithm-chart-engine/notes/camera";
import { createControls, NO_HOLD } from "@/pages/public/Chart/chunithm/runtime/controls";
import { touchHold } from "@/pages/public/Chart/chunithm/runtime/touchZones";
import { DEFAULT_KEY_BINDINGS, keyHold } from "@/pages/public/Chart/chunithm/options/keyBindings";

const lane = (index: number) => ({ lanes: 1 << index, air: false });

describe("CHUNITHM controls", () => {
  test("a lane is let go only once nothing holds it", () => {
    const held = createControls();
    expect(held.hold("key:KeyA", lane(0))).toEqual([{ lanes: 1, air: false, down: true }]);
    expect(held.hold("touch:1", lane(0))).toEqual([]);
    expect(held.hold("key:KeyA", NO_HOLD)).toEqual([]);
    expect(held.hold("touch:1", NO_HOLD)).toEqual([{ lanes: 1, air: false, down: false }]);
  });

  test("a repeated hold changes nothing", () => {
    const held = createControls();
    held.hold("key:Space", { lanes: 0, air: true });
    expect(held.hold("key:Space", { lanes: 0, air: true })).toEqual([]);
  });

  test("a touch moving across lanes presses the next lane before letting go of the last", () => {
    const held = createControls();
    held.hold("touch:1", lane(3));
    expect(held.hold("touch:1", lane(4))).toEqual([
      { lanes: 1 << 4, air: false, down: true },
      { lanes: 1 << 3, air: false, down: false },
    ]);
    expect(held.hold("touch:1", { lanes: 0, air: true })).toEqual([
      { lanes: 0, air: true, down: true },
      { lanes: 1 << 4, air: false, down: false },
    ]);
  });

  test("releasing everything lets go of every lane and the AIR sensor once", () => {
    const held = createControls();
    held.hold("key:KeyA", keyHold(DEFAULT_KEY_BINDINGS, "KeyA"));
    held.hold("touch:1", lane(15));
    held.hold("touch:2", { lanes: 0, air: true });
    expect(held.releaseAll()).toEqual([
      { lanes: 0b1000_0000_0000_0011, air: false, down: false },
      { lanes: 0, air: true, down: false },
    ]);
    expect(held.hold("touch:1", NO_HOLD)).toEqual([]);
  });
});

describe("CHUNITHM touch zones", () => {
  const width = 1600;
  const height = 900;
  const camera = cameraViewProjection(NOTE_CAMERA, width, height);
  /** Canvas fractions a field point projects to, from the canvas top left. */
  const project = (x: number, z: number) => {
    const clip = [0, 1, 3].map(
      (row) => camera[row * 4] * x + camera[row * 4 + 2] * z + camera[row * 4 + 3],
    );
    return { x: (clip[0] / clip[2] + 1) / 2, y: (1 - clip[1] / clip[2]) / 2 };
  };
  const JUDGE_DEPTH = -65;

  test("a touch on the judgment line holds the lane drawn under it", () => {
    for (let index = 0; index < 16; index++) {
      const point = project((index - 8) * 4 + 2, JUDGE_DEPTH);
      expect(touchHold(camera, point.x, point.y)).toEqual(lane(index));
    }
  });

  test("a touch further up the field follows the lanes' perspective", () => {
    const inner = project(-28 + 0.5, JUDGE_DEPTH - 20);
    expect(inner.y).toBeGreaterThan(2 / 3);
    expect(touchHold(camera, inner.x, inner.y)).toEqual(lane(1));
  });

  test("a touch beside the field holds its outer lane", () => {
    expect(touchHold(camera, 0, 0.95)).toEqual(lane(0));
    expect(touchHold(camera, 1, 0.95)).toEqual(lane(15));
  });

  test("a touch in the upper two thirds holds the AIR sensor", () => {
    expect(touchHold(camera, 0.5, 0.5)).toEqual({ lanes: 0, air: true });
  });
});
