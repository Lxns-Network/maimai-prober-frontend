import { describe, expect, it } from "vitest";
import { stageViewportRegion, withStageViewport } from "./stageViewport";
describe("screen camera viewport scope", () => {
  it("uses the same pixel rounding for shader dimensions and the GL viewport", () => {
    expect(
      stageViewportRegion({ left: 100, top: 50, right: 740, bottom: 410 }, [1280, 720], 641, 361),
    ).toEqual([50, 155, 320, 180]);
    expect(stageViewportRegion(undefined, undefined, 641, 361)).toEqual([0, 0, 641, 361]);
  });
  it("maps top-left display coordinates into reduced targets and restores nested scopes", () => {
    let viewport = [10, 20, 640, 360];
    const calls: number[][] = [];
    const gl = {
      VIEWPORT: 0xba2,
      getParameter: () => Int32Array.from(viewport),
      viewport: (...values: number[]) => {
        viewport = values;
        calls.push(values);
      },
    } as unknown as WebGL2RenderingContext;
    const rectangle = { left: 100, top: 50, right: 740, bottom: 410 };
    expect(() =>
      withStageViewport(gl, rectangle, [1280, 720], () => {
        expect(viewport).toEqual([60, 175, 320, 180]);
        withStageViewport(gl, rectangle, [1280, 720], () => {
          expect(viewport).toEqual([85, 252, 160, 90]);
        });
        expect(viewport).toEqual([60, 175, 320, 180]);
        throw new Error("draw failure");
      }),
    ).toThrow("draw failure");
    expect(viewport).toEqual([10, 20, 640, 360]);
    expect(calls).toHaveLength(4);
  });
});
