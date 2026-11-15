import { throwIfAborted } from "@lxns-network/chunithm-chart-engine/assets/abort";
import type { LoopRange } from "./types";

/** Renders into the session canvas; the caller suspends playback and restores its frame afterward. */
export async function exportPreviewGif(
  canvas: HTMLCanvasElement,
  range: LoopRange,
  playbackRate: number,
  signal: AbortSignal,
  progress: (value: number) => void,
  draw: (seconds: number) => void,
): Promise<Blob> {
  const output = document.createElement("canvas");
  output.width = 640;
  output.height = 360;
  const ctx = output.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("无法创建导出画布");
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const encoder = GIFEncoder();
  const count = Math.ceil(((range.end - range.start) * 20) / playbackRate);
  for (let index = 0; index < count; index++) {
    throwIfAborted(signal);
    draw(range.start + (index / 20) * playbackRate);
    ctx.drawImage(canvas, 0, 0, output.width, output.height);
    const pixels = ctx.getImageData(0, 0, output.width, output.height).data;
    const palette = quantize(pixels, 256);
    encoder.writeFrame(applyPalette(pixels, palette), output.width, output.height, {
      palette,
      delay: 50,
      repeat: 0,
    });
    progress(Math.round(((index + 1) / count) * 100));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  throwIfAborted(signal);
  encoder.finish();
  return new Blob([new Uint8Array(encoder.bytes())], { type: "image/gif" });
}
