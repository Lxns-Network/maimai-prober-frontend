import { describe, expect, it } from "vitest";
import { secondsForStep, stepForSeconds, STEPS_PER_SECOND } from "./audioClock";

describe("stepForSeconds", () => {
  it("floors onto the 120 Hz grid", () => {
    expect(stepForSeconds(0)).toBe(0);
    expect(stepForSeconds(1)).toBe(STEPS_PER_SECOND);
    // Anything strictly inside a step belongs to the step that opened before it.
    expect(stepForSeconds(1 / 120 - 1e-9)).toBe(0);
    expect(stepForSeconds(1 / 120)).toBe(1);
  });

  it("keeps every exact grid boundary on its own step", () => {
    for (let step = 0; step < 200_000; step++) {
      const actual = stepForSeconds(secondsForStep(step));
      if (actual !== step) throw new Error(`Grid boundary ${step} became ${actual}`);
    }
  });

  it("does not advance a representable time immediately before a boundary", () => {
    const bytes = new DataView(new ArrayBuffer(8));
    for (let step = 1; step < 200_000; step++) {
      bytes.setFloat64(0, secondsForStep(step));
      bytes.setBigUint64(0, bytes.getBigUint64(0) - 1n);
      const actual = stepForSeconds(bytes.getFloat64(0));
      if (actual !== step - 1) throw new Error(`Time before ${step} became ${actual}`);
    }
  });

  it("clamps a negative or non-finite time to step zero", () => {
    for (const bad of [-1, -0.001, Number.NaN, Number.POSITIVE_INFINITY])
      expect(stepForSeconds(bad)).toBe(0);
  });

  it("round-trips a step back to its time", () => {
    for (const step of [0, 1, 240, 21_511]) expect(stepForSeconds(secondsForStep(step))).toBe(step);
  });
});
