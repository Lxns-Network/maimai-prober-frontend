import { describe, expect, it } from "vitest";
import { lookAt, multiply } from "../stage/camera/math";
import { evaluatePlayCamera } from "./camera";
import { ENV, STATES, baseInput, baseSettings, floatWord } from "./camera.testkit";

describe("evaluatePlayCamera", () => {
  it("returns single-precision matrices and vectors for a canvas", () => {
    const view = evaluatePlayCamera(baseInput(), 1920, 1080);
    expect(view.viewport).toEqual({ width: 1920, height: 1080 });
    for (const m of [view.view, view.projection, view.viewProjection]) {
      expect(m).toBeInstanceOf(Float32Array);
      expect(m).toHaveLength(16);
    }
    expect(view.eye).toHaveLength(3);
    expect(view.up).toHaveLength(3);
    expect(view.eye).toEqual([0, 57, 44]);
  });

  it("composes the view-projection as projection times view", () => {
    const view = evaluatePlayCamera(baseInput(), 1280, 720);
    expect(Array.from(view.viewProjection)).toEqual(
      Array.from(multiply(view.projection, view.view, ENV)),
    );
  });

  it("offsets the eye by the world translation unless the node disables it", () => {
    const offset = evaluatePlayCamera(baseInput({ world: [1, 2, 3] }), 1920, 1080);
    expect(offset.eye).toEqual([1, 59, 47]);

    const settings = baseSettings();
    settings[0x2c >> 2] = 1;
    const detached = evaluatePlayCamera(
      baseInput({ world: [1, 2, 3], resource: { settings, states: STATES } }),
      1920,
      1080,
    );
    expect(detached.eye).toEqual([0, 57, 44]);
  });

  it("selects the state by id", () => {
    const view = evaluatePlayCamera(baseInput({ state: 101 }), 1920, 1080);
    expect(view.eye).toEqual(STATES[1].position);
  });

  it("changes the view but not the reported up vector when the node rolls", () => {
    const plain = evaluatePlayCamera(baseInput(), 1920, 1080);
    const settings = baseSettings();
    settings[0] = floatWord(90);
    const rolled = evaluatePlayCamera(
      baseInput({ resource: { settings, states: STATES } }),
      1920,
      1080,
    );
    expect(rolled.up).toEqual(plain.up);
    expect(Array.from(rolled.view)).not.toEqual(Array.from(plain.view));
    const incoming = rolled.stageEnvironment;
    expect(incoming.rollCode).toBe(0);
    expect(Array.from(lookAt(incoming.eye, incoming.target, incoming.up, ENV))).toEqual(
      Array.from(rolled.view),
    );
  });

  it("scales the projection with the canvas aspect ratio", () => {
    const wide = evaluatePlayCamera(baseInput(), 1920, 1080);
    const tall = evaluatePlayCamera(baseInput(), 1080, 1920);
    expect(wide.projection[0]).not.toBe(tall.projection[0]);
  });

  it("rejects canvas sizes that are not positive 31-bit integers", () => {
    for (const [w, h] of [
      [0, 1080],
      [1920, -1],
      [1.5, 1080],
      [NaN, 1080],
      [1920, 2 ** 31],
    ])
      expect(() => evaluatePlayCamera(baseInput(), w, h)).toThrow(RangeError);
  });

  it("rejects settings it cannot evaluate", () => {
    const short = { settings: baseSettings().slice(0, 22), states: STATES };
    expect(() => evaluatePlayCamera(baseInput({ resource: short }), 1920, 1080)).toThrow(
      RangeError,
    );

    const relative = baseSettings();
    relative[1] = 1;
    expect(() =>
      evaluatePlayCamera(
        baseInput({ resource: { settings: relative, states: STATES } }),
        1920,
        1080,
      ),
    ).toThrow();

    const referenced = baseSettings();
    referenced[0x44 >> 2] = 0;
    expect(() =>
      evaluatePlayCamera(
        baseInput({ resource: { settings: referenced, states: STATES } }),
        1920,
        1080,
      ),
    ).toThrow();

    const orthographic = baseSettings();
    orthographic[0x08 >> 2] = 1;
    expect(() =>
      evaluatePlayCamera(
        baseInput({ resource: { settings: orthographic, states: STATES } }),
        1920,
        1080,
      ),
    ).toThrow();
  });

  it("rejects an unknown state and an environment outside the supported control words", () => {
    expect(() => evaluatePlayCamera(baseInput({ state: 9 }), 1920, 1080)).toThrow(RangeError);
    expect(() =>
      evaluatePlayCamera(baseInput({ environment: { fpcw: 0x037f, mxcsr: 0x1f81 } }), 1920, 1080),
    ).toThrow();
    expect(() =>
      evaluatePlayCamera(baseInput({ environment: { fpcw: 0x0c7f, mxcsr: 0x1f80 } }), 1920, 1080),
    ).toThrow();
  });
});
