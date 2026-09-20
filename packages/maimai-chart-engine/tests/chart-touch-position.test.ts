import { describe, expect, it } from "vitest";
import { TouchRenderer } from "../src/renderers/TouchRenderer";
import type { TouchPosition } from "../src/types";

describe("Touch positions", () => {
  it.each(["none", "horizontal", "vertical", "rotate180"])(
    "places all sensors in game coordinates with %s mirroring",
    (mirrorMode) => {
      const renderer: TouchRenderer = Object.create(TouchRenderer.prototype);
      Object.assign(renderer, {
        context: { centerX: 350, centerY: 320, radius: 300, config: { mirrorMode } },
      });
      for (const [region, distance] of Object.entries({ A: 400, B: 220, D: 410, E: 310 })) {
        for (let sensor = 1; sensor <= 8; sensor++) {
          const degrees = (sensor - 1) * 45 + (region === "A" || region === "B" ? 22.5 : 0);
          let x = Math.sin((degrees * Math.PI) / 180) * distance * (300 / 480);
          let y = -Math.cos((degrees * Math.PI) / 180) * distance * (300 / 480);
          if (mirrorMode === "horizontal" || mirrorMode === "rotate180") x = -x;
          if (mirrorMode === "vertical" || mirrorMode === "rotate180") y = -y;
          const actual = renderer.getTouchPosition((region + sensor) as TouchPosition);
          expect(actual.x).toBeCloseTo(350 + x, 8);
          expect(actual.y).toBeCloseTo(320 + y, 8);
        }
      }
      for (const center of ["C", "C1", "C2"] as const) {
        expect(renderer.getTouchPosition(center)).toEqual({ x: 350, y: 320 });
      }
    },
  );
});
