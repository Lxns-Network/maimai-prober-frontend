import { BaseRenderer, RenderContext } from "../renderers/BaseRenderer";
import { ButtonPosition, HoldEndNote, HoldStartNote } from "../types";
import { HOLD_ACTIVE_CYCLE_MS } from "../utils/constants";

type Rgb = { r: number; g: number; b: number };

/**
 * Hold 按压波纹的数值来自录像测量的逐帧拟合，**不是**内置粒子配置参数：
 * 后者的生命周期、发射率、size/alpha 曲线和贴图剖面都与录像画面对不上
 * （按那套参数画出来是一坨几乎静止的实心光斑，实际测量为若干条细环持续外扩）。改回那套数值会重新引入该问题。
 *
 * 实测（2.3s / 138 帧录像，23 颗波纹平均，σ ≤ 0.0024R，单位为判定圈半径 R）：
 * - 发射不是匀速：每个 HOLD_ACTIVE_CYCLE_MS 循环内连发 3 颗（间隔 4 帧），然后空 8 帧。
 *   同屏颗数因此在 1~3 之间起伏；匀速发射会稳定在 2~3 颗，看起来就没有呼吸感。
 * - 环峰 0.1355R 出生，线性外扩 0.735 R/s，11 帧后在 0.2583R 消失
 * - alpha 峰值 1（按 R 通道对 age 2~10 线性拟合，斜率 -0.101/帧、age 11 归零），最初一帧维持峰值；
 *   录像测量中出生帧看起来更暗是波纹被 note 本体挡住，不是淡入。
 *   本引擎按产品决定把特效层统一画在 note 之上，因此出生帧不做遮挡处理。
 * - 单颗是细环而非实心圆，且环宽**按半径等比缩放**（FWHM/峰半径在 0.173R 与 0.223R 处同为 0.165）
 */
const RIPPLE_CYCLE = HOLD_ACTIVE_CYCLE_MS / 1000;
const RIPPLE_EMIT_OFFSETS = [0, 4 / 60, 8 / 60];
const RIPPLE_LIFETIME = 11 / 60;
const RIPPLE_ATTACK = 1 / 60;
const RIPPLE_PEAK_ALPHA = 1;
const RIPPLE_BIRTH_RADIUS_RATIO = 0.1355;
const RIPPLE_GROWTH_RATIO_PER_SEC = 0.735;
const RIPPLE_INNER_SCALE = 0.8;
const RIPPLE_OUTER_SCALE = 1.2;

/**
 * 波纹默认边缘色及环峰白化比例。
 * 实测环并不是纯黄：把 546 个环上采样点按通道回归，
 * 暗处（环缘）是 B/R 0.21 的饱和黄，亮处（环峰）升到 B/R 0.66 —— 环心是发白的。
 * 因此把传入色当作环缘色，环峰按 RIPPLE_CORE_WHITEN 往白里推。
 */
const RIPPLE_EDGE_COLOR: Rgb = { r: 1, g: 0.889, b: 0.213 };
const RIPPLE_CORE_WHITEN = 0.58;

/**
 * 单颗波纹的径向 alpha 剖面。
 * 横轴 0 = 环内缘、0.5 = 环峰、1 = 环外缘；由 14 段孤立单环的亮度剖面按各自峰半径归一化后平均得到，两侧对称。
 */
const RIPPLE_RING_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0],
  [0.063, 0.01],
  [0.125, 0.08],
  [0.188, 0.17],
  [0.25, 0.33],
  [0.313, 0.52],
  [0.375, 0.68],
  [0.438, 0.85],
  [0.5, 1],
  [0.563, 0.88],
  [0.625, 0.71],
  [0.688, 0.56],
  [0.75, 0.37],
  [0.813, 0.2],
  [0.875, 0.09],
  [0.938, 0.03],
  [1, 0.01],
];

const ALPHA_EPS = 0.02;

function rgba(color: Rgb, a: number): string {
  const aa = Math.max(0, Math.min(1, a));
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${aa})`;
}

type Wave = {
  peakRadius: number;
  alpha: number;
};

/**
 * Hold 按压波纹渲染器（按键 Hold 与 Touch Hold 共用）。
 * 仅负责按压时的扩散波纹；结束击打特效由 NoteRenderer 负责、MainRenderer 统一调度。
 */
export class HoldEffectRenderer extends BaseRenderer {
  constructor(context: RenderContext) {
    super(context);
  }

  /**
   * 渲染按住状态下的 Hold 持续波纹（时间处于 [timingMs, holdEnd.timingMs) 时绘制）。
   * holdEndMap 键需由 MainRenderer.getHoldEndKey 生成；[startIndex, endIndex) 为二分裁剪后的索引区间。
   */
  renderHoldPressEffects(
    holds: readonly HoldStartNote[],
    holdEndMap: ReadonlyMap<string, HoldEndNote>,
    currentTimeMs: number,
    getHoldEndKey: (position: ButtonPosition, holdStartTiming: number) => string,
    color: Rgb = RIPPLE_EDGE_COLOR,
    startIndex = 0,
    endIndex = holds.length,
  ): void {
    if (!holds.length) return;

    for (let i = startIndex; i < endIndex; i++) {
      const hold = holds[i];
      const holdEnd = holdEndMap.get(getHoldEndKey(hold.position, hold.timing));
      if (!holdEnd) continue;
      if (currentTimeMs < hold.timingMs || currentTimeMs >= holdEnd.timingMs) continue;

      const origin = this.getButtonPosition(hold.position);
      this.renderPressRippleAt(
        origin.x,
        origin.y,
        hold.timingMs,
        holdEnd.timingMs,
        currentTimeMs,
        color,
      );
    }
  }

  /**
   * 在指定位置绘制 Hold 按压波纹（按键 Hold 与 Touch Hold 共用）。
   * 仅在 [startMs, endMs) 期间绘制；使用 screen 混合模式，内部通过 save/restore 隔离状态。
   */
  renderPressRippleAt(
    x: number,
    y: number,
    startMs: number,
    endMs: number,
    currentTimeMs: number,
    color: Rgb = RIPPLE_EDGE_COLOR,
  ): void {
    if (currentTimeMs < startMs || currentTimeMs >= endMs) return;
    if (this.context.radius <= 0) return;

    const ctx = this.context.ctx;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const elapsedSec = (currentTimeMs - startMs) / 1000;
    this.drawRipples(ctx, x, y, elapsedSec, color);
    ctx.restore();
  }

  /** 枚举当前存活的波纹并按半径从大到小绘制。 */
  private drawRipples(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    elapsedSec: number,
    color: Rgb,
  ): void {
    // 每个循环按 RIPPLE_EMIT_OFFSETS 发 3 颗。循环下标可为负：刚按下时前一轮的残余波纹仍在屏上，跳过负数开头会缺一截。
    // 相位锚在按下时刻（录像采样从 hold 中途开始，无法直接观测相对按下的绝对初始相位）。
    const firstCycle = Math.floor((elapsedSec - RIPPLE_LIFETIME) / RIPPLE_CYCLE);
    const lastCycle = Math.floor(elapsedSec / RIPPLE_CYCLE);
    const radiusPx = this.context.radius;

    const waves: Wave[] = [];

    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      for (let i = 0; i < RIPPLE_EMIT_OFFSETS.length; i++) {
        const age = elapsedSec - (cycle * RIPPLE_CYCLE + RIPPLE_EMIT_OFFSETS[i]);
        if (age < 0 || age >= RIPPLE_LIFETIME) continue;

        const peakRadius =
          (RIPPLE_BIRTH_RADIUS_RATIO + RIPPLE_GROWTH_RATIO_PER_SEC * age) * radiusPx;
        const alpha =
          RIPPLE_PEAK_ALPHA *
          Math.min(1, (RIPPLE_LIFETIME - age) / (RIPPLE_LIFETIME - RIPPLE_ATTACK));
        if (peakRadius < 0.75 || alpha <= ALPHA_EPS) continue;

        waves.push({ peakRadius, alpha });
      }
    }

    // 按半径降序绘制：大圈先画，让内层较新的小波纹叠在外层老波纹上面
    waves.sort((a, b) => b.peakRadius - a.peakRadius);

    for (let i = 0; i < waves.length; i++) {
      const w = waves[i];
      this.drawRippleRing(ctx, ox, oy, w.peakRadius, color, w.alpha);
    }
  }

  /**
   * 绘制单颗波纹环（环内透明）。
   * 环宽按峰半径等比缩放（实测 FWHM/峰半径恒为 0.165，非固定像素宽）。
   */
  private drawRippleRing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    peakRadius: number,
    color: Rgb,
    alpha: number,
  ): void {
    const inner = peakRadius * RIPPLE_INNER_SCALE;
    const outer = peakRadius * RIPPLE_OUTER_SCALE;
    if (outer - inner < 0.5 || alpha <= ALPHA_EPS) return;

    const texture = ctx.createRadialGradient(x, y, inner, x, y, outer);
    // 发白程度随实际亮度衰减：老波纹变暗时会退回边缘黄，只看剖面值会导致快消失时环心依然发白
    const brightness = alpha / RIPPLE_PEAK_ALPHA;
    for (const [stop, value] of RIPPLE_RING_PROFILE) {
      const whiten = RIPPLE_CORE_WHITEN * value * brightness * brightness;
      const tint = {
        r: color.r + (1 - color.r) * whiten,
        g: color.g + (1 - color.g) * whiten,
        b: color.b + (1 - color.b) * whiten,
      };
      texture.addColorStop(stop, rgba(tint, value * alpha));
    }

    ctx.fillStyle = texture;
    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    if (inner > 0.15) ctx.arc(x, y, inner, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
  }
}

export default HoldEffectRenderer;
