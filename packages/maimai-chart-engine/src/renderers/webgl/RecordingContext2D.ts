import { createSpriteCanvas, type ChartDrawingContext } from "../BaseRenderer";
import { ChartPath } from "./ChartPath";
import {
  flattenArc,
  flattenArcTo,
  flattenQuadratic,
  strokeOutline,
  triangulateFill,
  type FlatSubpath,
  type Vec2,
} from "./triangulate";

type Rgba = [number, number, number, number];
interface GradientStop {
  offset: number;
  color: Rgba;
}
type Paint =
  | { kind: "solid"; color: Rgba }
  | { kind: "linear"; x0: number; y0: number; x1: number; y1: number; stops: GradientStop[] }
  | { kind: "radial"; cx: number; cy: number; r0: number; r1: number; stops: GradientStop[] };

interface DrawOptions {
  opacity: number;
  blend: GlobalCompositeOperation;
  clip: Float32Array[];
}

export type RecordedOp = DrawOptions &
  (
    | { kind: "tris"; points: Float32Array; paint: Paint }
    | {
        kind: "image";
        source: TexImageSource;
        tint: readonly [number, number, number];
        corners: Vec2[];
        uv: number[];
      }
  );

function point(m: DOMMatrix, x: number, y: number): Vec2 {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

function scaleOf(m: DOMMatrix) {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

class Gradient implements CanvasGradient {
  readonly stops: GradientStop[] = [];
  constructor(
    readonly kind: "linear" | "radial",
    readonly coords: number[],
    readonly native: CanvasGradient,
    private readonly parseColor: (css: string) => Rgba,
  ) {}
  addColorStop(offset: number, css: string) {
    this.native.addColorStop(offset, css);
    this.stops.push({ offset, color: this.parseColor(css) });
    this.stops.sort((a, b) => a.offset - b.offset);
  }
}

function imageSize(image: TexImageSource): [number, number] {
  if (image instanceof HTMLVideoElement) return [image.videoWidth, image.videoHeight];
  if (image instanceof HTMLImageElement) return [image.naturalWidth, image.naturalHeight];
  if ("displayWidth" in image) return [image.displayWidth, image.displayHeight];
  return [Number(image.width), Number(image.height)];
}

class DrawingState {
  transform = new DOMMatrix();
  fillStyle: ChartDrawingContext["fillStyle"] = "#000";
  strokeStyle: ChartDrawingContext["strokeStyle"] = "#000";
  lineWidth = 1;
  lineJoin: CanvasLineJoin = "miter";
  lineCap: CanvasLineCap = "butt";
  spriteTint: readonly [number, number, number] = [1, 1, 1];
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  shadowColor = "transparent";
  shadowBlur = 0;
  shadowOffsetX = 0;
  shadowOffsetY = 0;
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  clips: Float32Array[] = [];
}

export class RecordingContext2D extends DrawingState implements ChartDrawingContext {
  private stack: DrawingState[] = [];
  private path = new ChartPath();
  private readonly textContext = document.createElement("canvas").getContext("2d")!;
  private readonly colors = new Map<string, Rgba>();
  private readonly glyphs = new Map<
    string,
    { canvas: HTMLCanvasElement; left: number; top: number; scale: number }
  >();

  constructor(private readonly submit: (op: RecordedOp) => void) {
    super();
  }

  save() {
    this.stack.push({
      spriteTint: this.spriteTint,
      transform: this.transform,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineJoin: this.lineJoin,
      lineCap: this.lineCap,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      shadowColor: this.shadowColor,
      shadowBlur: this.shadowBlur,
      shadowOffsetX: this.shadowOffsetX,
      shadowOffsetY: this.shadowOffsetY,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      clips: this.clips,
    });
  }

  restore() {
    Object.assign(this, this.stack.pop());
  }

  translate(x: number, y: number) {
    this.transform = this.transform.translate(x, y);
  }
  rotate(angle: number) {
    this.transform = this.transform.rotate((angle * 180) / Math.PI);
  }
  scale(x: number, y: number) {
    this.transform = this.transform.scale(x, y);
  }

  setTransform(
    a: number | DOMMatrix2DInit = {},
    b?: number,
    c?: number,
    d?: number,
    e?: number,
    f?: number,
  ) {
    this.transform =
      typeof a === "number" ? new DOMMatrix([a, b!, c!, d!, e!, f!]) : DOMMatrix.fromMatrix(a);
  }

  getTransform() {
    return DOMMatrix.fromMatrix(this.transform);
  }
  beginPath() {
    this.path = new ChartPath();
  }
  moveTo(x: number, y: number) {
    this.path.moveTo(...point(this.transform, x, y));
  }
  lineTo(x: number, y: number) {
    this.path.lineTo(...point(this.transform, x, y));
  }
  closePath() {
    this.path.closePath();
  }

  arc(x: number, y: number, r: number, start: number, end: number, ccw = false) {
    const tolerance = 0.3 / (scaleOf(this.transform) || 1);
    for (const p of flattenArc(x, y, r, start, end, ccw, tolerance)) this.lineTo(...p);
  }
  arcTo(x1: number, y1: number, x2: number, y2: number, r: number) {
    const last = this.path.lastPoint;
    if (!last) {
      this.moveTo(x1, y1);
      return;
    }
    const from = point(this.transform.inverse(), ...last);
    const arc = flattenArcTo(...from, x1, y1, x2, y2, r);
    if (arc) for (const p of arc) this.lineTo(...p);
    else this.lineTo(x1, y1);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const control = point(this.transform, cx, cy);
    const last = this.path.lastPoint ?? control;
    for (const p of flattenQuadratic(...last, ...control, ...point(this.transform, x, y)))
      this.path.lineTo(...p);
  }
  private contours(path?: Path2D | CanvasFillRule): FlatSubpath[] {
    if (!path || typeof path === "string") return this.path.contours;
    if (!(path instanceof ChartPath)) throw new Error("WebGL2 滑轨需要保留路径顶点");
    return path.contours.map((sub) => ({
      closed: sub.closed,
      points: sub.points.map((p) => point(this.transform, ...p)),
    }));
  }
  private parseColor = (css: string): Rgba => {
    const cached = this.colors.get(css);
    if (cached) return cached;
    const ctx = this.textContext;
    ctx.fillStyle = css;
    const canonical = ctx.fillStyle;
    let rgba: Rgba;
    if (canonical.startsWith("#")) {
      const n = parseInt(canonical.slice(1), 16);
      rgba = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
    } else {
      const [r, g, b, a = 1] = canonical
        .slice(canonical.indexOf("(") + 1)
        .split(",")
        .map(parseFloat);
      rgba = [r / 255, g / 255, b / 255, a];
    }
    if (this.colors.size >= 512) this.colors.clear();
    this.colors.set(css, rgba);
    return rgba;
  };

  createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
    const coords = [x0, y0, x1, y1] as const;
    return new Gradient(
      "linear",
      [...coords],
      this.textContext.createLinearGradient(...coords),
      this.parseColor,
    );
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
    const coords = [x0, y0, r0, x1, y1, r1] as const;
    return new Gradient(
      "radial",
      [...coords],
      this.textContext.createRadialGradient(...coords),
      this.parseColor,
    );
  }

  private paint(style: DrawingState["fillStyle"]): Paint {
    if (typeof style === "string") return { kind: "solid", color: this.parseColor(style) };
    if (!(style instanceof Gradient)) throw new Error("WebGL2 不支持该谱面画笔");
    const a = style.coords;
    const [x0, y0] = point(this.transform, a[0], a[1]);
    if (style.kind === "linear") {
      const [x1, y1] = point(this.transform, a[2], a[3]);
      return { kind: "linear", x0, y0, x1, y1, stops: style.stops };
    }
    const scale = scaleOf(this.transform);
    return {
      kind: "radial",
      cx: x0,
      cy: y0,
      r0: a[2] * scale,
      r1: a[5] * scale,
      stops: style.stops,
    };
  }

  private drawTriangles(points: Float32Array, style: DrawingState["fillStyle"]) {
    if (!points.length) return;
    const options = {
      opacity: this.globalAlpha,
      blend: this.globalCompositeOperation,
      clip: this.clips,
    };
    if ((this.shadowOffsetX || this.shadowOffsetY) && this.shadowColor !== "transparent") {
      const shadow = points.map((n, i) => n + (i % 2 ? this.shadowOffsetY : this.shadowOffsetX));
      this.submit({
        kind: "tris",
        points: shadow,
        paint: this.paint(this.shadowColor),
        ...options,
      });
    }
    this.submit({ kind: "tris", points, paint: this.paint(style), ...options });
  }

  fill(path?: Path2D | CanvasFillRule, rule?: CanvasFillRule) {
    this.drawTriangles(
      triangulateFill(this.contours(path), typeof path === "string" ? path : rule),
      this.fillStyle,
    );
  }
  clip(path?: Path2D | CanvasFillRule, rule?: CanvasFillRule) {
    this.clips = [
      ...this.clips,
      triangulateFill(this.contours(path), typeof path === "string" ? path : rule),
    ];
  }
  stroke(path?: Path2D) {
    for (const sub of this.contours(path)) {
      const tris = strokeOutline(
        sub.points,
        sub.closed,
        (this.lineWidth * scaleOf(this.transform)) / 2,
        this.lineJoin,
        this.lineCap,
      );
      this.drawTriangles(Float32Array.from(tris.flat()), this.strokeStyle);
    }
  }
  fillRect(x: number, y: number, w: number, h: number) {
    const m = this.transform;
    const a = point(m, x, y),
      b = point(m, x + w, y),
      c = point(m, x, y + h),
      d = point(m, x + w, y + h);
    this.drawTriangles(Float32Array.from([...a, ...b, ...c, ...c, ...b, ...d]), this.fillStyle);
  }

  drawImage(image: CanvasImageSource, ...args: number[]) {
    if (image instanceof SVGImageElement) throw new Error("请先将 SVG 光栅化为谱面精灵");
    const [width, height] = imageSize(image);
    if (!width || !height) return;
    const [sx, sy, sw, sh] = args.length === 8 ? args.slice(0, 4) : [0, 0, width, height];
    const [x, y, w = sw, h = sh] = args.length === 8 ? args.slice(4) : args;
    const m = this.transform;
    this.submit({
      kind: "image",
      source: image,
      tint: this.spriteTint,
      corners: [point(m, x, y), point(m, x + w, y), point(m, x, y + h), point(m, x + w, y + h)],
      uv: [sx / width, sy / height, sw / width, sh / height],
      opacity: this.globalAlpha,
      blend: this.globalCompositeOperation,
      clip: this.clips,
    });
  }

  measureText(text: string) {
    const ctx = this.textContext;
    ctx.font = this.font;
    ctx.textAlign = this.textAlign;
    ctx.textBaseline = this.textBaseline;
    return ctx.measureText(text);
  }

  fillText(text: string, x: number, y: number) {
    const scale = scaleOf(this.transform);
    if (!scale || !text) return;
    const style = this.fillStyle;
    const key = JSON.stringify([
      text,
      this.font,
      this.textAlign,
      this.textBaseline,
      style,
      this.shadowColor,
      this.shadowBlur,
      this.shadowOffsetX,
      this.shadowOffsetY,
      scale,
    ]);
    let sprite = this.glyphs.get(key);
    if (!sprite) {
      const m = this.measureText(text);
      const pad =
        2 +
        this.shadowBlur * 2 +
        Math.max(Math.abs(this.shadowOffsetX), Math.abs(this.shadowOffsetY));
      const left = -m.actualBoundingBoxLeft - pad,
        top = -m.actualBoundingBoxAscent - pad;
      const canvas = createSpriteCanvas();
      canvas.width = Math.max(1, Math.ceil((m.actualBoundingBoxRight + pad - left) * scale));
      canvas.height = Math.max(1, Math.ceil((m.actualBoundingBoxDescent + pad - top) * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(scale, 0, 0, scale, (-x - left) * scale, (-y - top) * scale);
      ctx.font = this.font;
      ctx.textAlign = this.textAlign;
      ctx.textBaseline = this.textBaseline;
      ctx.fillStyle = style instanceof Gradient ? style.native : style;
      ctx.shadowColor = this.shadowColor;
      ctx.shadowBlur = this.shadowBlur;
      ctx.shadowOffsetX = this.shadowOffsetX;
      ctx.shadowOffsetY = this.shadowOffsetY;
      ctx.fillText(text, x, y);
      sprite = { canvas, left, top, scale };
      if (this.glyphs.size >= 128) this.glyphs.delete(this.glyphs.keys().next().value!);
      this.glyphs.set(key, sprite);
    }
    this.drawImage(
      sprite.canvas,
      x + sprite.left,
      y + sprite.top,
      sprite.canvas.width / sprite.scale,
      sprite.canvas.height / sprite.scale,
    );
  }
}
