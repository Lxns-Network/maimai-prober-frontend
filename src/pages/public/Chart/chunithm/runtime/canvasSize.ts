/** How the canvas backing is sized: after its layout, or as a fixed 16:9 frame. */
export type CanvasResolution = "auto" | "1080p" | "4k";

export const CANVAS_RESOLUTION_OPTIONS: { value: CanvasResolution; label: string }[] = [
  { value: "auto", label: "自动" },
  { value: "1080p", label: "1080P" },
  { value: "4k", label: "4K" },
];

const FIXED_BACKING = {
  "1080p": { width: 1920, height: 1080 },
  "4k": { width: 3840, height: 2160 },
};

/** A complete 16:9 backing, following layout and device pixels in automatic mode. */
export function canvasBackingSize(
  width: number,
  height: number,
  dpr: number,
  resolution: CanvasResolution = "auto",
) {
  if (resolution !== "auto") return { ...FIXED_BACKING[resolution] };
  const units = Math.max(1, Math.min(120, Math.floor(Math.min(width / 16, height / 9) * dpr)));
  return {
    width: units * 16,
    height: units * 9,
  };
}
