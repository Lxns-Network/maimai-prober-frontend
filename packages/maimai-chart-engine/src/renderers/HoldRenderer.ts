import { BaseRenderer, RenderContext } from "./BaseRenderer";
import { HoldStartNote, HoldEndNote, NoteRenderPosition, ButtonPosition, Point2D } from "../types";
import {
  NOTE_SIZE_RATIO,
  HOLD_WIDTH_RATIO,
  HOLD_INNER_RATIO,
  HOLD_ACTIVE_BRIGHTNESS_CURVE,
  HOLD_ACTIVE_BRIGHTNESS_MAX,
  HOLD_ACTIVE_BRIGHTNESS_MIN,
  HOLD_ACTIVE_GLOW_RAMP,
  HOLD_ACTIVE_CYCLE_MS,
  HOLD_ACTIVE_GLOW_RATIO,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  NOTE_LIGHTEN_RATIO,
} from "../utils/constants";

/**
 * 计算 Hold 按住期间本体的亮度倍率。动画相位以 HOLD_ACTIVE_CYCLE_MS 为周期循环。
 *
 * @param elapsedMs 距音符被按下的时间（毫秒）。小于 0 时表示音符尚未被按下，返回 1。
 * @returns 亮度缩放倍率。
 */
function activeBodyBrightness(elapsedMs: number): number {
  if (elapsedMs < 0) return 1;
  const steps = HOLD_ACTIVE_BRIGHTNESS_CURVE.length;
  const position = ((elapsedMs % HOLD_ACTIVE_CYCLE_MS) / HOLD_ACTIVE_CYCLE_MS) * steps;
  const index = Math.floor(position);
  const t = position - index;
  const a = HOLD_ACTIVE_BRIGHTNESS_CURVE[index % steps];
  const b = HOLD_ACTIVE_BRIGHTNESS_CURVE[(index + 1) % steps];
  return (
    HOLD_ACTIVE_BRIGHTNESS_MIN +
    (a + (b - a) * t) * (HOLD_ACTIVE_BRIGHTNESS_MAX - HOLD_ACTIVE_BRIGHTNESS_MIN)
  );
}

/**
 * Hold 音符渲染器。
 * 负责 Hold 音符（含普通 Hold 与 EX Hold）的本体多边形、内外描边、按压发光及明暗呼吸效果的绘制。
 */
export class HoldRenderer extends BaseRenderer {
  constructor(context: RenderContext) {
    super(context);
  }

  /**
   * 渲染单个 Hold 音符（包含本体多边形、内外轮廓描边、EX 边框以及按压状态下的头部发光与明暗呼吸效果）。
   *
   * 绘制在独立的 Canvas 状态上下文中执行。当结束端尚未进入视野（`endPosition.visible` 为 false）时，
   * 会以音符登场起点作为临时尾端渲染。
   *
   * @param startPosition 起始音符渲染位置与缩放。
   * @param endPosition 结束音符渲染位置与缩放。
   * @param buttonPosition 音符所在的按键方位。
   * @param color 渲染用的渐变颜色对 [主色/亮色, 暗色]。
   * @param isEx 是否为 EX 音符（绘制专属外层边框）。
   * @param startNote 起始音符数据，传入 null 时跳过登场展开与按压状态判定。
   * @param endNote 结束音符数据，传入 null 时跳过按压状态判定与终点圆点渲染。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @param isBreakHold 是否为 Break 属性音符。
   * @param isSimultaneous 是否与其他音符双押。
   * @param exScaleFactor EX 外边框的缩放系数。
   */
  renderHold(
    startPosition: NoteRenderPosition,
    endPosition: NoteRenderPosition,
    buttonPosition: ButtonPosition,
    color: [string, string],
    isEx: boolean = false,
    startNote: HoldStartNote | null = null,
    endNote: HoldEndNote | null = null,
    currentTimeMs: number = 0,
    isBreakHold: boolean = false,
    isSimultaneous: boolean = false,
    exScaleFactor: number = 1,
  ): void {
    const angle = this.getButtonAngle(buttonPosition);
    const baseSize = this.scaleByRadius(NOTE_SIZE_RATIO) * HOLD_WIDTH_RATIO;
    const holdWidth = baseSize * startPosition.scale;

    const startX = startPosition.x;
    const startY = startPosition.y;

    let endX: number;
    let endY: number;
    if (endPosition.visible) {
      endX = endPosition.x;
      endY = endPosition.y;
    } else {
      // 终点尚未进入视野时，以音符登场起点作为临时尾端，呈现音符刚从屏幕中心延伸出的状态。
      const dir = startNote ? this.getNoteApproachDir(startNote) : 1;
      const approachDist = (1 + dir * -0.75) * this.context.radius;
      endX = this.context.centerX + Math.cos(angle) * approachDist;
      endY = this.context.centerY + Math.sin(angle) * approachDist;
    }

    const tipAngle = angle;
    const leftAngle = angle + Math.PI / 3;
    const rightAngle = angle - Math.PI / 3;
    const backAngle = angle + Math.PI;
    const backLeftAngle = angle + Math.PI - Math.PI / 3;
    const backRightAngle = angle + Math.PI + Math.PI / 3;

    const startTip: Point2D = {
      x: startX + Math.cos(tipAngle) * holdWidth,
      y: startY + Math.sin(tipAngle) * holdWidth,
    };
    const startLeft: Point2D = {
      x: startX + Math.cos(leftAngle) * holdWidth,
      y: startY + Math.sin(leftAngle) * holdWidth,
    };
    const startRight: Point2D = {
      x: startX + Math.cos(rightAngle) * holdWidth,
      y: startY + Math.sin(rightAngle) * holdWidth,
    };

    // 登场前半程尾端宽度从 0 展开至基准尺寸，后半程保持全宽。
    let endScale = 1;
    if (startNote && endNote && currentTimeMs) {
      const approachHalf = this.getNoteApproachTimeMs(startNote) / 2;
      const timeDiff = startNote.timingMs - currentTimeMs;
      if (timeDiff > approachHalf) {
        endScale = Math.max(0, 1 - (timeDiff - approachHalf) / approachHalf);
      }
    }
    const endWidth = baseSize * endScale;

    const endBack: Point2D = {
      x: endX + Math.cos(backAngle) * endWidth,
      y: endY + Math.sin(backAngle) * endWidth,
    };
    const endBackLeft: Point2D = {
      x: endX + Math.cos(backLeftAngle) * endWidth,
      y: endY + Math.sin(backLeftAngle) * endWidth,
    };
    const endBackRight: Point2D = {
      x: endX + Math.cos(backRightAngle) * endWidth,
      y: endY + Math.sin(backRightAngle) * endWidth,
    };

    const innerRatio = HOLD_INNER_RATIO;
    const innerStartTip: Point2D = {
      x: startX + Math.cos(tipAngle) * holdWidth * innerRatio,
      y: startY + Math.sin(tipAngle) * holdWidth * innerRatio,
    };
    const innerStartLeft: Point2D = {
      x: startX + Math.cos(leftAngle) * holdWidth * innerRatio,
      y: startY + Math.sin(leftAngle) * holdWidth * innerRatio,
    };
    const innerStartRight: Point2D = {
      x: startX + Math.cos(rightAngle) * holdWidth * innerRatio,
      y: startY + Math.sin(rightAngle) * holdWidth * innerRatio,
    };

    const innerEndBack: Point2D = {
      x: endX + Math.cos(backAngle) * endWidth * innerRatio,
      y: endY + Math.sin(backAngle) * endWidth * innerRatio,
    };
    const innerEndBackLeft: Point2D = {
      x: endX + Math.cos(backLeftAngle) * endWidth * innerRatio,
      y: endY + Math.sin(backLeftAngle) * endWidth * innerRatio,
    };
    const innerEndBackRight: Point2D = {
      x: endX + Math.cos(backRightAngle) * endWidth * innerRatio,
      y: endY + Math.sin(backRightAngle) * endWidth * innerRatio,
    };

    this.withContext(() => {
      const ctx = this.context.ctx;

      if (isEx) {
        const exScale = 1.19 * exScaleFactor;
        let exColor: string;
        if (isBreakHold) {
          exColor = COLORS.EX_OVERLAY_BREAK;
        } else if (isSimultaneous) {
          exColor = COLORS.EX_OVERLAY_SIMULTANEOUS;
        } else {
          exColor = COLORS.EX_OVERLAY_NORMAL;
        }

        const exStartTip = this.scalePoint(startX, startY, startTip, exScale);
        const exStartLeft = this.scalePoint(startX, startY, startLeft, exScale);
        const exStartRight = this.scalePoint(startX, startY, startRight, exScale);
        const exEndBack = this.scalePoint(endX, endY, endBack, exScale);
        const exEndBackLeft = this.scalePoint(endX, endY, endBackLeft, exScale);
        const exEndBackRight = this.scalePoint(endX, endY, endBackRight, exScale);

        ctx.beginPath();
        ctx.moveTo(exStartTip.x, exStartTip.y);
        ctx.lineTo(exStartLeft.x, exStartLeft.y);
        ctx.lineTo(exEndBackLeft.x, exEndBackLeft.y);
        ctx.lineTo(exEndBack.x, exEndBack.y);
        ctx.lineTo(exEndBackRight.x, exEndBackRight.y);
        ctx.lineTo(exStartRight.x, exStartRight.y);
        ctx.closePath();

        // 内圈使用反向缠绕路径，利用 Canvas 非零环绕规则挖空内部形成镂空边框。
        ctx.moveTo(startTip.x, startTip.y);
        ctx.lineTo(startRight.x, startRight.y);
        ctx.lineTo(endBackRight.x, endBackRight.y);
        ctx.lineTo(endBack.x, endBack.y);
        ctx.lineTo(endBackLeft.x, endBackLeft.y);
        ctx.lineTo(startLeft.x, startLeft.y);
        ctx.closePath();

        ctx.fillStyle = exColor;
        ctx.fill();
      }

      const isPressed =
        startNote !== null &&
        endNote !== null &&
        currentTimeMs >= startNote.timingMs &&
        currentTimeMs < endNote.timingMs;

      const brightness = isPressed ? activeBodyBrightness(currentTimeMs - startNote!.timingMs) : 1;
      const tint = (hex: string) =>
        brightness === 1 ? hex : this.scaleHexBrightness(hex, brightness);
      const outlineColor = tint(COLORS.WHITE);

      const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);

      // 先绘制加宽的黑色描边底，后续的分段色块填充会覆盖其内侧半幅，使最终显露的外边缘黑边宽度接近基准描边。
      // EX 音符外沿已有外框，因此跳过外轮廓黑底，仅保留内轮廓。
      if (!isEx) {
        ctx.beginPath();
        ctx.moveTo(startTip.x, startTip.y);
        ctx.lineTo(startLeft.x, startLeft.y);
        ctx.lineTo(endBackLeft.x, endBackLeft.y);
        ctx.lineTo(endBack.x, endBack.y);
        ctx.lineTo(endBackRight.x, endBackRight.y);
        ctx.lineTo(startRight.x, startRight.y);
        ctx.closePath();
        this.stroke(COLORS.BLACK, strokeWidth * 3);
      }

      ctx.beginPath();
      ctx.moveTo(innerStartTip.x, innerStartTip.y);
      ctx.lineTo(innerStartLeft.x, innerStartLeft.y);
      ctx.lineTo(innerEndBackLeft.x, innerEndBackLeft.y);
      ctx.lineTo(innerEndBack.x, innerEndBack.y);
      ctx.lineTo(innerEndBackRight.x, innerEndBackRight.y);
      ctx.lineTo(innerStartRight.x, innerStartRight.y);
      ctx.closePath();
      this.stroke(COLORS.BLACK, strokeWidth * 3);

      const lightColor = tint(this.mixHexColor(color[0], "#ffffff", NOTE_LIGHTEN_RATIO));
      const bodyColor = tint(color[1]);
      const segments = [
        { os: startTip, oe: startLeft, is: innerStartTip, ie: innerStartLeft },
        { os: startLeft, oe: endBackLeft, is: innerStartLeft, ie: innerEndBackLeft },
        { os: endBackLeft, oe: endBack, is: innerEndBackLeft, ie: innerEndBack },
        { os: endBack, oe: endBackRight, is: innerEndBack, ie: innerEndBackRight },
        { os: endBackRight, oe: startRight, is: innerEndBackRight, ie: innerStartRight },
        { os: startRight, oe: startTip, is: innerStartRight, ie: innerStartTip },
      ];

      for (const { os, oe, is: innerS, ie: innerE } of segments) {
        const gradient = ctx.createLinearGradient(os.x, os.y, oe.x, oe.y);
        gradient.addColorStop(0, lightColor);
        gradient.addColorStop(1, bodyColor);

        ctx.beginPath();
        ctx.moveTo(os.x, os.y);
        ctx.lineTo(oe.x, oe.y);
        ctx.lineTo(innerE.x, innerE.y);
        ctx.lineTo(innerS.x, innerS.y);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.moveTo(startTip.x, startTip.y);
      ctx.lineTo(startLeft.x, startLeft.y);
      ctx.lineTo(endBackLeft.x, endBackLeft.y);
      ctx.lineTo(endBack.x, endBack.y);
      ctx.lineTo(endBackRight.x, endBackRight.y);
      ctx.lineTo(startRight.x, startRight.y);
      ctx.closePath();
      this.stroke(outlineColor, strokeWidth);

      ctx.beginPath();
      ctx.moveTo(innerStartTip.x, innerStartTip.y);
      ctx.lineTo(innerStartLeft.x, innerStartLeft.y);
      ctx.lineTo(innerEndBackLeft.x, innerEndBackLeft.y);
      ctx.lineTo(innerEndBack.x, innerEndBack.y);
      ctx.lineTo(innerEndBackRight.x, innerEndBackRight.y);
      ctx.lineTo(innerStartRight.x, innerStartRight.y);
      ctx.closePath();
      this.stroke(outlineColor, strokeWidth);

      if (isPressed) {
        this.drawActiveHeadGlow(startX, startY, color[0]);
      } else {
        const centerSize = holdWidth * 0.15;
        ctx.beginPath();
        ctx.arc(startX, startY, centerSize, 0, Math.PI * 2);
        ctx.fillStyle = color[0];
        ctx.fill();
      }

      // 待尾端在登场过程中完全展开后，才绘制终点中心圆点。
      if (endPosition.visible && endNote && currentTimeMs) {
        const approachHalf = this.getNoteApproachTimeMs(endNote) / 2;
        const endTimeDiff = endNote.timingMs - currentTimeMs;
        if (endTimeDiff <= approachHalf) {
          const endCenterSize = endWidth * 0.15;
          ctx.beginPath();
          ctx.arc(endX, endY, endCenterSize, 0, Math.PI * 2);
          ctx.fillStyle = tint(color[0]);
          ctx.fill();
        }
      }
    });
  }

  /**
   * 绘制 Hold 处于按压状态时头部的径向渐变辉光效果。
   *
   * 辉光由中心向外按预设色阶阶梯径向淡出。当计算出的辉光外径小于 1 像素时不执行绘制。
   * 辉光亮度保持恒定，不随本体明暗周期呼吸。
   *
   * @param x 辉光中心的 X 坐标。
   * @param y 辉光中心的 Y 坐标。
   * @param noteColor 音符基础颜色，用于生成渐变各色阶。
   */
  private drawActiveHeadGlow(x: number, y: number, noteColor: string): void {
    const outer = this.scaleByRadius(HOLD_ACTIVE_GLOW_RATIO);
    if (outer < 1) return;

    const base = [1, 3, 5].map((i) => Number.parseInt(noteColor.slice(i, i + 2), 16));
    const ctx = this.context.ctx;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, outer);
    for (const [stop, mr, mg, mb] of HOLD_ACTIVE_GLOW_RAMP) {
      const ch = (value: number, mul: number) =>
        Math.max(0, Math.min(255, Math.round(value * mul)));
      gradient.addColorStop(stop, `rgb(${ch(base[0], mr)},${ch(base[1], mg)},${ch(base[2], mb)})`);
    }
    gradient.addColorStop(1, "rgba(0,0,0,0)");

    ctx.beginPath();
    ctx.arc(x, y, outer, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  /**
   * 以指定中心点为基准，对二维点坐标进行缩放。
   *
   * @param centerX 缩放中心 X 坐标。
   * @param centerY 缩放中心 Y 坐标。
   * @param point 待缩放的目标点。
   * @param scale 缩放倍率。
   * @returns 缩放后的新坐标点。
   */
  private scalePoint(centerX: number, centerY: number, point: Point2D, scale: number): Point2D {
    return {
      x: centerX + (point.x - centerX) * scale,
      y: centerY + (point.y - centerY) * scale,
    };
  }
}

export default HoldRenderer;
