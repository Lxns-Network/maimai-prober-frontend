import { canvasBackingSize, type CanvasResolution } from "./canvasSize";

/** Defers resize allocation until a render, and coalesces fullscreen/DPR changes. */
export function createPreviewViewport(
  canvas: HTMLCanvasElement,
  initialResolution: CanvasResolution,
  immediate: () => boolean,
  requestFrame: () => void,
) {
  let resolution = initialResolution;
  let pending: { width: number; height: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const size = canvasBackingSize(
      bounds.width,
      bounds.height,
      window.devicePixelRatio || 1,
      resolution,
    );
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (canvas.width === size.width && canvas.height === size.height) {
      pending = null;
      return;
    }
    pending = size;
    if (immediate()) requestFrame();
    else
      timer = setTimeout(() => {
        timer = null;
        requestFrame();
      }, 100);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  let pixelRatioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
  const pixelRatioChanged = () => {
    pixelRatioQuery.removeEventListener("change", pixelRatioChanged);
    pixelRatioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    pixelRatioQuery.addEventListener("change", pixelRatioChanged);
    resize();
  };
  pixelRatioQuery.addEventListener("change", pixelRatioChanged);
  return {
    resize,
    selectResolution(value: CanvasResolution) {
      resolution = value;
      resize();
    },
    apply() {
      if (!pending || timer !== null) return;
      if (canvas.width !== pending.width) canvas.width = pending.width;
      if (canvas.height !== pending.height) canvas.height = pending.height;
      pending = null;
    },
    dispose() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      observer.disconnect();
      pixelRatioQuery.removeEventListener("change", pixelRatioChanged);
    },
  };
}
