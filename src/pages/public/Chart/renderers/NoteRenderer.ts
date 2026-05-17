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

    // Hold 起点在 hold duration 内一直可见；普通 note 只有 NOTE_VISIBILITY_AFTER_MS。
    let holdWindow = NOTE_VISIBILITY_AFTER_MS;
    if ('isHoldStart' in note && note.isHoldStart && 'duration' in note) {
      holdWindow = this.durationToMs(note.duration, note.bpm);
    }
    if (timeDiff > approachTime || timeDiff < -holdWindow) {
      return { x: 0, y: 0, scale: 0, visible: false };
    }

    // approach 上半段：在中心位置淡入；下半段：朝判定线推进；命中后：hold 钉在
    // 判定线，普通 note 继续向外淡出。
    const halfApproach = approachTime / 2;
    let distance: number;
    let scale: number;
    if (timeDiff > halfApproach) {
      distance = APPROACH_START_SCALE * this.context.radius;
      scale = 1 - (timeDiff - halfApproach) / halfApproach;
    } else if (timeDiff >= 0) {
      const progress = 1 - timeDiff / halfApproach;
      distance = this.context.radius * (APPROACH_START_SCALE + 0.75 * progress);
      scale = 1;
    } else if ('isHoldStart' in note && note.isHoldStart) {
      distance = this.context.radius;
      scale = 1;
    } else {
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

    // i=0 是主弧（按钮中心 ±π/8），i>0 是左右两侧的拖影（按 alpha 递减）。
    for (let i = 4; i >= 0; i--) {
      const alpha = i === 0 ? 0.4 : 0.4 * (1 - i / 5);
      ctx.globalAlpha = alpha;
      ctx.beginPath();

      if (i === 0) {
        ctx.arc(centerX, centerY, distance, angle - Math.PI / 8, angle + Math.PI / 8, false);
      } else {
        ctx.arc(
          centerX, centerY, distance,
          angle - Math.PI / 8 - i * trailStep,
          angle - Math.PI / 8 - (i - 1) * trailStep,
          false
        );
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

    // 取较短方向；diff=±4 时是正对位（无短弧），整圈连。
    let angleDiff = endPos - startPos;
    while (angleDiff > 4) angleDiff -= 8;
    while (angleDiff < -4) angleDiff += 8;
    const isFullCircle = Math.abs(angleDiff) === 4;

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = color;
      ctx.lineWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);

      ctx.beginPath();
      if (isFullCircle) {
        ctx.arc(this.context.centerX, this.context.centerY, distance, 0, Math.PI * 2);
      } else {
        const [arcStart, arcEnd] = angleDiff > 0
          ? [startAngle, endAngle]
          : [endAngle, startAngle];
        ctx.arc(this.context.centerX, this.context.centerY, distance, arcStart, arcEnd, false);
      }
      ctx.stroke();
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

      if (isEx) {
        this.renderExRing(x, y, outerRadius, isBreak ? 'break' : 'tap', isSimultaneous, highlightExScale);
      }

      this.drawRing(x, y, innerRadius, outerRadius);

      const ddrColor = this.getDdrColor(timing);
      if (ddrColor) {
        ctx.fillStyle = ddrColor;
      } else if (isBreak) {
        const gradient = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
        gradient.addColorStop(0, COLORS.BREAK_GRADIENT_START);
        gradient.addColorStop(0.5, COLORS.BREAK_GRADIENT_MID);
        gradient.addColorStop(1, COLORS.BREAK_GRADIENT_END);
        ctx.fillStyle = gradient;
      } else {
        ctx.fillStyle = isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TAP_PINK;
      }
      ctx.fill();

      // 外侧 + 内侧空心各加一圈黑边（贴在白描边之外）。EX 占用外圈，跳过外侧黑边
      // 但保留内侧。黑边宽度跟随 strokeW 缩放，避免小屏下显得过粗。
      const strokeW = this.getNoteStrokeWidth();
      const blackBandW = strokeW;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = blackBandW;
      if (!isEx) {
        this.drawCircle(x, y, outerRadius + strokeW / 2 + blackBandW / 2);
        ctx.stroke();
      }
      const innerBlackR = innerRadius - strokeW / 2 - blackBandW / 2;
      if (innerBlackR > 0) {
        this.drawCircle(x, y, innerBlackR);
        ctx.stroke();
      }

      this.drawCircle(x, y, outerRadius);
      ctx.strokeStyle = COLORS.WHITE;
      ctx.lineWidth = strokeW;
      ctx.stroke();

      this.drawCircle(x, y, innerRadius);
      ctx.stroke();

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
      // 纯偏移阴影代替 shadowBlur
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(`${index}`, x, y);
    });
  }
}

export default NoteRenderer;
