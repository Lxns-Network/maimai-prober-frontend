import { MainRenderer } from "@lxns-network/maimai-chart-engine";
import type { GameSettingsState } from "../stores/useGameSettingsStore";

/** WebGL2 的着色器与曲面三角化库仅随该后端加载。 */
export async function loadChartRenderer(backend: GameSettingsState["rendererBackend"]) {
  if (backend === "webgl2") {
    const { WebGL2Renderer } = await import("@lxns-network/maimai-chart-engine/webgl");
    return WebGL2Renderer.load();
  }
  return (canvas: HTMLCanvasElement) => new MainRenderer(canvas);
}
