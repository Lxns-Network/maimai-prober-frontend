import { BaseRenderer, RenderContext } from "./BaseRenderer";
import { TouchNote, TouchHoldStartNote, Point2D, TouchPosition } from "../types";
import {
  TOUCH_SENSOR_RADII,
  TOUCH_APPROACH_MULTIPLIER,
  TOUCH_CENTER_DOT_RATIO,
  TOUCH_PETAL_OPEN_RATIO,
  TOUCH_PETAL_CLOSED_RATIO,
  NOTE_SIZE_RATIO,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  BASE_ANGLE,
  BUTTON_ANGLE_OFFSET,
  BUTTON_ANGLE_STEP,
} from "../utils/constants";

const FIREWORK_DURATION_MS = 1333;
// 烟花最大半宽相对判定圈半径比例：baseRadius (radius / 4.5) × 缩放峰值 5.0 + 5% 留白
const FIREWORK_EXTENT_RATIO = (5.0 / 4.5) * 1.05;
const FIREWORK_SCALE_PEAK = 5.0;
// 烟花由矢量绘制切换至离屏贴图渲染的缩放阈值
const FIREWORK_SPRITE_MIN_SCALE = 2.5;
const FIREWORK_HOLE_START_SEC = 0.6;
const FIREWORK_END_SEC = 1.1;

/** 计算烟花触发时刻（Touch 为 timingMs，Touch Hold 为 timingMs + durationMs）。 */
export function fireworkTriggerMs(note: TouchNote | TouchHoldStartNote): number {
  return note.type === "touch-hold-start" ? note.timingMs + note.durationMs : note.timingMs;
}

// 烟花花瓣循环色板
const FIREWORK_PETAL_COLORS = [
  "#FFB3BA",
  "#FFD0A8",
  "#FFFAB8",
  "#D8F0A8",
  "#B8E0B0",
  "#A8E0CC",
  "#A8C8E8",
  "#B8B0E8",
  "#D0B0E8",
  "#F0B0D8",
  "#FFC9A8",
  "#FFEFA8",
  "#C8E8A8",
  "#A8E0BC",
  "#A8CCE8",
];

/** Touch 音符与特效渲染器，负责 Touch/Touch Hold、花瓣收拢、Hold 环形进度、多押外框与烟花特效。 */
export class TouchRenderer extends BaseRenderer {
  // 烟花贴图缓存（峰值尺寸离屏 Canvas 与 ImageBitmap）
  private fireworkWedgeSprite: HTMLCanvasElement | null = null;
  private fireworkWedgeBitmap: ImageBitmap | null = null;
  private fireworkSpriteBasis = "";
  // 烟花消散期 destination-out 擦除掩膜中间画布
  private fireworkScratch: HTMLCanvasElement | null = null;
  private fireworkScratchCtx: CanvasRenderingContext2D | null = null;
  // Touch 花瓣贴图缓存（键: "图层|变体|花瓣索引"）
  private touchPetalSprites = new Map<string, HTMLCanvasElement>();
  private touchSpriteBasis = "";

  constructor(context: RenderContext) {
    super(context);
  }

  /** 获取 backing store 相对逻辑坐标的缩放（含 DPR）。 */
  private getBackingScale(): number {
    return this.context.canvas.width / (this.context.centerX * 2);
  }

  /** 获取或烘焙全分辨率烟花楔形离屏贴图（radius 或 backingScale 变化时重建，异步生成 ImageBitmap）。 */
  private getWedgeSprite(): HTMLCanvasElement {
    const backingScale = this.getBackingScale();
    const basis = `${this.context.radius}|${backingScale}`;
    if (this.fireworkWedgeSprite && this.fireworkSpriteBasis === basis) {
      return this.fireworkWedgeSprite;
    }

    const half = this.context.radius * FIREWORK_EXTENT_RATIO;
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    const sprite = document.createElement("canvas");
    sprite.width = sizePx;
    sprite.height = sizePx;
    const spriteCtx = sprite.getContext("2d")!;
    spriteCtx.setTransform(backingScale, 0, 0, backingScale, sizePx / 2, sizePx / 2);

    const outerR = (this.context.radius / 4.5) * FIREWORK_SCALE_PEAK;
    spriteCtx.globalAlpha = 0.589;

    // 楔形辐射分布，角宽略小于间隙，外边缘保留 10% 径向渐变淡出
    const N = FIREWORK_PETAL_COLORS.length;
    const halfWidth = (Math.PI / N) * 0.45;
    const FADE_INNER = 0.9;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const path = new Path2D();
      path.moveTo(0, 0);
      path.lineTo(Math.cos(angle - halfWidth) * outerR, Math.sin(angle - halfWidth) * outerR);
      path.lineTo(Math.cos(angle + halfWidth) * outerR, Math.sin(angle + halfWidth) * outerR);
      path.closePath();

      const color = FIREWORK_PETAL_COLORS[i];
      const grad = spriteCtx.createRadialGradient(0, 0, 0, 0, 0, outerR);
      grad.addColorStop(0, color);
      grad.addColorStop(FADE_INNER, color);
      grad.addColorStop(1, color + "00");
      spriteCtx.fillStyle = grad;
      spriteCtx.fill(path);
    }

    this.fireworkWedgeSprite = sprite;
    this.fireworkSpriteBasis = basis;
    this.fireworkWedgeBitmap?.close();
    this.fireworkWedgeBitmap = null;
    if (typeof createImageBitmap === "function") {
      createImageBitmap(sprite)
        .then((bitmap) => {
          if (this.fireworkSpriteBasis !== basis || this.fireworkWedgeSprite !== sprite) {
            bitmap.close();
            return;
          }
          this.fireworkWedgeBitmap = bitmap;
          // 极低透明度圆形裁剪内试画以预热纹理，避免画面可见痕迹
          const ctx = this.context.ctx;
          const size = this.context.radius * FIREWORK_EXTENT_RATIO * 2;
          ctx.save();
          ctx.beginPath();
          ctx.arc(this.context.centerX, this.context.centerY, this.context.centerX, 0, Math.PI * 2);
          ctx.clip();
          ctx.globalAlpha = 1 / 255;
          ctx.translate(this.context.centerX, this.context.centerY);
          ctx.rotate(0.1);
          ctx.drawImage(bitmap, -size / 2, -size / 2, size, size);
          ctx.drawImage(bitmap, -size / 4, -size / 4, size / 2, size / 2);
          ctx.restore();
        })
        .catch(() => {});
    }
    return sprite;
  }

  /** 获取烟花图像源（优先使用 ImageBitmap，未就绪回退离屏 Canvas）。 */
  private getWedgeImage(): HTMLCanvasElement | ImageBitmap {
    const sprite = this.getWedgeSprite();
    return this.fireworkWedgeBitmap ?? sprite;
  }

  /** 矢量绘制烟花楔形（小缩放比例阶段使用）。 */
  private drawWedgesVector(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    rotation: number,
  ): void {
    const outerR = (this.context.radius / 4.5) * scale;
    if (outerR <= 0) return;
    ctx.save();
    ctx.globalAlpha = 0.589;
    const N = FIREWORK_PETAL_COLORS.length;
    const halfWidth = (Math.PI / N) * 0.45;
    const FADE_INNER = 0.9;
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 + rotation;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x + Math.cos(angle - halfWidth) * outerR,
        y + Math.sin(angle - halfWidth) * outerR,
      );
      ctx.lineTo(
        x + Math.cos(angle + halfWidth) * outerR,
        y + Math.sin(angle + halfWidth) * outerR,
      );
      ctx.closePath();
      const color = FIREWORK_PETAL_COLORS[i];
      const grad = ctx.createRadialGradient(x, y, 0, x, y, outerR);
      grad.addColorStop(0, color);
      grad.addColorStop(FADE_INNER, color);
      grad.addColorStop(1, color + "00");
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  /** 预热烟花贴图与中间合成画布，建议在首个烟花触发前调用。 */
  warmFireworkResources(): void {
    const backingScale = this.getBackingScale();
    const basis = `${this.context.radius}|${backingScale}`;
    if (this.fireworkSpriteBasis === basis && this.fireworkScratch) return;
    const sprite = this.getWedgeSprite();
    const half = this.context.radius * FIREWORK_EXTENT_RATIO;
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    const scratch = this.acquireFireworkScratch(sizePx);
    scratch.drawImage(sprite, 0, 0);
    // 预热 destination-out 渐变管线
    scratch.globalCompositeOperation = "destination-out";
    const scratchGrad = scratch.createRadialGradient(0, 0, 0, 0, 0, 1);
    scratchGrad.addColorStop(0, "rgba(0,0,0,1)");
    scratchGrad.addColorStop(0.5, "rgba(0,0,0,1)");
    scratchGrad.addColorStop(1, "rgba(0,0,0,0)");
    scratch.fillStyle = scratchGrad;
    scratch.fillRect(0, 0, 2, 2);
    scratch.globalCompositeOperation = "source-over";
    // 极低透明度预执行绘制管线避免初次调用掉帧
    const ctx = this.context.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.context.centerX, this.context.centerY, this.context.centerX, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 1 / 255;
    ctx.translate(this.context.centerX, this.context.centerY);
    ctx.rotate(0.1);
    ctx.drawImage(sprite, -half, -half, half * 2, half * 2);
    ctx.drawImage(this.fireworkScratch!, -half, -half, half * 2, half * 2);
    ctx.rotate(-0.1);
    ctx.scale(0.01, 0.01);
    this.drawWedgesVector(ctx, 0, 0, 1, 0.1);
    this.drawFireworkBalls(ctx, 0, 0, 0.3);
    ctx.restore();
  }

  /** 获取或调整烟花中间合成画布（自动重置变换并清空）。 */
  private acquireFireworkScratch(sizePx: number): CanvasRenderingContext2D {
    if (!this.fireworkScratch || this.fireworkScratch.width !== sizePx) {
      this.fireworkScratch = document.createElement("canvas");
      this.fireworkScratch.width = sizePx;
      this.fireworkScratch.height = sizePx;
      this.fireworkScratchCtx = this.fireworkScratch.getContext("2d");
    }
    const ctx = this.fireworkScratchCtx!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, sizePx, sizePx);
    return ctx;
  }

  /** 绘制烟花中心光晕（外圈光晕 + 内核高光，使用 lighter 混合）。 */
  private drawFireworkBalls(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    growT: number,
  ): void {
    if (growT < 0) return;
    const baseRadius = this.context.radius / 4.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // 外圈光晕：峰值 alpha 0.7
    const BIG_GROW = 0.06;
    const BIG_RISE = 0.04;
    const bigRMax = baseRadius * 1.3;
    const BIG_DECAY_END = FIREWORK_DURATION_MS / 1000 - 0.1;
    const BIG_PEAK_ALPHA = 0.7;
    let bigAlpha = 0;
    let bigR = 0;
    if (growT < BIG_GROW) {
      bigR = (growT / BIG_GROW) * bigRMax;
      bigAlpha = BIG_PEAK_ALPHA * Math.min(1, growT / BIG_RISE);
    } else {
      const d = (growT - BIG_GROW) / (BIG_DECAY_END - BIG_GROW);
      bigR = bigRMax * (1 - d);
      bigAlpha = BIG_PEAK_ALPHA * (1 - d);
    }
    if (bigAlpha > 0 && bigR > 0) {
      ctx.globalAlpha = bigAlpha;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, bigR);
      grad.addColorStop(0, "rgb(255, 235, 200)");
      grad.addColorStop(1, "rgba(255, 180, 100, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, bigR, 0, Math.PI * 2);
      ctx.fill();
    }

    // 内核高光：峰值不透明度 0.6，与外圈叠加呈现纯白中心与平滑边缘衰减。
    const SMALL_GROW = 0.04;
    const SMALL_RISE = 0.02;
    const smallRMax = baseRadius * 0.55;
    const SMALL_DECAY_END = 0.55;
    const SMALL_PEAK_ALPHA = 0.6;
    let smallAlpha = 0;
    let smallR = 0;
    if (growT < SMALL_GROW) {
      smallR = (growT / SMALL_GROW) * smallRMax;
      smallAlpha = SMALL_PEAK_ALPHA * Math.min(1, growT / SMALL_RISE);
    } else if (growT < SMALL_DECAY_END) {
      const d = (growT - SMALL_GROW) / (SMALL_DECAY_END - SMALL_GROW);
      smallR = smallRMax * (1 - d);
      smallAlpha = SMALL_PEAK_ALPHA * (1 - d);
    }
    if (smallAlpha > 0 && smallR > 0) {
      ctx.globalAlpha = smallAlpha;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, smallR);
      grad.addColorStop(0, "rgb(255, 245, 220)");
      grad.addColorStop(1, "rgba(255, 220, 160, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, smallR, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** 花瓣贴图逻辑半宽（包含本体尺寸、外层描边与阴影余量）。 */
  private getTouchSpriteHalf(): number {
    return (
      this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3 +
      this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO) * 3 +
      this.scaleByRadius(8 / 300) +
      this.scaleByRadius(2 / 300)
    );
  }

  /**
   * 获取或烘焙单片 Touch 花瓣离屏贴图。
   * - layer: "sb"=阴影与黑边, "f"=色块填充, "w"=白色轮廓；
   * - kind: "n"=普通, "s"=双押, "h"=Touch Hold；
   * - i: 花瓣索引（0~3）。
   */
  private getTouchPetalSprite(
    layer: "sb" | "f" | "w",
    kind: "n" | "s" | "h",
    i: number,
  ): HTMLCanvasElement {
    const backingScale = this.getBackingScale();
    const basis = `${this.context.radius}|${backingScale}`;
    if (this.touchSpriteBasis !== basis) {
      this.touchPetalSprites.clear();
      this.touchSpriteBasis = basis;
    }
    // 阴影与白轮廓层与颜色无关，双押和普通音符共用贴图
    const geomKind = layer === "f" ? kind : kind === "h" ? "h" : "n";
    const key = `${layer}|${geomKind}|${i}`;
    let sprite = this.touchPetalSprites.get(key);
    if (sprite) return sprite;

    const half = this.getTouchSpriteHalf();
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    sprite = document.createElement("canvas");
    sprite.width = sizePx;
    sprite.height = sizePx;
    const sctx = sprite.getContext("2d")!;
    sctx.setTransform(backingScale, 0, 0, backingScale, sizePx / 2, sizePx / 2);

    const isHold = geomKind === "h";
    const petalBaseAngles = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
    const petalAngle = petalBaseAngles[i] + (isHold ? 0 : -Math.PI / 4);
    const petalSize = this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3;
    const tipAngle = petalAngle + Math.PI;
    const leftAngle = petalAngle + Math.PI / 2;
    const rightAngle = petalAngle - Math.PI / 2;
    const tipX = Math.cos(tipAngle) * petalSize;
    const tipY = Math.sin(tipAngle) * petalSize;
    const leftX = Math.cos(leftAngle) * petalSize;
    const leftY = Math.sin(leftAngle) * petalSize;
    const rightX = Math.cos(rightAngle) * petalSize;
    const rightY = Math.sin(rightAngle) * petalSize;
    const innerRatio = 0.4;
    const cx = (tipX + leftX + rightX) / 3;
    const cy = (tipY + leftY + rightY) / 3;
    const innerTipX = cx + (tipX - cx) * innerRatio;
    const innerTipY = cy + (tipY - cy) * innerRatio;
    const innerLeftX = cx + (leftX - cx) * innerRatio;
    const innerLeftY = cy + (leftY - cy) * innerRatio;
    const innerRightX = cx + (rightX - cx) * innerRatio;
    const innerRightY = cy + (rightY - cy) * innerRatio;
    const cornerRadius = this.scaleByRadius(8 / 300);
    const innerCornerRadius = cornerRadius * 0.4;
    const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
    const petalColors = [
      COLORS.TOUCH_HOLD_RED,
      COLORS.TOUCH_HOLD_YELLOW,
      COLORS.TOUCH_HOLD_GREEN,
      COLORS.TOUCH_HOLD_BLUE,
    ];

    const mainCtx = this.context.ctx;
    this.context.ctx = sctx;
    try {
      if (layer === "sb") {
        sctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        sctx.shadowBlur = this.scaleByRadius(8 / 300);
        sctx.shadowOffsetX = this.scaleByRadius(2 / 300);
        sctx.shadowOffsetY = this.scaleByRadius(2 / 300);
        sctx.fillStyle = "rgba(0, 0, 0, 0.01)"; // 填充微小透明度触发阴影渲染
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        sctx.fill();
        sctx.shadowColor = "transparent";
        sctx.shadowBlur = 0;
        sctx.shadowOffsetX = 0;
        sctx.shadowOffsetY = 0;
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        this.stroke(COLORS.BLACK, strokeWidth * 3);
        if (!isHold) {
          sctx.beginPath();
          this.drawRoundedTriangle(
            innerTipX,
            innerTipY,
            innerLeftX,
            innerLeftY,
            innerRightX,
            innerRightY,
            innerCornerRadius,
          );
          this.stroke(COLORS.BLACK, strokeWidth * 3);
        }
      } else if (layer === "f") {
        let fillStyle: string | CanvasGradient;
        if (kind === "h") {
          fillStyle = petalColors[i];
        } else {
          const gradient = sctx.createLinearGradient(0, 0, tipX, tipY);
          gradient.addColorStop(0, kind === "s" ? "#FFFF00" : "#00FFFF");
          gradient.addColorStop(1, kind === "s" ? "#FFD700" : "#0080FF");
          fillStyle = gradient;
        }
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        if (!isHold) {
          this.drawRoundedTriangle(
            innerTipX,
            innerTipY,
            innerRightX,
            innerRightY,
            innerLeftX,
            innerLeftY,
            innerCornerRadius,
          );
        }
        sctx.fillStyle = fillStyle;
        sctx.fill();
      } else {
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        if (!isHold) {
          this.drawRoundedTriangle(
            innerTipX,
            innerTipY,
            innerLeftX,
            innerLeftY,
            innerRightX,
            innerRightY,
            innerCornerRadius,
          );
        }
        this.stroke(COLORS.WHITE, strokeWidth);
      }
    } finally {
      this.context.ctx = mainCtx;
    }
    this.touchPetalSprites.set(key, sprite);
    return sprite;
  }

  /** 计算 Touch 传感器在画布上的绝对像素坐标（自动处理水平镜像，"C" 对应圆心）。 */
  getTouchPosition(touchPosition: TouchPosition): Point2D {
    const mirroredPosition = this.mirrorTouchPosition(touchPosition);
    const region = mirroredPosition[0];
    const sensorNum = mirroredPosition.length > 1 ? parseInt(mirroredPosition[1]) : 0;

    const radiusRatio = TOUCH_SENSOR_RADII[region] || 0;
    const distance = this.context.radius * radiusRatio;

    if (region === "C") {
      return { x: this.context.centerX, y: this.context.centerY };
    }

    // D/E 与按键对齐；A/B 偏移半个按键
    const angle =
      region === "D" || region === "E"
        ? BASE_ANGLE + (sensorNum - 1) * BUTTON_ANGLE_STEP
        : BASE_ANGLE + BUTTON_ANGLE_OFFSET + (sensorNum - 1) * BUTTON_ANGLE_STEP;

    return {
      x: this.context.centerX + Math.cos(angle) * distance,
      y: this.context.centerY + Math.sin(angle) * distance,
    };
  }

  /** 渲染单个 Touch 或 Touch Hold 音符（含收拢动画、Hold 环形进度、花瓣轮廓填充与中心圆点）。 */
  renderTouch(
    note: TouchNote | TouchHoldStartNote,
    _currentBeat: number,
    currentTimeMs: number,
    isSimultaneous: boolean,
  ): void {
    const isHold = note.type === "touch-hold-start";
    const timeDiff = note.timingMs - currentTimeMs;
    const approachTime = this.getNoteApproachTimeMs(note) * TOUCH_APPROACH_MULTIPLIER;

    let visibilityWindow = 50;
    if (isHold && "durationMs" in note && note.durationMs !== undefined) {
      visibilityWindow = note.durationMs + 50;
    }
    if (timeDiff > approachTime || timeDiff < -visibilityWindow) return;

    let alpha = 1;
    if (timeDiff > approachTime * 0.95) {
      alpha = 1 - (timeDiff - approachTime * 0.95) / (approachTime * 0.05);
    }

    let petalAlpha = 1;
    if (timeDiff > 0 && timeDiff < approachTime) {
      const remaining = approachTime - timeDiff;
      if (remaining < 150) {
        petalAlpha = remaining / 150;
      }
    }

    const openDist = this.scaleByRadius(TOUCH_PETAL_OPEN_RATIO) * 1.1;
    const closedDist = this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3;
    let petalDist = openDist;

    if (timeDiff > 0 && timeDiff <= approachTime) {
      const progress = 1 - timeDiff / approachTime;
      const eased = progress * progress * progress * progress;
      petalDist = openDist - (openDist - closedDist) * eased;
    } else if (timeDiff <= 0) {
      petalDist = closedDist;
    }

    const position = this.getTouchPosition(note.position);
    const isHoldActive = isHold && timeDiff < 0;
    const ctx = this.context.ctx;

    const cornerRadius = this.scaleByRadius(8 / 300);
    const innerCornerRadius = cornerRadius * 0.4;
    const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
    const ddrColor = this.getDdrColor(note.timing);
    const petalBaseAngles = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
    const angleOffset = isHold ? 0 : -Math.PI / 4;
    const petalColors = [
      COLORS.TOUCH_HOLD_RED,
      COLORS.TOUCH_HOLD_YELLOW,
      COLORS.TOUCH_HOLD_GREEN,
      COLORS.TOUCH_HOLD_BLUE,
    ];
    const combinedAlpha = alpha * petalAlpha;

    interface PetalGeometry {
      tipX: number;
      tipY: number;
      leftX: number;
      leftY: number;
      rightX: number;
      rightY: number;
      petalX: number;
      petalY: number;
      innerTipX?: number;
      innerTipY?: number;
      innerLeftX?: number;
      innerLeftY?: number;
      innerRightX?: number;
      innerRightY?: number;
    }
    const petals: PetalGeometry[] = [];

    for (let i = 0; i < 4; i++) {
      const petalAngle = petalBaseAngles[i] + angleOffset;
      const petalX = position.x + Math.cos(petalAngle) * petalDist;
      const petalY = position.y + Math.sin(petalAngle) * petalDist;
      const tipAngle = petalAngle + Math.PI;
      const leftAngle = petalAngle + Math.PI / 2;
      const rightAngle = petalAngle - Math.PI / 2;
      const petalSize = closedDist;

      const tipX = petalX + Math.cos(tipAngle) * petalSize;
      const tipY = petalY + Math.sin(tipAngle) * petalSize;
      const leftX = petalX + Math.cos(leftAngle) * petalSize;
      const leftY = petalY + Math.sin(leftAngle) * petalSize;
      const rightX = petalX + Math.cos(rightAngle) * petalSize;
      const rightY = petalY + Math.sin(rightAngle) * petalSize;

      const petal: PetalGeometry = { tipX, tipY, leftX, leftY, rightX, rightY, petalX, petalY };

      if (!isHold) {
        const innerRatio = 0.4;
        const cx = (tipX + leftX + rightX) / 3;
        const cy = (tipY + leftY + rightY) / 3;
        petal.innerTipX = cx + (tipX - cx) * innerRatio;
        petal.innerTipY = cy + (tipY - cy) * innerRatio;
        petal.innerLeftX = cx + (leftX - cx) * innerRatio;
        petal.innerLeftY = cy + (leftY - cy) * innerRatio;
        petal.innerRightX = cx + (rightX - cx) * innerRatio;
        petal.innerRightY = cy + (rightY - cy) * innerRatio;
      }

      petals.push(petal);
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    if (isHoldActive && "durationMs" in note && note.durationMs !== undefined) {
      const elapsed = -timeDiff;
      const progress = Math.min(elapsed / note.durationMs, 1);

      const progressScale = 1.35;
      // 花瓣外黑边宽度，进度框/弧同步外扩保持间距；跟随 strokeWidth 缩放
      const progressBandPad = strokeWidth;
      const progressRadius = closedDist * progressScale * 1.8 + progressBandPad;
      const squareSize = closedDist * progressScale * 1.5 + progressBandPad;
      const r = Math.min(this.scaleByRadius(25 / 300), squareSize * 0.707); // 0.707 = sqrt(2)/2
      const endAngle = -Math.PI / 2 + progress * Math.PI * 2;

      ctx.save();

      // 圆角菱形 clip（上 → 右 → 下 → 左，每角用二次贝塞尔）
      const offset = r * 0.707;
      ctx.beginPath();
      ctx.moveTo(position.x - offset, position.y - squareSize + offset);
      ctx.quadraticCurveTo(
        position.x,
        position.y - squareSize,
        position.x + offset,
        position.y - squareSize + offset,
      );
      ctx.lineTo(position.x + squareSize - offset, position.y - offset);
      ctx.quadraticCurveTo(
        position.x + squareSize,
        position.y,
        position.x + squareSize - offset,
        position.y + offset,
      );
      ctx.lineTo(position.x + offset, position.y + squareSize - offset);
      ctx.quadraticCurveTo(
        position.x,
        position.y + squareSize,
        position.x - offset,
        position.y + squareSize - offset,
      );
      ctx.lineTo(position.x - squareSize + offset, position.y + offset);
      ctx.quadraticCurveTo(
        position.x - squareSize,
        position.y,
        position.x - squareSize + offset,
        position.y - offset,
      );
      ctx.closePath();
      ctx.clip();

      // 进度弧 clip：从顶部顺时针扇形
      ctx.beginPath();
      ctx.moveTo(position.x, position.y);
      ctx.arc(position.x, position.y, progressRadius, -Math.PI / 2, endAngle, false);
      ctx.closePath();
      ctx.clip();

      // 放大花瓣：scale 后径向外推 progressBandPad，贴合裁剪边界
      const px = position.x,
        py = position.y;
      const scaleOut = (vx: number, vy: number) => {
        const sx = (vx - px) * progressScale;
        const sy = (vy - py) * progressScale;
        const len = Math.hypot(sx, sy);
        if (len === 0) return { x: px, y: py };
        const k = (len + progressBandPad) / len;
        return { x: px + sx * k, y: py + sy * k };
      };
      for (let i = 0; i < 4; i++) {
        const p = petals[i];
        const tip = scaleOut(p.tipX, p.tipY);
        const lf = scaleOut(p.leftX, p.leftY);
        const rt = scaleOut(p.rightX, p.rightY);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(lf.x, lf.y);
        ctx.lineTo(rt.x, rt.y);
        ctx.closePath();
        ctx.fillStyle = petalColors[i];
        ctx.fill();
      }

      ctx.restore();
    }

    ctx.globalAlpha = combinedAlpha;
    if (ddrColor) {
      // DDR 动态节拍着色模式走矢量路径
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = this.scaleByRadius(8 / 300);
      ctx.shadowOffsetX = this.scaleByRadius(2 / 300);
      ctx.shadowOffsetY = this.scaleByRadius(2 / 300);
      ctx.fillStyle = "rgba(0, 0, 0, 0.01)"; // 填充微小透明度触发阴影渲染

      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const p = petals[i];
        this.drawRoundedTriangle(
          p.tipX,
          p.tipY,
          p.leftX,
          p.leftY,
          p.rightX,
          p.rightY,
          cornerRadius,
        );
      }
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // 外三角与内孔各画加宽黑轮廓，再用填充色覆盖内侧光晕
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const p = petals[i];
        this.drawRoundedTriangle(
          p.tipX,
          p.tipY,
          p.leftX,
          p.leftY,
          p.rightX,
          p.rightY,
          cornerRadius,
        );
      }
      this.stroke(COLORS.BLACK, strokeWidth * 3);
      if (!isHold) {
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const p = petals[i];
          this.drawRoundedTriangle(
            p.innerTipX!,
            p.innerTipY!,
            p.innerLeftX!,
            p.innerLeftY!,
            p.innerRightX!,
            p.innerRightY!,
            innerCornerRadius,
          );
        }
        this.stroke(COLORS.BLACK, strokeWidth * 3);
      }

      for (let i = 0; i < 4; i++) {
        const p = petals[i];
        ctx.beginPath();
        this.drawRoundedTriangle(
          p.tipX,
          p.tipY,
          p.leftX,
          p.leftY,
          p.rightX,
          p.rightY,
          cornerRadius,
        );
        if (!isHold) {
          this.drawRoundedTriangle(
            p.innerTipX!,
            p.innerTipY!,
            p.innerRightX!,
            p.innerRightY!,
            p.innerLeftX!,
            p.innerLeftY!,
            innerCornerRadius,
          );
        }
        ctx.fillStyle = ddrColor;
        ctx.fill();
      }

      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const p = petals[i];
        this.drawRoundedTriangle(
          p.tipX,
          p.tipY,
          p.leftX,
          p.leftY,
          p.rightX,
          p.rightY,
          cornerRadius,
        );
        if (!isHold) {
          this.drawRoundedTriangle(
            p.innerTipX!,
            p.innerTipY!,
            p.innerLeftX!,
            p.innerLeftY!,
            p.innerRightX!,
            p.innerRightY!,
            innerCornerRadius,
          );
        }
      }
      this.stroke(COLORS.WHITE, strokeWidth);
    } else {
      // 分层贴图绘制：按阴影黑边、填充、白边次序绘制
      const spriteKind = isHold ? "h" : isSimultaneous ? "s" : "n";
      const spriteHalf = this.getTouchSpriteHalf();
      for (const layer of ["sb", "f", "w"] as const) {
        for (let i = 0; i < 4; i++) {
          const sprite = this.getTouchPetalSprite(layer, spriteKind, i);
          const p = petals[i];
          ctx.drawImage(
            sprite,
            p.petalX - spriteHalf,
            p.petalY - spriteHalf,
            spriteHalf * 2,
            spriteHalf * 2,
          );
        }
      }
    }

    ctx.globalAlpha = alpha;
    const centerSize = this.scaleByRadius(TOUCH_CENTER_DOT_RATIO) * 0.8;
    ctx.beginPath();
    ctx.arc(position.x, position.y, centerSize, 0, Math.PI * 2);
    this.stroke(COLORS.BLACK, strokeWidth * 3);
    ctx.fillStyle = isSimultaneous ? "#FFFF00" : "#00BFFF";
    ctx.fill();
    this.stroke(COLORS.WHITE, strokeWidth);

    ctx.restore();
  }

  /**
   * 渲染当前活跃的触控烟花特效（单例）。
   * touches 必须已按 hasFirework 过滤并按 fireworkTriggerMs 升序排列（内部二分查找定位最新）。
   */
  renderTouchFireworks(
    touches: ReadonlyArray<TouchNote | TouchHoldStartNote>,
    currentTimeMs: number,
  ): void {
    let lo = 0;
    let hi = touches.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (fireworkTriggerMs(touches[mid]) <= currentTimeMs) lo = mid + 1;
      else hi = mid;
    }
    const latestNote = lo > 0 ? touches[lo - 1] : null;
    if (!latestNote) return;
    const ageMs = currentTimeMs - fireworkTriggerMs(latestNote);
    if (ageMs >= FIREWORK_DURATION_MS) return;
    const tSec = ageMs / 1000;
    if (tSec >= FIREWORK_END_SEC) return;

    // 缩放曲线：0.1~0.5s 三次缓出至峰值，随后维持至擦除完毕
    let scale: number;
    if (tSec < 0.1) scale = 0;
    else if (tSec < 0.5) {
      const u = (tSec - 0.1) / 0.4;
      scale = (1 - Math.pow(1 - u, 3)) * FIREWORK_SCALE_PEAK;
    } else scale = FIREWORK_SCALE_PEAK;

    const position = this.getTouchPosition(latestNote.position);
    const rotation = (ageMs / FIREWORK_DURATION_MS) * ((72 * Math.PI) / 180);
    const ctx = this.context.ctx;
    const half = this.context.radius * FIREWORK_EXTENT_RATIO;

    if (tSec <= FIREWORK_HOLE_START_SEC) {
      // 成长期无掩膜：小缩放比例走矢量绘制，达到阈值切换离屏贴图
      if (scale > 0 && scale < FIREWORK_SPRITE_MIN_SCALE) {
        this.drawWedgesVector(ctx, position.x, position.y, scale, rotation);
      } else if (scale > 0) {
        const drawHalf = half * (scale / FIREWORK_SCALE_PEAK);
        ctx.save();
        ctx.translate(position.x, position.y);
        ctx.rotate(rotation);
        ctx.drawImage(this.getWedgeImage(), -drawHalf, -drawHalf, drawHalf * 2, drawHalf * 2);
        ctx.restore();
      }
      this.drawFireworkBalls(ctx, position.x, position.y, tSec - 0.1);
      return;
    }

    // 消散期：在中间画布上合成贴图与光晕，用 destination-out 擦除掩膜后贴回主画布
    const backingScale = this.getBackingScale();
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    const scratch = this.acquireFireworkScratch(sizePx);
    scratch.setTransform(backingScale, 0, 0, backingScale, sizePx / 2, sizePx / 2);
    scratch.rotate(rotation);
    scratch.drawImage(this.getWedgeImage(), -half, -half, half * 2, half * 2);
    scratch.rotate(-rotation);
    this.drawFireworkBalls(scratch, 0, 0, tSec - 0.1);

    // 掩膜 = 实心核心 + 羽化边缘，从中心扩张擦除
    const outerR = (this.context.radius / 4.5) * scale;
    const holeSpan = FIREWORK_END_SEC - FIREWORK_HOLE_START_SEC;
    const linearU = Math.min(1, (tSec - FIREWORK_HOLE_START_SEC) / holeSpan);
    // 前 20% 快速升至 alpha 1 使掩膜尽早可见；半径用 smoothstep 平滑起停
    const u = linearU * linearU * (3 - 2 * linearU);
    const solidR = outerR * (0.05 + u * 0.95);
    const totalR = solidR + outerR * 0.5;
    const maskAlpha = Math.min(1, linearU / 0.2);
    if (totalR > 0 && maskAlpha > 0) {
      scratch.globalCompositeOperation = "destination-out";
      scratch.globalAlpha = maskAlpha;
      const maskGrad = scratch.createRadialGradient(0, 0, 0, 0, 0, totalR);
      maskGrad.addColorStop(0, "rgba(0,0,0,1)");
      maskGrad.addColorStop(solidR / totalR, "rgba(0,0,0,1)");
      maskGrad.addColorStop(1, "rgba(0,0,0,0)");
      scratch.fillStyle = maskGrad;
      scratch.beginPath();
      scratch.arc(0, 0, totalR, 0, Math.PI * 2);
      scratch.fill();
      scratch.globalCompositeOperation = "source-over";
      scratch.globalAlpha = 1;
    }

    ctx.drawImage(this.fireworkScratch!, position.x - half, position.y - half, half * 2, half * 2);
  }

  /** 渲染同位置多押缺口圆角外框（>=2 个生效，>=3 个叠加双层外框）。 */
  renderTouchBorder(position: Point2D, isSimultaneous: boolean, visibleTouchCount: number): void {
    if (visibleTouchCount < 2) {
      return;
    }

    const boxSize = this.scaleByRadius(1 / 4.46) * 1.1 * 1.2;
    const cornerRadius = this.scaleByRadius(NOTE_SIZE_RATIO);
    const color = isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TOUCH_CYAN;

    if (visibleTouchCount >= 3) {
      const largerSize = boxSize * 1.2;
      this.drawTouchBorderBox(position.x, position.y, largerSize, cornerRadius, color, 3);
    }

    this.drawTouchBorderBox(position.x, position.y, boxSize, cornerRadius, color, 3);
  }

  /** 绘制单层带缺口的圆角矩形框。 */
  private drawTouchBorderBox(
    x: number,
    y: number,
    size: number,
    cornerRadius: number,
    color: string,
    lineWidth: number,
  ): void {
    const half = size / 2;
    const left = x - half;
    const top = y - half;
    const gap = size * 0.3;
    const ctx = this.context.ctx;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = (lineWidth * this.context.radius) / 300;
    ctx.beginPath();

    // 每条边中点留 gap 缺口，共 8 段 + 4 个圆角
    ctx.moveTo(left + cornerRadius, top);
    ctx.lineTo(left + size / 2 - gap / 2, top);
    ctx.moveTo(left + size / 2 + gap / 2, top);
    ctx.lineTo(left + size - cornerRadius, top);
    ctx.arcTo(left + size, top, left + size, top + cornerRadius, cornerRadius);

    ctx.lineTo(left + size, top + size / 2 - gap / 2);
    ctx.moveTo(left + size, top + size / 2 + gap / 2);
    ctx.lineTo(left + size, top + size - cornerRadius);
    ctx.arcTo(left + size, top + size, left + size - cornerRadius, top + size, cornerRadius);

    ctx.lineTo(left + size / 2 + gap / 2, top + size);
    ctx.moveTo(left + size / 2 - gap / 2, top + size);
    ctx.lineTo(left + cornerRadius, top + size);
    ctx.arcTo(left, top + size, left, top + size - cornerRadius, cornerRadius);

    ctx.lineTo(left, top + size / 2 + gap / 2);
    ctx.moveTo(left, top + size / 2 - gap / 2);
    ctx.lineTo(left, top + cornerRadius);
    ctx.arcTo(left, top, left + cornerRadius, top, cornerRadius);

    ctx.stroke();
    ctx.restore();
  }

  /** 在当前路径中追加圆角三角形（cornerRadius <= 0 退化为尖角）。 */
  private drawRoundedTriangle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    cornerRadius: number,
  ): void {
    if (cornerRadius <= 0) {
      const ctx = this.context.ctx;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      return;
    }

    const vertices = [
      { from: { x: x1, y: y1 }, to: { x: x2, y: y2 } },
      { from: { x: x2, y: y2 }, to: { x: x3, y: y3 } },
      { from: { x: x3, y: y3 }, to: { x: x1, y: y1 } },
    ];

    const ctx = this.context.ctx;

    for (let i = 0; i < 3; i++) {
      const prevEdge = vertices[(i + 2) % 3];
      const currEdge = vertices[i];
      const corner = currEdge.from;

      const dx1 = corner.x - prevEdge.from.x;
      const dy1 = corner.y - prevEdge.from.y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = currEdge.to.x - corner.x;
      const dy2 = currEdge.to.y - corner.y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      const nx1 = dx1 / len1;
      const ny1 = dy1 / len1;
      const nx2 = dx2 / len2;
      const ny2 = dy2 / len2;

      // 圆角半径不超过两边一半，避免过大回绕
      const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

      const beforeX = corner.x - nx1 * r;
      const beforeY = corner.y - ny1 * r;
      const afterX = corner.x + nx2 * r;
      const afterY = corner.y + ny2 * r;

      if (i === 0) {
        ctx.moveTo(beforeX, beforeY);
      } else {
        ctx.lineTo(beforeX, beforeY);
      }

      ctx.quadraticCurveTo(corner.x, corner.y, afterX, afterY);
    }

    ctx.closePath();
  }
}

export default TouchRenderer;
