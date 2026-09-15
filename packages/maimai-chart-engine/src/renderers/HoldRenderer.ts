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

/** 按住期间本体的呼吸亮度倍率，按 HOLD_ACTIVE_CYCLE_MS 周期循环；未按下（< 0）返回 1。 */
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

/** 负责 Hold（含 EX Hold）的本体多边形、描边、按压发光与呼吸效果绘制。 */
export class HoldRenderer extends BaseRenderer {
  constructor(context: RenderContext) {
    super(context);
  }

  /**
   * 渲染单个 Hold（含本体、内外描边、EX 外框、头部发光及按压呼吸）。
   * 在独立的 Canvas 上下文中绘制。尾端未进视野时以登场起点作临时尾端；
   * startNote/endNote 传 null 时跳过展开动画与按压判定。
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
      // 尾端未进视野时，以登场起点为临时尾端，呈现刚从圆心延伸出的效果
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

    // 登场前半程尾端宽度从 0 展开到基准尺寸，后半程保持全宽
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

        // 内圈反向缠绕，利用非零环绕规则挖出镂空边框
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

      // 先画 3 倍宽黑底，后续填充会盖住内侧半边，露出的外黑边刚好是标准线宽；EX 自身已有外框故只留内轮廓
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

      // 尾端展开完毕后才绘制终点圆点
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
   * 绘制 Hold 按压时的头部径向渐变辉光。
   * 亮度保持恒定，不随本体呼吸；外径 < 1px 时跳过。
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

  private scalePoint(centerX: number, centerY: number, point: Point2D, scale: number): Point2D {
    return {
      x: centerX + (point.x - centerX) * scale,
      y: centerY + (point.y - centerY) * scale,
    };
  }
}

export default HoldRenderer;
