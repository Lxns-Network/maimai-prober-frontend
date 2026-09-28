import { BaseRenderer, type RenderContext } from "../renderers/BaseRenderer";
import type { TouchNote, TouchHoldStartNote } from "../types";

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

/** Touch 烟花特效渲染器，负责楔形贴图烘焙、成长期矢量绘制与消散期擦除合成。 */
export class TouchFireworkRenderer extends BaseRenderer {
  // 烟花贴图缓存（峰值尺寸离屏 Canvas 与 ImageBitmap）
  private fireworkWedgeSprite: HTMLCanvasElement | null = null;
  private fireworkWedgeBitmap: ImageBitmap | null = null;
  private fireworkSpriteBasis = "";
  // 烟花消散期 destination-out 擦除掩膜中间画布
  private fireworkScratch: HTMLCanvasElement | null = null;
  private fireworkScratchCtx: CanvasRenderingContext2D | null = null;

  constructor(context: RenderContext) {
    super(context);
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
}
