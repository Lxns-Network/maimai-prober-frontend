import { BaseRenderer, type RenderContext } from "../renderers/BaseRenderer";
import type { ButtonPosition, Note } from "../types";
import {
  NOTE_SIZE_RATIO,
  NOTE_STROKE_WIDTH_RATIO,
  NOTE_HIT_EFFECT_DURATION_MS,
} from "../utils/constants";

// 单颗六边形/星 stamp 的超采样与 glow 参数。集群位姿按 progress 实时摆。
const HIT_FX_SPRITE_SUPERSAMPLE = 2;
const HIT_FX_CORE_BLUR_RATIO = (4 / 300) * 0.7;
const HIT_FX_HALO_BLUR_SCALE = 2.4;
const HIT_FX_HALO_ALPHA = 0.55;

/**
 * 精灵合成范围按实际墨迹算：留白的全透明像素每帧都会参与合成，stamp 直接收紧画布。
 * 目标尺寸由 sprite.width 反推，图形与 refR 同比，渲染半径与 half 无关。
 *
 * TAIL 是 `ctx.filter = blur(N)` 实际扩散到的半径与 N 的比值，实测值：Chromium 下
 * 描边外沿到 alpha 归零处为 2.43×N（六边形）/ 2.27×N（星），不是按 σ=N/2 推的 1.5×。
 * 取小了会把 halo 外圈直接切掉——1.5× 时逐像素对照有约 1000 个像素单向变暗。
 */
const SPRITE_BLUR_TAIL_RATIO = 2.5;
const SPRITE_AA_MARGIN_PX = 1;

type HitEffectShape = "hexagon" | "star";

/** 按键命中特效渲染器，负责六边形/星 stamp 的烘焙与按进度摆放的星群绘制。 */
export class TapHitEffectRenderer extends BaseRenderer {
  // 命中特效 stamp 缓存（六边形/星各一张含 glow），radius/backingScale/color 变化时失效
  private hitEffectShapeCache = new Map<HitEffectShape, HTMLCanvasElement>();
  private hitEffectShapeBasis = "";

  constructor(context: RenderContext) {
    super(context);
  }

  /** 计算命中特效坐标与进度（progress ∈ [0, 1]）；未激活返回 progress: -1。 */
  calculateHitEffectPosition(
    note: Note,
    currentTimeMs: number,
  ): { x: number; y: number; progress: number } {
    const position = note.position as ButtonPosition;
    const angle = this.getButtonAngle(position);
    const timeDiff = currentTimeMs - note.timingMs;
    if (timeDiff < 0 || timeDiff > NOTE_HIT_EFFECT_DURATION_MS) return { x: 0, y: 0, progress: -1 };
    return {
      x: this.context.centerX + Math.cos(angle) * this.context.radius,
      y: this.context.centerY + Math.sin(angle) * this.context.radius,
      progress: timeDiff / NOTE_HIT_EFFECT_DURATION_MS,
    };
  }

  private hexagonSubPath(
    p: Path2D,
    centerX: number,
    centerY: number,
    radius: number,
    angle: number,
  ): void {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + angle;
      const px = centerX + radius * Math.cos(a);
      const py = centerY + radius * Math.sin(a);
      if (i === 0) p.moveTo(px, py);
      else p.lineTo(px, py);
    }
    p.closePath();
  }

  private starSubPath(
    p: Path2D,
    centerX: number,
    centerY: number,
    spikesCount: number,
    outerRadius: number,
    innerRadius: number,
    angle: number,
  ): void {
    const step = Math.PI / spikesCount;
    let a = (Math.PI / 2) * 3 + angle;
    for (let i = 0; i < spikesCount; i++) {
      const ox = centerX + Math.cos(a) * outerRadius;
      const oy = centerY + Math.sin(a) * outerRadius;
      if (i === 0) p.moveTo(ox, oy);
      else p.lineTo(ox, oy);
      a += step;
      p.lineTo(centerX + Math.cos(a) * innerRadius, centerY + Math.sin(a) * innerRadius);
      a += step;
    }
    p.closePath();
  }

  /** 渲染按键命中特效（朝向沿按键方向向外）。 */
  renderTapHitEffect(
    x: number,
    y: number,
    position: ButtonPosition,
    color: string,
    progress: number,
    type: HitEffectShape,
  ): void {
    this.renderHitEffectAt(x, y, this.getButtonAngle(position), color, progress, type);
  }

  /**
   * 渲染命中特效本体。angle 决定星群朝向（按键音符向外，Touch Hold 指向圆心）。
   * progress ∈ [0, 1] 为归一化进度，超出区间或透明度归零跳过。
   */
  renderHitEffectAt(
    x: number,
    y: number,
    angle: number,
    color: string,
    progress: number,
    type: HitEffectShape,
  ): void {
    const scale = 1 - 0.75 * (progress - 1) * (progress - 1);
    const alpha = 1 - 4 * (progress - 0.5) * (progress - 0.5);
    if (alpha <= 0 || scale <= 0) return;

    const subAng = 1 - (progress - 1) * (progress - 1);
    const subRad = Math.max(0, Math.min(1, 1 - (8 / 9) * progress * progress));
    const baseR = this.scaleByRadius(NOTE_SIZE_RATIO) * 1.36 * 1.5;
    if (baseR <= 0) return;

    const r0 = baseR * scale;
    const rSmall = r0 * 0.7;
    const rBig = r0 * 0.8;
    const off = baseR * subRad * 0.7;
    const sprite = this.getHitEffectShapeSprite(type, color);
    const logical = sprite.width / HIT_FX_SPRITE_SUPERSAMPLE;
    const destSize = (r: number) => logical * (r / baseR);

    const ctx = this.context.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    const blit = (lx: number, ly: number, r: number) => {
      const s = destSize(r);
      ctx.drawImage(sprite, lx - s / 2, ly - s / 2, s, s);
    };
    blit(0, 0, r0);
    const sub1 = Math.PI / 6;
    const sub2 = -Math.PI / 6;
    const a1a = sub1 + Math.PI * subAng;
    blit(Math.cos(a1a) * off, Math.sin(a1a) * off * 0.7, rSmall);
    const a1b = sub1 + Math.PI * (1 + subAng);
    blit(Math.cos(a1b) * off, Math.sin(a1b) * off, rSmall);
    const a2a = sub2 - Math.PI * subAng;
    blit(Math.cos(a2a) * off, Math.sin(a2a) * off, rBig);
    const a2b = sub2 + Math.PI * (1 - subAng);
    blit(Math.cos(a2b) * off, Math.sin(a2b) * off, rBig);
    ctx.restore();
  }

  /**
   * 烘焙单颗六边形/星 stamp（核心 blur + 低 alpha halo）；热路径按 progress 摆 5 份。
   * filter 半径按超采样 backing 像素计算；live 热路径严禁直接设 ctx.filter 造成掉帧。
   * 判定圈半径、backingScale 或颜色变化时缓存失效。
   */
  private getHitEffectShapeSprite(type: HitEffectShape, color: string): HTMLCanvasElement {
    const cx = this.context.centerX;
    const backingScale = cx > 0 ? this.context.canvas.width / (cx * 2) : 1;
    const basis = `${this.context.radius}|${backingScale}|${color}`;
    if (basis !== this.hitEffectShapeBasis) {
      this.hitEffectShapeCache.clear();
      this.hitEffectShapeBasis = basis;
    }
    const cached = this.hitEffectShapeCache.get(type);
    if (cached) return cached;

    const refR = this.scaleByRadius(NOTE_SIZE_RATIO) * 1.36 * 1.5;
    const coreBlurPx = this.scaleByRadius(HIT_FX_CORE_BLUR_RATIO) * HIT_FX_SPRITE_SUPERSAMPLE;
    const haloBlurPx = coreBlurPx * HIT_FX_HALO_BLUR_SCALE;
    // 墨迹 = 图形外顶点 + 圆角 join 的半个描边 + halo 高斯尾（blur 以超采样像素计，换回逻辑像素）。
    const strokeHalf = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
    const half =
      refR +
      strokeHalf +
      (haloBlurPx / HIT_FX_SPRITE_SUPERSAMPLE) * SPRITE_BLUR_TAIL_RATIO +
      SPRITE_AA_MARGIN_PX;
    const sprite = document.createElement("canvas");
    sprite.width = sprite.height = Math.max(2, Math.ceil(half * 2 * HIT_FX_SPRITE_SUPERSAMPLE));
    const offscreenCtx = sprite.getContext("2d")!;
    offscreenCtx.setTransform(
      HIT_FX_SPRITE_SUPERSAMPLE,
      0,
      0,
      HIT_FX_SPRITE_SUPERSAMPLE,
      sprite.width / 2,
      sprite.height / 2,
    );
    const path = new Path2D();
    if (type === "star") {
      this.starSubPath(path, 0, 0, 5, refR, refR * 0.5, Math.PI);
    } else {
      this.hexagonSubPath(path, 0, 0, refR, 0);
    }
    offscreenCtx.strokeStyle = color;
    offscreenCtx.lineWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO) * 2;
    offscreenCtx.lineJoin = "round";
    if (haloBlurPx >= 0.5) {
      offscreenCtx.save();
      offscreenCtx.globalAlpha = HIT_FX_HALO_ALPHA;
      offscreenCtx.filter = `blur(${haloBlurPx}px)`;
      offscreenCtx.stroke(path);
      offscreenCtx.restore();
    }
    if (coreBlurPx >= 0.5) offscreenCtx.filter = `blur(${coreBlurPx}px)`;
    offscreenCtx.stroke(path);
    this.hitEffectShapeCache.set(type, sprite);
    return sprite;
  }
}
