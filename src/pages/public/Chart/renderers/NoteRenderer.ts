import { BaseRenderer, RenderContext } from './BaseRenderer';
import { Note, Point2D, NoteRenderPosition, ButtonPosition } from '../types';
import {
  NOTE_SIZE_RATIO,
  TAP_INNER_RING_RATIO,
  APPROACH_START_SCALE,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  NOTE_VISIBILITY_AFTER_MS,
} from '../utils/constants';

export class NoteRenderer extends BaseRenderer {
  constructor(context: RenderContext) {
    super(context);
  }

  getPositionOnRing(position: ButtonPosition): Point2D {
    return this.getButtonPosition(position);
  }

  getAngle(position: ButtonPosition): number {
    return this.getButtonAngle(position);
  }

  calculateNotePosition(
    note: Note,
    _currentBeat: number,
    currentTimeMs: number
  ): NoteRenderPosition {
    const position = note.position as ButtonPosition;
    const angle = this.getButtonAngle(position);
    const timeDiff = note.timingMs - currentTimeMs;
    const approachTime = this.getApproachTimeMs();

    // 计算 Hold 持续时间窗口可见性
    let holdWindow = NOTE_VISIBILITY_AFTER_MS;
    if ('isHoldStart' in note && note.isHoldStart && 'duration' in note) {
      holdWindow = this.durationToMs(note.duration, note.bpm);
    }

    // 检查可见性边界
    if (timeDiff > approachTime || timeDiff < -holdWindow) {
      return { x: 0, y: 0, scale: 0, visible: false };
    }

    const halfApproach = approachTime / 2;
    let distance: number;
    let scale: number;

    if (timeDiff > halfApproach) {
      // 第一半：Note 正在淡入，从中心移动
      distance = APPROACH_START_SCALE * this.context.radius;
      scale = 1 - (timeDiff - halfApproach) / halfApproach;
    } else if (timeDiff >= 0) {
      // 第二半：Note 正在接近判定线
      const progress = 1 - timeDiff / halfApproach;
      distance = this.context.radius * (APPROACH_START_SCALE + 0.75 * progress);
      scale = 1;
    } else if ('isHoldStart' in note && note.isHoldStart) {
      // Hold 开始保持在判定线
      distance = this.context.radius;
      scale = 1;
    } else {
      // 计时后：Note 淡出（不用于 Hold）
      const fadeProgress = 1 + -timeDiff / halfApproach;
      distance = this.context.radius * (APPROACH_START_SCALE + 0.75 * fadeProgress);
      scale = 1;
    }

    return {
      x: this.context.centerX + Math.cos(angle) * distance,
      y: this.context.centerY + Math.sin(angle) * distance,
      scale,
      visible: true,
    };
  }

  renderApproachArc(
    position: ButtonPosition,
    noteX: number,
    noteY: number,
    color: string
  ): void {
    const angle = this.getButtonAngle(position);
    const distance = this.distanceToCenter(noteX, noteY);
    const ctx = this.context.ctx;
    const centerX = this.context.centerX;
    const centerY = this.context.centerY;
    const trailStep = Math.PI / 8 / 4;
    const lineWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    // 按透明度分组批量绘制
    for (let i = 4; i >= 0; i--) {
      const alpha = i === 0 ? 0.4 : 0.4 * (1 - i / 5);
      ctx.globalAlpha = alpha;
      ctx.beginPath();

      if (i === 0) {
        // 主弧
        ctx.arc(centerX, centerY, distance, angle - Math.PI / 8, angle + Math.PI / 8, false);
      } else {
        // 左侧轨迹
        ctx.arc(
          centerX, centerY, distance,
          angle - Math.PI / 8 - i * trailStep,
          angle - Math.PI / 8 - (i - 1) * trailStep,
          false
        );
        // 右侧轨迹 (新子路径)
        ctx.moveTo(
          centerX + Math.cos(angle + Math.PI / 8 + (i - 1) * trailStep) * distance,
          centerY + Math.sin(angle + Math.PI / 8 + (i - 1) * trailStep) * distance
        );
        ctx.arc(
          centerX, centerY, distance,
          angle + Math.PI / 8 + (i - 1) * trailStep,
          angle + Math.PI / 8 + i * trailStep,
          false
        );
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  renderSimultaneousConnector(
    startPos: ButtonPosition,
    endPos: ButtonPosition,
    distance: number,
    color: string
  ): void {
    const startAngle = this.getButtonAngle(startPos);
    const endAngle = this.getButtonAngle(endPos);

    // 计算弧方向
    let angleDiff = endPos - startPos;
    while (angleDiff > 4) angleDiff -= 8;
    while (angleDiff < -4) angleDiff += 8;

    const isFullCircle = Math.abs(angleDiff) === 4;

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);

      if (isFullCircle) {
        // 绘制全圆
        ctx.beginPath();
        ctx.arc(this.context.centerX, this.context.centerY, distance, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // 绘制从开始到结束的弧
        const [arcStart, arcEnd] = angleDiff > 0
          ? [startAngle, endAngle]
          : [endAngle, startAngle];

        ctx.beginPath();
        ctx.arc(this.context.centerX, this.context.centerY, distance, arcStart, arcEnd, false);
        ctx.stroke();
      }
    });
  }

  renderExRing(
    x: number,
    y: number,
    noteSize: number,
    noteType: string = 'tap',
    isSimultaneous: boolean = false,
    scaleFactor: number = 1
  ): void {
    const innerRadius = noteSize;
    const outerRadius = noteSize * 1.19 * scaleFactor;

    // 根据类型选择颜色
    let color: string;
    if (noteType === 'break') {
      color = COLORS.EX_OVERLAY_BREAK;
    } else if (isSimultaneous) {
      color = COLORS.EX_OVERLAY_SIMULTANEOUS;
    } else {
      color = COLORS.EX_OVERLAY_NORMAL;
    }

    this.withContext(() => {
      this.drawRing(x, y, innerRadius, outerRadius);
      this.context.ctx.fillStyle = color;
      this.context.ctx.fill();
    });
  }

  renderBreakTriangle(
    x: number,
    y: number,
    size: number,
    position: ButtonPosition
  ): void {
    const angle = this.getButtonAngle(position);
    const triangleSize = size * 1.4;

    // 计算三角形顶点
    const tipAngle = angle;
    const leftAngle = angle + Math.PI - Math.PI / 3;
    const rightAngle = angle + Math.PI + Math.PI / 3;

    const tipX = x + Math.cos(tipAngle) * triangleSize;
    const tipY = y + Math.sin(tipAngle) * triangleSize;
    const leftX = x + Math.cos(leftAngle) * triangleSize;
    const leftY = y + Math.sin(leftAngle) * triangleSize;
    const rightX = x + Math.cos(rightAngle) * triangleSize;
    const rightY = y + Math.sin(rightAngle) * triangleSize;

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(leftX, leftY);
      ctx.lineTo(rightX, rightY);
      ctx.closePath();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = this.scaleByRadius(4 / 300);
      ctx.stroke();
    });
  }

  renderTapNote(
    x: number,
    y: number,
    noteScale: number,
    isBreak: boolean,
    isSimultaneous: boolean,
    isEx: boolean,
    timing: number,
    highlightExScale: number = 1
  ): void {
    const baseSize = this.scaleByRadius(NOTE_SIZE_RATIO) * noteScale * 1.36;
    const outerRadius = baseSize;
    const innerRadius = baseSize * TAP_INNER_RING_RATIO;

    this.withContext(() => {
      const ctx = this.context.ctx;

      // 渲染保护套
      if (isEx) {
        this.renderExRing(x, y, outerRadius, isBreak ? 'break' : 'tap', isSimultaneous, highlightExScale);
      }

      // 绘制 Note 环
      this.drawRing(x, y, innerRadius, outerRadius);

      // 获取 DDR 颜色或使用标准颜色
      const ddrColor = this.getDdrColor(timing);
      if (ddrColor) {
        ctx.fillStyle = ddrColor;
      } else if (isBreak) {
        // 绝赞渐变
        const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
        gradient.addColorStop(0, COLORS.BREAK_GRADIENT_START);
        gradient.addColorStop(0.5, COLORS.BREAK_GRADIENT_MID);
        gradient.addColorStop(1, COLORS.BREAK_GRADIENT_END);
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TAP_PINK;
      }
      ctx.fill();

      // 外轮廓
      this.drawCircle(x, y, outerRadius);
      ctx.strokeStyle = COLORS.WHITE;
      ctx.lineWidth = this.getNoteStrokeWidth();
      ctx.stroke();

      // 内轮廓
      this.drawCircle(x, y, innerRadius);
      ctx.stroke();

      // 中心点
      const centerSize = outerRadius * 0.15;
      this.drawCircle(x, y, centerSize);
      if (ddrColor) {
        ctx.fillStyle = ddrColor;
      } else if (isBreak) {
        ctx.fillStyle = COLORS.BREAK_ORANGE;
      } else {
        ctx.fillStyle = isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TAP_PINK;
      }
      ctx.fill();
    });
  }

  renderBreakIndex(
    x: number,
    y: number,
    scale: number,
    index: number
  ): void {
    const fontSize = Math.round(30 * this.context.radius / 300 * scale);

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = COLORS.WHITE;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 4;
      ctx.fillText(`${index}`, x, y);
    });
  }
}

export default NoteRenderer;
