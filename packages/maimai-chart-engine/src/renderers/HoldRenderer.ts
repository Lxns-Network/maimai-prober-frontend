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
 * 按住期间本体的亮度倍率，相位与波纹发射共用 HOLD_ACTIVE_CYCLE_MS 这一个时钟。
 * elapsedMs 是距按下的时间，可为负（note 还在接近），此时返回 1。
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

export class HoldRenderer extends BaseRenderer {
  constructor(context: RenderContext) {
    super(context);
  }

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
      // 终点不可见时退回到 approach 起始距离上，画一截"未展开"的 hold。
      const dir = startNote ? this.getNoteApproachDir(startNote) : 1;
      const approachDist = (1 + dir * -0.75) * this.context.radius;
      endX = this.context.centerX + Math.cos(angle) * approachDist;
      endY = this.context.centerY + Math.sin(angle) * approachDist;
    }

    // 六边形顶点角度（前/左/右 + 背面三角）。
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

    // 终点宽度在 approach 后半段从 0 拉伸到 baseSize，营造"展开"动画。
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

        // EX 套：外六向外扩 exScale，再用原六挖空 = 一圈边框。
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

        // 内挖反向缠绕。
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

      // 按住时整条本体随 HOLD_ACTIVE_CYCLE_MS 一起明暗呼吸（实测 ±10%，沿长度均匀）。
      const brightness = isPressed ? activeBodyBrightness(currentTimeMs - startNote!.timingMs) : 1;
      const tint = (hex: string) =>
        brightness === 1 ? hex : this.scaleHexBrightness(hex, brightness);
      const outlineColor = tint(COLORS.WHITE);

      const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);

      // 外六 + 内六各做一圈 wider black，环 fill 覆盖内侧 halo 只剩外缘黑边。
      // EX 占用外圈，跳过外六的黑边但保留内六。wider = strokeWidth*3 让可见黑边
      // ≈ strokeWidth，跟随画布缩放避免小屏下显得过粗。

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

      // 终点 dot 只在终点进入 approach 后半段才显示（与终点展开节奏一致）。
      if (endPosition.visible && endNote && currentTimeMs) {
        const approachHalf = this.getNoteApproachTimeMs(endNote) / 2;
        const endTimeDiff = endNote.timingMs - currentTimeMs;
        if (endTimeDiff <= approachHalf) {
          const endCenterSize = endWidth * 0.15;
          ctx.beginPath();
          ctx.arc(endX, endY, endCenterSize, 0, Math.PI * 2);
          ctx.fillStyle = color[0];
          ctx.fill();
        }
      }
    });
  }

  /**
   * 按压中的 hold 头部辉光：暖色热芯 → 饱和红 → 暗红拖尾，径向淡出。
   * 只在头部停在判定线上（[start, end) 窗口内）时画，接近中的头仍是平面圆点。
   * 色阶按实机 break hold 的测量结果逐通道反解；普通 hold 未取到录像，沿用同一倍率、换本体色。
   * 辉光本身不随 HOLD_ACTIVE_CYCLE_MS 闪烁（实测振幅 0.8/均值 134），只有本体会。
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
