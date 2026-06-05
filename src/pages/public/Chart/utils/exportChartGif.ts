import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { MainRenderer, type Chart } from "@lxns-network/maimai-chart-engine";
import type { GameSettingsState } from "../stores/useGameSettingsStore";
import { msToBeats } from "../utils/timeConversion";

export type ChartExportRange = {
  startMs: number;
  endMs: number;
};

type ExportChartGifOptions = {
  chart: Chart;
  range: ChartExportRange;
  settings: Pick<
    GameSettingsState,
    | "hiSpeed"
    | "alwaysKeepHiSpeed"
    | "slideRotation"
    | "mirrorMode"
    | "judgmentLineDesign"
    | "pinkSlideStart"
    | "highlightExNotes"
    | "normalColorBreakSlide"
    | "showFireworks"
    | "showHitEffect"
  >;
  size?: number;
  fps?: number;
  onProgress?: (progress: number) => void;
};

const DEFAULT_EXPORT_SIZE = 480;
const DEFAULT_EXPORT_FPS = 20;
const EXPORT_YIELD_INTERVAL_FRAMES = 2;
const MAX_GIF_INITIAL_CAPACITY_BYTES = 32 * 1024 * 1024;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export async function exportChartGif({
  chart,
  range,
  settings,
  size = DEFAULT_EXPORT_SIZE,
  fps = DEFAULT_EXPORT_FPS,
  onProgress,
}: ExportChartGifOptions): Promise<Blob> {
  const durationMs = Math.max(0, range.endMs - range.startMs);
  if (durationMs <= 0) {
    throw new Error("导出范围为空");
  }

  const canvas = document.createElement("canvas");
  const renderer = new MainRenderer(canvas, chart.bpm);
  renderer.resizeToSize(size);
  renderer.setBpm(chart.bpm);
  renderer.setHiSpeed(settings.hiSpeed);
  renderer.setAlwaysKeepHiSpeed(settings.alwaysKeepHiSpeed);
  renderer.setPlaybackSpeed(1);
  renderer.setSlideRotation(settings.slideRotation);
  renderer.setMirrorMode(settings.mirrorMode);
  renderer.setJudgmentLineDesign(settings.judgmentLineDesign);
  renderer.setPinkSlideStart(settings.pinkSlideStart);
  renderer.setHighlightExNotes(settings.highlightExNotes);
  renderer.setNormalColorBreakSlide(settings.normalColorBreakSlide);
  renderer.setShowFireworks(settings.showFireworks);
  renderer.setShowHitEffect(settings.showHitEffect);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建导出画布");
  }

  const frameDurationMs = 1000 / fps;
  const frameCount = Math.max(1, Math.ceil(durationMs / frameDurationMs));
  const initialCapacity = Math.min(
    MAX_GIF_INITIAL_CAPACITY_BYTES,
    Math.round(size * size * 1.5 * frameCount),
  );
  const gif = GIFEncoder({ initialCapacity });

  let lastReportedPercent = -1;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const currentMs = Math.min(range.endMs, range.startMs + frameIndex * frameDurationMs);
    const currentBeats = msToBeats(currentMs, chart.bpmEvents, chart.bpm);
    renderer.renderFrame(chart, currentBeats);

    const imageData = ctx.getImageData(0, 0, size, size);
    const palette = quantize(imageData.data, 256);
    const indexedPixels = applyPalette(imageData.data, palette);
    gif.writeFrame(indexedPixels, size, size, {
      palette,
      delay: frameDurationMs,
      repeat: 0,
    });

    const percent = Math.round(((frameIndex + 1) / frameCount) * 100);
    if (percent !== lastReportedPercent) {
      lastReportedPercent = percent;
      onProgress?.((frameIndex + 1) / frameCount);
    }
    if (frameIndex % EXPORT_YIELD_INTERVAL_FRAMES === EXPORT_YIELD_INTERVAL_FRAMES - 1) {
      await yieldToBrowser();
    }
  }

  gif.finish();
  const bytes = new Uint8Array(gif.bytes());
  return new Blob([bytes], { type: "image/gif" });
}
