import { describe, expect, it } from "vitest";
import { TouchRenderer } from "../src/renderers/TouchRenderer";
import { touchSensorPoint } from "../src/utils/touchGeometry";
import type { MirrorMode, TouchPosition } from "../src/types";

const PANEL = { centerX: 350, centerY: 320, radius: 300 };

// 期望值独立于实现推导：按原始编号算坐标再翻转，实现则是先翻转编号再算坐标。
describe("Touch sensor coordinates", () => {
  it.each<MirrorMode>(["none", "horizontal", "vertical", "rotate180"])(
    "places every sensor at its measured offset with %s mirroring",
    (mirrorMode) => {
      for (const [region, distance] of Object.entries({ A: 400, B: 220, D: 410, E: 310 })) {
        for (let sensor = 1; sensor <= 8; sensor++) {
          const degrees = (sensor - 1) * 45 + (region === "A" || region === "B" ? 22.5 : 0);
          let x = Math.sin((degrees * Math.PI) / 180) * distance * (300 / 480);
          let y = -Math.cos((degrees * Math.PI) / 180) * distance * (300 / 480);
          if (mirrorMode === "horizontal" || mirrorMode === "rotate180") x = -x;
          if (mirrorMode === "vertical" || mirrorMode === "rotate180") y = -y;
          const actual = touchSensorPoint((region + sensor) as TouchPosition, {
            ...PANEL,
            mirrorMode,
          });
          expect(actual.x).toBeCloseTo(PANEL.centerX + x, 8);
          expect(actual.y).toBeCloseTo(PANEL.centerY + y, 8);
        }
      }
      for (const center of ["C", "C1", "C2"] as const) {
        expect(touchSensorPoint(center, { ...PANEL, mirrorMode })).toEqual({ x: 350, y: 320 });
      }
    },
  );

  it("feeds the renderer context into the shared geometry", () => {
    const renderer: TouchRenderer = Object.create(TouchRenderer.prototype);
    Object.assign(renderer, { context: { ...PANEL, config: { mirrorMode: "horizontal" } } });
    expect(renderer.getTouchPosition("A1")).toEqual(
      touchSensorPoint("A1", { ...PANEL, mirrorMode: "horizontal" }),
    );
  });
});
