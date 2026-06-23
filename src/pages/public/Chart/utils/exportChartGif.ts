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
  beatsPerMeasure: number;
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
  video?: {
    url: string;
    leadInMs: number;
    musicOffset: number;
  };
};

const DEFAULT_EXPORT_SIZE = 480;
const DEFAULT_EXPORT_FPS = 20;
const EXPORT_YIELD_INTERVAL_FRAMES = 2;
const MAX_GIF_INITIAL_CAPACITY_BYTES = 32 * 1024 * 1024;

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function loadExportVideo(url: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    const cleanup = () => {
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => {
      cleanup();
      resolve(video);
    };
    const onError = () => {
      cleanup();
      resolve(null);
    };
    video.addEventListener("loadeddata", onLoaded);
    video.addEventListener("error", onError);
    video.src = url;
    video.load();
  });
}

function seekExportVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", finish);
      resolve();
    };
    video.addEventListener("seeked", finish);
    video.currentTime = time;
    window.setTimeout(finish, 1000);
  });
}

export async function exportChartGif({
  chart,
  range,
  beatsPerMeasure,
  settings,
  size = DEFAULT_EXPORT_SIZE,
  fps = DEFAULT_EXPORT_FPS,
  onProgress,
  video: videoOption,
}: ExportChartGifOptions): Promise<Blob> {
  const durationMs = Math.max(0, range.endMs - range.startMs);
  if (durationMs <= 0) {
    throw new Error("导出范围为空");
  }

  const bgVideo = videoOption ? await loadExportVideo(videoOption.url) : null;

  const canvas = document.createElement("canvas");
  const renderer = new MainRenderer(canvas);
  renderer.resizeToSize(size);
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

    if (bgVideo && videoOption) {
      const videoTime = (currentMs - videoOption.leadInMs - videoOption.musicOffset) / 1000;
      const dur = bgVideo.duration;
      if (videoTime > 0 && (!Number.isFinite(dur) || videoTime < dur)) {
        await seekExportVideo(bgVideo, videoTime);
        renderer.setBackgroundVideo(bgVideo);
      } else {
        renderer.setBackgroundVideo(null);
      }
    }

    renderer.renderFrame(chart, currentBeats, beatsPerMeasure);

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

  if (bgVideo) {
    bgVideo.removeAttribute("src");
    bgVideo.load();
  }

  gif.finish();
  const bytes = new Uint8Array(gif.bytes());
  return new Blob([bytes], { type: "image/gif" });
}
