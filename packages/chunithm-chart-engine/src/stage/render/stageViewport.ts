import type { StageCameraViewport } from "../view";

export function stageViewportRegion(
  rectangle: StageCameraViewport | undefined,
  display: readonly [number, number] | undefined,
  width: number,
  height: number,
): readonly [number, number, number, number] {
  if (!rectangle) return [0, 0, width, height];
  if (!display) throw new RangeError("Stage camera: screen viewport requires display dimensions");
  const w = rectangle.right - rectangle.left;
  const h = rectangle.bottom - rectangle.top;
  if (w < 0 || h < 0) throw new RangeError("Stage camera: inverted screen viewport");
  return [
    Math.trunc((rectangle.left * width) / display[0]),
    Math.trunc(((display[1] - rectangle.bottom) * height) / display[1]),
    Math.trunc((w * width) / display[0]),
    Math.trunc((h * height) / display[1]),
  ];
}

/** Runs one camera scope and restores the actual enclosing GL viewport, including on failure. */
export function withStageViewport<T>(
  gl: WebGL2RenderingContext,
  rectangle: StageCameraViewport | undefined,
  display: readonly [number, number] | undefined,
  draw: () => T,
): T {
  if (!rectangle) return draw();
  const previous = gl.getParameter(gl.VIEWPORT) as Int32Array;
  const [x, y, w, h] = stageViewportRegion(rectangle, display, previous[2], previous[3]);
  gl.viewport(previous[0] + x, previous[1] + y, w, h);
  try {
    return draw();
  } finally {
    gl.viewport(previous[0], previous[1], previous[2], previous[3]);
  }
}
