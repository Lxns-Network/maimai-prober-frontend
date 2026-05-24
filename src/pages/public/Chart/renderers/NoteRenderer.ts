import { BaseRenderer, RenderContext } from "./BaseRenderer";
import { Note, Point2D, NoteRenderPosition, ButtonPosition } from "../types";
import {
  NOTE_SIZE_RATIO,
  TAP_INNER_RING_RATIO,
  APPROACH_START_SCALE,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  NOTE_VISIBILITY_AFTER_MS,
  NOTE_HIT_EFFECT_DURATION_MS,
} from "../utils/constants";

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

  calculateNotePosition(
    note: Note,
    _currentBeat: number,
    currentTimeMs: number,
  ): NoteRenderPosition {
    const position = note.position as ButtonPosition;
    const angle = this.getButtonAngle(position);
    const timeDiff = note.timingMs - currentTimeMs;
    const approachTime = this.getApproachTimeMs();

    // Hold 起点在 hold duration 内一直可见；普通 note 只有 NOTE_VISIBILITY_AFTER_MS。
    let holdWindow = NOTE_VISIBILITY_AFTER_MS;
    if ("isHoldStart" in note && note.isHoldStart && "duration" in note) {
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
    } else if ("isHoldStart" in note && note.isHoldStart) {
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

  renderTapHitEffect(
    x: number,
    y: number,
    position: ButtonPosition,
    color: string,
    progress: number,
    type: "hexagon" | "star",
  ): void {
    // progress ∈ [0,1] 驱动 scale 上升 + 中段最亮 + 子图形旋转/离心。
    const scale = 1 - 0.75 * (progress - 1) * (progress - 1);
    const alpha = 1 - 4 * (progress - 0.5) * (progress - 0.5);
    if (alpha <= 0 || scale <= 0) return;
    const subAng = 1 - (progress - 1) * (progress - 1);
    const subRad = Math.max(0, Math.min(1, 1 - (8 / 9) * progress * progress));

    const baseR = this.scaleByRadius(NOTE_SIZE_RATIO) * 1.36 * 1.5;
    const angle = this.getButtonAngle(position);
    const sub1 = angle + Math.PI / 6;
    const sub2 = angle - Math.PI / 6;
    const r0 = baseR * scale;
    const rSmall = r0 * 0.7;
    const rBig = r0 * 0.8;
    const off = baseR * subRad * 0.7;

    // 中心 + ±15° 偏轴各 2 个旋转副本合进同一条 Path2D，一次 stroke 触发一次 filter pass。
    const path = new Path2D();
    const add = (cx: number, cy: number, r: number) => {
      if (type === "star") {
        this.starSubPath(path, cx, cy, 5, r, r * 0.5, angle + Math.PI);
      } else {
        this.hexagonSubPath(path, cx, cy, r, angle);
      }
    };

    add(x, y, r0);
    const a1a = sub1 + Math.PI * subAng;
    add(x + Math.cos(a1a) * off, y + Math.sin(a1a) * off * 0.7, rSmall);
    const a1b = sub1 + Math.PI * (1 + subAng);
    add(x + Math.cos(a1b) * off, y + Math.sin(a1b) * off, rSmall);
    const a2a = sub2 - Math.PI * subAng;
    add(x + Math.cos(a2a) * off, y + Math.sin(a2a) * off, rBig);
    const a2b = sub2 + Math.PI * (1 - subAng);
    add(x + Math.cos(a2b) * off, y + Math.sin(a2b) * off, rBig);

    // blur < 0.5px 时跳过 filter 设置（progress 端点处不可感知，避免 GPU pass）。
    const blurPx = this.scaleByRadius(4 / 300) * subAng * 0.7;
    const useBlur = blurPx >= 0.5;

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO) * 2;
      ctx.lineJoin = "round";
      if (useBlur) ctx.filter = `blur(${blurPx}px)`;
      ctx.stroke(path);
    });
  }

  renderApproachArc(position: ButtonPosition, noteX: number, noteY: number, color: string): void {
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
          centerX,
          centerY,
          distance,
          angle - Math.PI / 8 - i * trailStep,
          angle - Math.PI / 8 - (i - 1) * trailStep,
          false,
        );
        ctx.moveTo(
          centerX + Math.cos(angle + Math.PI / 8 + (i - 1) * trailStep) * distance,
          centerY + Math.sin(angle + Math.PI / 8 + (i - 1) * trailStep) * distance,
        );
        ctx.arc(
          centerX,
          centerY,
          distance,
          angle + Math.PI / 8 + (i - 1) * trailStep,
          angle + Math.PI / 8 + i * trailStep,
          false,
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
    color: string,
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
        const [arcStart, arcEnd] = angleDiff > 0 ? [startAngle, endAngle] : [endAngle, startAngle];
        ctx.arc(this.context.centerX, this.context.centerY, distance, arcStart, arcEnd, false);
      }
      ctx.stroke();
    });
  }

  renderExRing(
    x: number,
    y: number,
    noteSize: number,
    noteType: string = "tap",
    isSimultaneous: boolean = false,
    scaleFactor: number = 1,
  ): void {
    const innerRadius = noteSize;
    const outerRadius = noteSize * 1.19 * scaleFactor;

    // 根据类型选择颜色
    let color: string;
    if (noteType === "break") {
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

  renderBreakTriangle(x: number, y: number, size: number, position: ButtonPosition): void {
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

      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = this.scaleByRadius(4 / 300);
      ctx.stroke();
    });
  }

  private getTapRingColors(
    ddrColor: string | null,
    isBreak: boolean,
    isSimultaneous: boolean,
  ): [string, string] {
    if (ddrColor) {
      return [ddrColor, this.mixHexColor(ddrColor, "#000000", 0.25)];
    }

    if (isBreak) {
      return [COLORS.BREAK_GRADIENT_START, COLORS.BREAK_GRADIENT_END];
    }

    if (isSimultaneous) {
      return [COLORS.SIMULTANEOUS_GRADIENT_START, COLORS.SIMULTANEOUS_GRADIENT_END];
    }

    return [COLORS.TAP_GRADIENT_START, COLORS.TAP_GRADIENT_END];
  }

  private renderDirectionalTapRing(
    x: number,
    y: number,
    innerRadius: number,
    outerRadius: number,
    position: ButtonPosition,
    colors: [string, string],
  ): void {
    const ctx = this.context.ctx;
    const startAngle = this.getButtonAngle(position);
    const lightColor = this.mixHexColor(colors[0], "#ffffff", 0.18);

    for (let i = 0; i < 4; i++) {
      const sectorStart = startAngle + (i * Math.PI) / 2;
      const sectorEnd = sectorStart + Math.PI / 2;

      const midR = (innerRadius + outerRadius) / 2;
      const x0 = x + Math.cos(sectorStart) * midR;
      const y0 = y + Math.sin(sectorStart) * midR;
      const x1 = x + Math.cos(sectorEnd) * midR;
      const y1 = y + Math.sin(sectorEnd) * midR;

      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, lightColor);
      gradient.addColorStop(1, colors[1]);

      ctx.beginPath();
      ctx.arc(x, y, outerRadius, sectorStart, sectorEnd, false);
      ctx.arc(x, y, innerRadius, sectorEnd, sectorStart, true);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }
  }

  renderTapNote(
    x: number,
    y: number,
    noteScale: number,
    position: ButtonPosition,
    isBreak: boolean,
    isSimultaneous: boolean,
    isEx: boolean,
    timing: number,
    highlightExScale: number = 1,
  ): void {
    const baseSize = this.scaleByRadius(NOTE_SIZE_RATIO) * noteScale * 1.36;
    const outerRadius = baseSize;
    const innerRadius = baseSize * TAP_INNER_RING_RATIO;

    this.withContext(() => {
      const ctx = this.context.ctx;

      if (isEx) {
        this.renderExRing(
          x,
          y,
          outerRadius,
          isBreak ? "break" : "tap",
          isSimultaneous,
          highlightExScale,
        );
      }

      const ddrColor = this.getDdrColor(timing);
      const ringColors = this.getTapRingColors(ddrColor, isBreak, isSimultaneous);
      this.renderDirectionalTapRing(x, y, innerRadius, outerRadius, position, ringColors);

      // 外侧 + 内侧空心各加一圈黑边（贴在白描边之外）。EX 占用外圈，跳过外侧黑边
      // 但保留内侧。黑边宽度跟随 strokeW 缩放，避免小屏下显得过粗。
      const strokeW = this.getNoteStrokeWidth();
      const blackBandW = strokeW;
      ctx.strokeStyle = "#000000";
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

  renderBreakIndex(x: number, y: number, scale: number, index: number): void {
    const fontSize = Math.round(((30 * this.context.radius) / 300) * scale);

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.WHITE;
      // 纯偏移阴影代替 shadowBlur
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(`${index}`, x, y);
    });
  }
}

export default NoteRenderer;
