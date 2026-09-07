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
// 烟花最大可见半宽相对于判定圈半径的比例：baseRadius (radius / 4.5) × 缩放峰值 5.0，附加 5% 留白。
const FIREWORK_EXTENT_RATIO = (5.0 / 4.5) * 1.05;
const FIREWORK_SCALE_PEAK = 5.0;
// 烟花由实时矢量绘制切换至离屏精灵渲染的缩放比例阈值。
const FIREWORK_SPRITE_MIN_SCALE = 2.5;
const FIREWORK_HOLE_START_SEC = 0.6;
const FIREWORK_END_SEC = 1.1;

/**
 * 计算音符对应的烟花特效触发时刻（毫秒）。
 *
 * 普通 Touch 音符在判定时刻触发，Touch Hold 音符在持续时间结束后触发。
 *
 * @param note Touch 音符或 Touch Hold 起始音符对象。
 * @returns 烟花特效开始播放的绝对时间戳（毫秒）。
 */
export function fireworkTriggerMs(note: TouchNote | TouchHoldStartNote): number {
  return note.type === "touch-hold-start" ? note.timingMs + note.durationMs : note.timingMs;
}

// 烟花花瓣循环色板。
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

/**
 * Touch 音符与相关特效渲染器。
 * 负责 Touch / Touch Hold 音符本体、花瓣收拢动画、Hold 环形进度、同位置多押外框及触控烟花特效的绘制与缓存管理。
 */
export class TouchRenderer extends BaseRenderer {
  // 峰值尺寸下预烘焙的烟花无旋转离屏 Canvas 精灵。
  private fireworkWedgeSprite: HTMLCanvasElement | null = null;
  // 预烘焙生成的 ImageBitmap 位图缓存，就绪后优先使用。
  private fireworkWedgeBitmap: ImageBitmap | null = null;
  private fireworkSpriteBasis = "";
  // 烟花消散期用于应用 destination-out 擦除掩膜的中间离屏画布。
  private fireworkScratch: HTMLCanvasElement | null = null;
  private fireworkScratchCtx: CanvasRenderingContext2D | null = null;
  // Touch 花瓣离屏精灵缓存，键格式为 "图层|变体|花瓣索引"。
  private touchPetalSprites = new Map<string, HTMLCanvasElement>();
  private touchSpriteBasis = "";

  constructor(context: RenderContext) {
    super(context);
  }

  /** 获取 Canvas backing store 相对逻辑坐标的缩放比例（包含设备像素比 DPR）。 */
  private getBackingScale(): number {
    return this.context.canvas.width / (this.context.centerX * 2);
  }

  /**
   * 获取（或懒加载烘焙）当前基准尺寸下的全分辨率烟花楔形离屏 Canvas 精灵。
   *
   * 当判定圈半径或缩放基准变化时触发重新烘焙，并异步生成对应的 ImageBitmap 缓存。
   *
   * @returns 烘焙完成的离屏 Canvas 元素。
   */
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

    // 楔形自中心辐射分布，角宽略小于间隙；外边缘保留 10% 径向渐变淡出。
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
          // 在极低不透明度与圆形裁剪区域内试画以预热纹理，避免产生画面可见痕迹。
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

  /**
   * 获取烟花渲染用的图像源。
   *
   * 优先返回已就绪的 ImageBitmap 位图缓存，未就绪或不受支持时回退至离屏 Canvas 精灵。
   *
   * @returns 可用于 drawImage 的 Canvas 或 ImageBitmap 对象。
   */
  private getWedgeImage(): HTMLCanvasElement | ImageBitmap {
    const sprite = this.getWedgeSprite();
    return this.fireworkWedgeBitmap ?? sprite;
  }

  /**
   * 使用矢量路径直接在目标上下文绘制烟花楔形。
   *
   * 用于小缩放比例阶段，几何形状与渐变配色与离屏精灵保持一致。
   *
   * @param ctx 目标 Canvas 渲染上下文。
   * @param x 中心点 X 坐标。
   * @param y 中心点 Y 坐标。
   * @param scale 烟花当前的缩放倍率。
   * @param rotation 旋转弧度角。
   */
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

  /**
   * 预热烟花渲染所需的离屏精灵、中间合成画布及绘制管线资源。
   *
   * 建议在首个烟花触发前调用以完成纹理预烘焙与管线初始化。
   */
  warmFireworkResources(): void {
    const backingScale = this.getBackingScale();
    const basis = `${this.context.radius}|${backingScale}`;
    if (this.fireworkSpriteBasis === basis && this.fireworkScratch) return;
    const sprite = this.getWedgeSprite();
    const half = this.context.radius * FIREWORK_EXTENT_RATIO;
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    const scratch = this.acquireFireworkScratch(sizePx);
    scratch.drawImage(sprite, 0, 0);
    // 预热消散期使用的 destination-out 径向渐变管线。
    scratch.globalCompositeOperation = "destination-out";
    const scratchGrad = scratch.createRadialGradient(0, 0, 0, 0, 0, 1);
    scratchGrad.addColorStop(0, "rgba(0,0,0,1)");
    scratchGrad.addColorStop(0.5, "rgba(0,0,0,1)");
    scratchGrad.addColorStop(1, "rgba(0,0,0,0)");
    scratch.fillStyle = scratchGrad;
    scratch.fillRect(0, 0, 2, 2);
    scratch.globalCompositeOperation = "source-over";
    // 在极低不透明度与圆形裁剪区域内预执行真实绘制管线，避免产生画面可见痕迹。
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

  /**
   * 获取指定像素尺寸的烟花中间合成画布上下文。
   *
   * 若尺寸不匹配则重新创建画布；返回前会重置变换矩阵并清空画布内容。
   *
   * @param sizePx 所需的画布边长像素尺寸。
   * @returns 处于默认变换且内容已清空的 2D 上下文。
   */
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

  /**
   * 绘制烟花中心的发光光晕（外圈光晕与内核高光）。
   *
   * 在独立的 Canvas 状态下使用 lighter 加法混合叠加渲染；当 growT < 0 时直接返回。
   *
   * @param ctx 目标 Canvas 渲染上下文。
   * @param x 中心点 X 坐标。
   * @param y 中心点 Y 坐标。
   * @param growT 距烟花开始膨胀的时间（秒）。
   */
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

    // 外圈光晕：峰值不透明度 0.7，与内核叠加避免过曝硬切。
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

  /**
   * 获取 Touch 花瓣精灵包围盒的逻辑半宽（包含花瓣本体尺寸、外层描边与阴影余量）。
   *
   * @returns 逻辑半宽尺寸。
   */
  private getTouchSpriteHalf(): number {
    return (
      this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3 +
      this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO) * 3 +
      this.scaleByRadius(8 / 300) +
      this.scaleByRadius(2 / 300)
    );
  }

  /**
   * 获取（或懒加载烘焙）指定图层与变体的单片 Touch 花瓣离屏 Canvas 精灵。
   *
   * @param layer 图层类型：`"sb"` 为阴影与黑色宽边，`"f"` 为色块填充，`"w"` 为白色轮廓。
   * @param kind 变体类型：`"n"` 为普通 Touch，`"s"` 为双押，`"h"` 为 Touch Hold。
   * @param i 花瓣索引（0 ~ 3），对应四个象限方位。
   * @returns 烘焙完成的花瓣离屏 Canvas 元素。
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
    // 阴影与白色轮廓层与音符颜色无关，双押与普通音符共用相同几何精灵。
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
        sctx.fillStyle = "rgba(0, 0, 0, 0.01)"; // 填充微小透明度以触发 Canvas 阴影渲染
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

  /**
   * 计算指定 Touch 传感器位置在画布上的二维绝对像素坐标。
   *
   * 内部自动处理水平镜像映射；中心区域 "C" 对应屏幕圆心。
   *
   * @param touchPosition 传感器区域标识（如 "C"、"A1"~"A8"、"B1"~"B8"、"D1"~"D8"、"E1"~"E8"）。
   * @returns 该传感器位置在画布上的二维坐标。
   */
  getTouchPosition(touchPosition: TouchPosition): Point2D {
    const mirroredPosition = this.mirrorTouchPosition(touchPosition);
    const region = mirroredPosition[0];
    const sensorNum = mirroredPosition.length > 1 ? parseInt(mirroredPosition[1]) : 0;

    const radiusRatio = TOUCH_SENSOR_RADII[region] || 0;
    const distance = this.context.radius * radiusRatio;

    if (region === "C") {
      return { x: this.context.centerX, y: this.context.centerY };
    }

    // D/E 与按钮对齐；A/B 偏移半个按钮。
    const angle =
      region === "D" || region === "E"
        ? BASE_ANGLE + (sensorNum - 1) * BUTTON_ANGLE_STEP
        : BASE_ANGLE + BUTTON_ANGLE_OFFSET + (sensorNum - 1) * BUTTON_ANGLE_STEP;

    return {
      x: this.context.centerX + Math.cos(angle) * distance,
      y: this.context.centerY + Math.sin(angle) * distance,
    };
  }

  /**
   * 渲染单个 Touch 或 Touch Hold 音符。
   *
   * 绘制内容包括登场收拢动画、Hold 环形进度指示器、花瓣轮廓与填充，以及中心圆点。
   * 若音符当前处于登场视野前或判定结束后的可见窗口外，则直接略过绘制。
   *
   * @param note Touch 音符或 Touch Hold 起始音符数据。
   * @param _currentBeat 当前节拍数。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @param isSimultaneous 是否与其他音符双押。
   */
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
      // 花瓣外侧黑边宽度，进度框/弧同步外扩保持视觉间距；跟随 strokeWidth 缩放。
      const progressBandPad = strokeWidth;
      const progressRadius = closedDist * progressScale * 1.8 + progressBandPad;
      const squareSize = closedDist * progressScale * 1.5 + progressBandPad;
      const r = Math.min(this.scaleByRadius(25 / 300), squareSize * 0.707); // 0.707 = sqrt(2)/2
      const endAngle = -Math.PI / 2 + progress * Math.PI * 2;

      ctx.save();

      // 圆角菱形 clip：上 → 右 → 下 → 左 角，每角用 quadratic 圆弧。
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

      // 进度弧 clip：从顶部按 progress 顺时针扇形。
      ctx.beginPath();
      ctx.moveTo(position.x, position.y);
      ctx.arc(position.x, position.y, progressRadius, -Math.PI / 2, endAngle, false);
      ctx.closePath();
      ctx.clip();

      // 放大花瓣：scale 后再径向外推 progressBandPad，贴到放大后的裁剪边界。
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
      // 按节拍动态着色模式下走实时矢量绘制路径。
      ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
      ctx.shadowBlur = this.scaleByRadius(8 / 300);
      ctx.shadowOffsetX = this.scaleByRadius(2 / 300);
      ctx.shadowOffsetY = this.scaleByRadius(2 / 300);
      ctx.fillStyle = "rgba(0, 0, 0, 0.01)"; // 填充微小透明度以触发 Canvas 阴影渲染

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

      // 外三角与内孔各绘制加宽黑色轮廓，再以填充色覆盖内侧光晕，保留外边缘与镂空。
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
      // 精灵分层绘制：依次绘制全部花瓣的阴影与黑边、填充、白边，保持图层叠加次序。
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
   *
   * 调用约束：`touches` 列表必须已预先按 `hasFirework` 过滤，并严格按 `fireworkTriggerMs` 升序排列。
   * 方法内部通过二分查找定位最近触发的一个有效烟花进行播放；若未触发或特效已播放完毕则不执行绘制。
   *
   * @param touches 具备烟花属性且按触发时刻升序排列的 Touch / Touch Hold 音符列表。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
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

    // 缩放曲线：t=0.1~0.5 阶段三次缓出至峰值，随后维持至掩膜擦除完毕。
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
      // 成长期无掩膜：小缩放比例使用实时矢量绘制，达到阈值后切换为离屏精灵。
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

    // 消散期：在中间画布上合成精灵与光晕，应用 destination-out 擦除掩膜后贴回主画布。
    const backingScale = this.getBackingScale();
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    const scratch = this.acquireFireworkScratch(sizePx);
    scratch.setTransform(backingScale, 0, 0, backingScale, sizePx / 2, sizePx / 2);
    scratch.rotate(rotation);
    scratch.drawImage(this.getWedgeImage(), -half, -half, half * 2, half * 2);
    scratch.rotate(-rotation);
    this.drawFireworkBalls(scratch, 0, 0, tSec - 0.1);

    // 掩膜 = 实心核心 + 羽化边缘，从中心扩张擦除。
    const outerR = (this.context.radius / 4.5) * scale;
    const holeSpan = FIREWORK_END_SEC - FIREWORK_HOLE_START_SEC;
    const linearU = Math.min(1, (tSec - FIREWORK_HOLE_START_SEC) / holeSpan);
    // 不透明度在前 20% 快速上升至 1 使掩膜尽早可见；半径采用 smoothstep 保持起停平滑。
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

  /**
   * 渲染同位置多押时的外层缺口圆角边框。
   *
   * 当同一位置可见 Touch 数量不少于 2 个时生效；3 个及以上时会额外绘制一层更大的外边框。
   *
   * @param position 边框中心点坐标。
   * @param isSimultaneous 是否与其他按键双押（决定边框颜色为金色或青色）。
   * @param visibleTouchCount 当前位置同时处于可见状态的 Touch 音符数量。
   */
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

  /**
   * 绘制单层带缺口的圆角矩形外框。
   *
   * @param x 中心点 X 坐标。
   * @param y 中心点 Y 坐标。
   * @param size 外框边长。
   * @param cornerRadius 矩形四角圆角半径。
   * @param color 描边颜色。
   * @param lineWidth 相对基准半径的描边线宽基数。
   */
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

    // 圆角方框，每条边中点被 gap 切开 → 8 段（每边两半 + 4 个圆角）。
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

  /**
   * 在当前 Canvas 路径中追加指定三个顶点与圆角半径的圆角三角形路径。
   *
   * 仅构建闭合路径，不执行 fill 或 stroke。当 cornerRadius <= 0 时退化为尖角三角形。
   *
   * @param x1 顶点 1 的 X 坐标。
   * @param y1 顶点 1 的 Y 坐标。
   * @param x2 顶点 2 的 X 坐标。
   * @param y2 顶点 2 的 Y 坐标。
   * @param x3 顶点 3 的 X 坐标。
   * @param y3 顶点 3 的 Y 坐标。
   * @param cornerRadius 圆角半径。
   */
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

      // 圆角半径上限 = 两边一半，避免过大触发回绕。
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
