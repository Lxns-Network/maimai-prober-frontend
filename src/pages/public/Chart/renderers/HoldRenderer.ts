import { BaseRenderer, RenderContext } from './BaseRenderer';
import { HoldStartNote, HoldEndNote, NoteRenderPosition, ButtonPosition, Point2D } from '../types';
import { NoteRenderer } from './NoteRenderer';
import {
  NOTE_SIZE_RATIO,
  HOLD_WIDTH_RATIO,
  HOLD_INNER_RATIO,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
} from '../utils/constants';

export class HoldRenderer extends BaseRenderer {
  constructor(context: RenderContext, _noteRenderer: NoteRenderer) {
    super(context);
  }

  renderHold(
    startPosition: NoteRenderPosition,
    endPosition: NoteRenderPosition,
    buttonPosition: ButtonPosition,
    color: string,
    isEx: boolean = false,
    startNote: HoldStartNote | null = null,
    endNote: HoldEndNote | null = null,
    currentTimeMs: number = 0,
    isBreakHold: boolean = false,
    isSimultaneous: boolean = false,
    exScaleFactor: number = 1
  ): void {
    const angle = this.getButtonAngle(buttonPosition);
    const baseSize = this.scaleByRadius(NOTE_SIZE_RATIO) * HOLD_WIDTH_RATIO;
    const holdWidth = baseSize * startPosition.scale;

    // 计算开始点坐标
    const startX = startPosition.x;
    const startY = startPosition.y;

    // 计算结束点（使用位置或回退到接近开始位置）
    let endX: number;
    let endY: number;

    if (endPosition.visible) {
      endX = endPosition.x;
      endY = endPosition.y;
    } else {
      // 结束点不可见 - 绘制到接近开始位置
      const approachDist = 0.25 * this.context.radius;
      endX = this.context.centerX + Math.cos(angle) * approachDist;
      endY = this.context.centerY + Math.sin(angle) * approachDist;
    }

    // 计算六边形顶点
    const tipAngle = angle;
    const leftAngle = angle + Math.PI / 3;
    const rightAngle = angle - Math.PI / 3;
    const backAngle = angle + Math.PI;
    const backLeftAngle = angle + Math.PI - Math.PI / 3;
    const backRightAngle = angle + Math.PI + Math.PI / 3;

    // 开始侧顶点（指向结束）
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

    // 计算结束缩放
    let endScale = 1;
    if (startNote && endNote && currentTimeMs) {
      const approachHalf = this.getApproachTimeMs() / 2;
      const timeDiff = startNote.timingMs - currentTimeMs;
      if (timeDiff > approachHalf) {
        endScale = 1 - (timeDiff - approachHalf) / approachHalf;
      }
    }

    const endWidth = baseSize * endScale;

    // 结束侧顶点（背面结束）
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

    // 内六边形（空心中心）
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

      // 渲染保护套
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

        // 扩展外六边形
        const exStartTip = this.scalePoint(startX, startY, startTip, exScale);
        const exStartLeft = this.scalePoint(startX, startY, startLeft, exScale);
        const exStartRight = this.scalePoint(startX, startY, startRight, exScale);
        const exEndBack = this.scalePoint(endX, endY, endBack, exScale);
        const exEndBackLeft = this.scalePoint(endX, endY, endBackLeft, exScale);
        const exEndBackRight = this.scalePoint(endX, endY, endBackRight, exScale);

        // 绘制 EX 覆盖层（外减内）
        ctx.beginPath();
        ctx.moveTo(exStartTip.x, exStartTip.y);
        ctx.lineTo(exStartLeft.x, exStartLeft.y);
        ctx.lineTo(exEndBackLeft.x, exEndBackLeft.y);
        ctx.lineTo(exEndBack.x, exEndBack.y);
        ctx.lineTo(exEndBackRight.x, exEndBackRight.y);
        ctx.lineTo(exStartRight.x, exStartRight.y);
        ctx.closePath();

        // 切割内形状
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

      // 绘制主要 Hold 主体（外六边形内切割）
      ctx.beginPath();
      ctx.moveTo(startTip.x, startTip.y);
      ctx.lineTo(startLeft.x, startLeft.y);
      ctx.lineTo(endBackLeft.x, endBackLeft.y);
      ctx.lineTo(endBack.x, endBack.y);
      ctx.lineTo(endBackRight.x, endBackRight.y);
      ctx.lineTo(startRight.x, startRight.y);
      ctx.closePath();

      // 内切割（反向缠绕）
      ctx.moveTo(innerStartTip.x, innerStartTip.y);
      ctx.lineTo(innerStartRight.x, innerStartRight.y);
      ctx.lineTo(innerEndBackRight.x, innerEndBackRight.y);
      ctx.lineTo(innerEndBack.x, innerEndBack.y);
      ctx.lineTo(innerEndBackLeft.x, innerEndBackLeft.y);
      ctx.lineTo(innerStartLeft.x, innerStartLeft.y);
      ctx.closePath();

      ctx.fillStyle = color;
      ctx.fill();

      // 绘制轮廓
      const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
      ctx.strokeStyle = COLORS.WHITE;
      ctx.lineWidth = strokeWidth;

      // 外轮廓
      ctx.beginPath();
      ctx.moveTo(startTip.x, startTip.y);
      ctx.lineTo(startLeft.x, startLeft.y);
      ctx.lineTo(endBackLeft.x, endBackLeft.y);
      ctx.lineTo(endBack.x, endBack.y);
      ctx.lineTo(endBackRight.x, endBackRight.y);
      ctx.lineTo(startRight.x, startRight.y);
      ctx.closePath();
      ctx.stroke();

      // 内轮廓
      ctx.beginPath();
      ctx.moveTo(innerStartTip.x, innerStartTip.y);
      ctx.lineTo(innerStartLeft.x, innerStartLeft.y);
      ctx.lineTo(innerEndBackLeft.x, innerEndBackLeft.y);
      ctx.lineTo(innerEndBack.x, innerEndBack.y);
      ctx.lineTo(innerEndBackRight.x, innerEndBackRight.y);
      ctx.lineTo(innerStartRight.x, innerStartRight.y);
      ctx.closePath();
      ctx.stroke();

      // 开始和结束中心点
      const centerSize = holdWidth * 0.15;
      ctx.beginPath();
      ctx.arc(startX, startY, centerSize, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // 结束中心点（仅当可见且在接近范围内）
      if (endPosition.visible && endNote && currentTimeMs) {
        const approachHalf = this.getApproachTimeMs() / 2;
        const endTimeDiff = endNote.timingMs - currentTimeMs;
        if (endTimeDiff <= approachHalf) {
          const endCenterSize = endWidth * 0.15;
          ctx.beginPath();
          ctx.arc(endX, endY, endCenterSize, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
      }
    });
  }

  private scalePoint(centerX: number, centerY: number, point: Point2D, scale: number): Point2D {
    return {
      x: centerX + (point.x - centerX) * scale,
      y: centerY + (point.y - centerY) * scale,
    };
  }
}

export default HoldRenderer;
