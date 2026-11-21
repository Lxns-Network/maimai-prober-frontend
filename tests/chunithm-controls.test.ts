import { describe, expect, test } from "vitest";
import {
  NOTE_CAMERA,
  cameraViewProjection,
} from "@lxns-network/chunithm-chart-engine/notes/camera";
import { createControls, NO_HOLD } from "@/pages/public/Chart/chunithm/input/controls";
import {
  createTouchGestures,
  GROUND_HEIGHT,
  touchPosition,
} from "@/pages/public/Chart/chunithm/input/touchZones";
import { DEFAULT_KEY_BINDINGS, keyHold } from "@/pages/public/Chart/chunithm/input/keyboard";

describe("CHUNITHM controls", () => {
  test("each finger can strike the same lane while another finger keeps it held", () => {
    const held = createControls();
    const fingers = createTouchGestures(held);
    const point = { lane: 3, x: 0.3, laneWidth: 0.04 };
    fingers.start(1);
    fingers.start(2);
    const first = fingers.move(1, point);
    const second = fingers.move(2, point);
    expect(first).toMatchObject([{ lanes: 8, down: true }]);
    expect(second).toMatchObject([{ lanes: 8, down: true }]);
    expect(first).not.toEqual(second);
    expect(fingers.end(1)).toEqual([]);
    expect(held.snapshot().lanes).toBe(8);
    expect(fingers.end(2)).toEqual([{ lanes: 8, air: false, down: false }]);
  });

  test("a repeated hold changes nothing", () => {
    const held = createControls();
    held.hold("key:Space", { lanes: 0, air: true });
    expect(held.hold("key:Space", { lanes: 0, air: true })).toEqual([]);
  });

  test("a half-lane swipe can stay in one lane, and changing direction starts a new swipe", () => {
    const held = createControls();
    const fingers = createTouchGestures(held);
    fingers.start(1);
    const move = (x: number) => fingers.move(1, { lane: 3, x, laneWidth: 1 });
    move(0.3);
    expect(move(0.6)).toEqual([]);
    expect(move(0.45)).toEqual([]);
    expect(move(0.75)).toEqual([]);
    expect(move(0.96)).toMatchObject([{ flick: 8 }]);
  });

  test("AIR motion repeats without releasing; another finger can sustain the hold", () => {
    const held = createControls();
    const fingers = createTouchGestures(held);
    const airDown = [{ lanes: 0, air: true, down: true }];
    fingers.start(1);
    fingers.start(2);
    expect(fingers.move(1, { height: 0.49, beam: 2 })).toEqual(airDown);
    expect(fingers.move(1, { height: 0.51, beam: 3 })).toEqual([]);
    expect(fingers.move(1, { height: 0.65, beam: 3 })).toEqual(airDown);
    expect(fingers.move(1, { height: 0.65, beam: 3 })).toEqual([]);
    expect(fingers.move(1, { height: 0.3, beam: 1 })).toEqual(airDown);
    fingers.move(2, { height: 0.3, beam: 1 });
    expect(fingers.end(1)).toEqual([]);
    expect(fingers.end(2)).toEqual([{ lanes: 0, air: true, down: false }]);
  });

  test("releasing everything lets go of every lane and the AIR sensor once", () => {
    const held = createControls();
    held.hold("key:KeyA", keyHold(DEFAULT_KEY_BINDINGS, "KeyA"));
    held.hold("Space", { lanes: 0, air: true });
    expect(held.releaseAll()).toEqual([
      { lanes: 0, air: true, down: false },
      { lanes: 3, air: false, down: false },
    ]);
    expect(held.hold("Space", NO_HOLD)).toEqual([]);
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
      expect(touchPosition(camera, point.x, point.y, GROUND_HEIGHT.default)).toMatchObject({
        lane: index,
      });
    }
  });

  test("a touch further up the field follows the lanes' perspective", () => {
    const inner = project(-28 + 0.5, JUDGE_DEPTH - 20);
    expect(inner.y).toBeGreaterThan(2 / 3);
    expect(touchPosition(camera, inner.x, inner.y, GROUND_HEIGHT.max)).toMatchObject({ lane: 1 });
  });

  test("a touch beside the field holds its outer lane", () => {
    expect(touchPosition(camera, 0, 0.95, 17)).toMatchObject({ lane: 0 });
    expect(touchPosition(camera, 1, 0.95, 17)).toMatchObject({ lane: 15 });
    expect(touchPosition(camera, 1.02, 0.95, 17)).toBeNull();
  });

  test("the slider height moves the bottom of all six AIR bands", () => {
    for (const percent of [GROUND_HEIGHT.min, GROUND_HEIGHT.default, GROUND_HEIGHT.max]) {
      const boundary = 1 - percent / 100;
      for (let beam = 0; beam < 6; beam++) {
        const y = boundary - ((boundary - 0.04) * (beam + 0.5)) / 6;
        expect(touchPosition(camera, 0.5, y, percent)).toMatchObject({ beam });
      }
      expect(touchPosition(camera, 0.5, boundary, percent)).toMatchObject({ lane: 8 });
      expect(touchPosition(camera, 0.5, 0.02, percent)).toBeNull();
    }
  });
});
