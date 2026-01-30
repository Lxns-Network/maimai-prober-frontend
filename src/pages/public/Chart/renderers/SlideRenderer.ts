import { BaseRenderer, RenderContext } from './BaseRenderer';
import { SlideNote, SlideSegment, SlidePathType, Point2D, ButtonPosition, NoteRenderPosition } from '../types';
import { NoteRenderer } from './NoteRenderer';
import {
  SLIDE_ARROW_WIDTH_RATIO,
  SLIDE_ARROW_SPACING,
  WIFI_ARROW_SPACING,
  SLIDE_CURVE_OFFSET_RATIO,
  COLORS,
  APPROACH_START_SCALE,
  NOTE_VISIBILITY_AFTER_MS,
} from '../utils/constants';

export class SlideRenderer extends BaseRenderer {
  private noteRenderer: NoteRenderer;

  constructor(context: RenderContext, noteRenderer: NoteRenderer) {
    super(context);
    this.noteRenderer = noteRenderer;
  }

  calculateSlideStartPosition(
    note: SlideNote,
    _currentBeat: number,
    currentTimeMs: number
  ): NoteRenderPosition {
    const angle = this.getButtonAngle(note.position);
    const timeDiff = note.timingMs - currentTimeMs;
    const approachTime = this.getApproachTimeMs();

    if (timeDiff > approachTime || timeDiff < -NOTE_VISIBILITY_AFTER_MS) {
      return { x: 0, y: 0, scale: 0, visible: false };
    }

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

  renderSlide(
    note: SlideNote,
    currentBeat: number,
    currentTimeMs: number,
    renderStars: boolean = true
  ): void {
    if (note.isSplitSlide && note.allSlideSegments) {
      // 分段滑条：渲染每个路径
      for (let i = 0; i < note.allSlideSegments.length; i++) {
        const segments = note.allSlideSegments[i];
        if (segments && segments.length > 0) {
          this.renderSlidePath(note, currentBeat, currentTimeMs, segments, i, renderStars);
        }
      }
    } else if (note.slideSegments && note.slideSegments.length > 0) {
      // 单段滑条
      this.renderSlidePath(note, currentBeat, currentTimeMs, note.slideSegments, 0, renderStars);
    }
  }

  private renderSlidePath(
    note: SlideNote,
    _currentBeat: number,
    currentTimeMs: number,
    segments: SlideSegment[],
    pathIndex: number = 0,
    renderStars: boolean = true
  ): void {
    const approachHalf = this.getApproachTimeMs() / 2;
    const visibilityStart = note.timingMs - approachHalf;
    
    const durationMs = note.allDurationMs ? note.allDurationMs[pathIndex] : note.durationMs;
    const delayMs = note.allDelayMs ? note.allDelayMs[pathIndex] : (note.delayMs ?? 60000 / note.bpm);
    const slideStart = note.timingMs + delayMs;

    // 检查可见性窗口
    if (currentTimeMs < visibilityStart || currentTimeMs > slideStart + durationMs) {
      return;
    }

    // 计算淡入 alpha
    let alpha = 1;
    if (currentTimeMs < note.timingMs) {
      const fadeProgress = (currentTimeMs - visibilityStart) / approachHalf;
      alpha = Math.max(0, Math.min(1, fadeProgress));
    }

    this.withContext(() => {
      this.context.ctx.globalAlpha = alpha;

      // 计算滑条进度 (0-1)
      let progress = 0;
      if (currentTimeMs >= slideStart) {
        const elapsed = currentTimeMs - slideStart;
        progress = Math.min(1, elapsed / durationMs);
      }

      const isSimultaneous = (note.simultaneousSlideCount ?? 0) >= 2 || (note.isSplitSlide ?? false);
      const isBreak = note.allSlideBreaks?.[pathIndex] ?? false;
      let allVisible = true;

      // 计算总路径长度用于进度映射
      const segmentLengths = segments.map(seg => this.getSegmentLength(seg));
      const totalLength = segmentLengths.reduce((a, b) => a + b, 0);
      
      const segmentRanges: { start: number; end: number }[] = [];
      let cumulative = 0;
      for (let i = 0; i < segments.length; i++) {
        const start = cumulative / totalLength;
        cumulative += segmentLengths[i];
        const end = cumulative / totalLength;
        segmentRanges.push({ start, end });
      }

      // 渲染每个段 (反向层叠)
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        const range = segmentRanges[i];
        
        let segmentProgress = 0;
        if (progress > range.start) {
          segmentProgress = progress >= range.end 
            ? 1 
            : (progress - range.start) / (range.end - range.start);
        }

        const visible = this.renderSlideSegment(
          segment,
          isBreak,
          segmentProgress,
          isSimultaneous,
          this.context.config.normalColorBreakSlide
        );
        if (!visible) allVisible = false;
      }

      // 渲染星星
      if (renderStars && allVisible && currentTimeMs >= note.timingMs) {
        this.renderSlideStar(note, progress, segments, pathIndex, currentTimeMs, isSimultaneous);
      }
    });
  }

  private renderSlideSegment(
    segment: SlideSegment,
    isBreak: boolean,
    progress: number = 0,
    isSimultaneous: boolean = false,
    normalBreakColor: boolean = false
  ): boolean {
    const startPos = this.noteRenderer.getPositionOnRing(segment.startPos);
    const endPos = this.noteRenderer.getPositionOnRing(segment.endPos);
    
    // 镜像路径类型
    const mirroredType = this.mirrorPathType(segment.type);

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.lineWidth = this.scaleByRadius(SLIDE_ARROW_WIDTH_RATIO);
      
      // 根据类型设置颜色
      if (isBreak && !normalBreakColor) {
        ctx.strokeStyle = COLORS.BREAK_ORANGE;
      } else if (isSimultaneous) {
        ctx.strokeStyle = COLORS.SLIDE_SIMULTANEOUS;
      } else {
        ctx.strokeStyle = COLORS.SLIDE_CYAN;
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 根据镜像后的段类型渲染
      switch (mirroredType) {
        case '-':
          this.renderStraightPath(startPos, endPos, progress);
          break;
        case '>':
          this.renderClockwiseArc(segment.startPos, segment.endPos, progress);
          break;
        case '<':
          this.renderCounterClockwiseArc(segment.startPos, segment.endPos, progress);
          break;
        case '^':
          return this.renderShortArc(segment.startPos, segment.endPos, progress);
        case 'v':
          return this.renderVPath(segment.startPos, segment.endPos, progress);
        case 'p':
        case 'pp':
        case 'q':
        case 'qq':
          // 传递原始段类型，让 getPointOnSegment 处理镜像
          this.renderCurvePath(segment.startPos, segment.endPos, segment.type, progress);
          break;
        case 's':
          this.renderSPath(startPos, endPos, progress);
          break;
        case 'z':
          this.renderZPath(startPos, endPos, progress);
          break;
        case 'w':
          this.renderWifiPath(segment.startPos, segment.endPos, progress);
          break;
      }
    });

    return true;
  }

  private renderStraightPath(start: Point2D, end: Point2D, progress: number): void {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    this.iterateArrowsAlongPath(
      (t) => ({
        x: start.x + dx * t,
        y: start.y + dy * t,
      }),
      length,
      progress
    );
  }

  private renderClockwiseArc(startPos: ButtonPosition, endPos: ButtonPosition, progress: number): void {
    const startAngle = this.getButtonAngle(startPos);
    let endAngle = this.getButtonAngle(endPos);
    let angleDiff = endAngle - startAngle;

    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // 使用原始位置判断弧方向
    const isLeftSide = startPos === 1 || startPos === 2 || startPos === 7 || startPos === 8;
    if (isLeftSide) {
      if (angleDiff <= 0) angleDiff += 2 * Math.PI;
    } else {
      if (angleDiff >= 0) angleDiff -= 2 * Math.PI;
    }

    endAngle = startAngle + angleDiff;
    const arcLength = Math.abs(angleDiff) * this.context.radius;

    this.iterateArrowsAlongPath(
      (t) => {
        const angle = startAngle + angleDiff * t;
        return {
          x: this.context.centerX + Math.cos(angle) * this.context.radius,
          y: this.context.centerY + Math.sin(angle) * this.context.radius,
        };
      },
      arcLength,
      progress
    );
  }

  private renderCounterClockwiseArc(startPos: ButtonPosition, endPos: ButtonPosition, progress: number): void {
    const startAngle = this.getButtonAngle(startPos);
    let endAngle = this.getButtonAngle(endPos);
    let angleDiff = endAngle - startAngle;

    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // 使用原始位置判断弧方向
    const isLeftSide = startPos === 1 || startPos === 2 || startPos === 7 || startPos === 8;
    if (isLeftSide) {
      if (angleDiff >= 0) angleDiff -= 2 * Math.PI;
    } else {
      if (angleDiff <= 0) angleDiff += 2 * Math.PI;
    }

    endAngle = startAngle + angleDiff;
    const arcLength = Math.abs(angleDiff) * this.context.radius;

    this.iterateArrowsAlongPath(
      (t) => {
        const angle = startAngle + angleDiff * t;
        return {
          x: this.context.centerX + Math.cos(angle) * this.context.radius,
          y: this.context.centerY + Math.sin(angle) * this.context.radius,
        };
      },
      arcLength,
      progress
    );
  }

  private renderShortArc(startPos: ButtonPosition, endPos: ButtonPosition, progress: number): boolean {
    const startAngle = this.getButtonAngle(startPos);
    let endAngle = this.getButtonAngle(endPos);
    let angleDiff = endAngle - startAngle;

    while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

    // 完全相反 - 无法确定方向
    if (Math.abs(angleDiff) === Math.PI) return false;

    endAngle = startAngle + angleDiff;
    const arcLength = Math.abs(angleDiff) * this.context.radius;

    this.iterateArrowsAlongPath(
      (t) => {
        const angle = startAngle + angleDiff * t;
        return {
          x: this.context.centerX + Math.cos(angle) * this.context.radius,
          y: this.context.centerY + Math.sin(angle) * this.context.radius,
        };
      },
      arcLength,
      progress
    );

    return true;
  }

  private renderVPath(startPos: ButtonPosition, endPos: ButtonPosition, progress: number): boolean {
    // 相反位置: 穿过中心的直线
    if (Math.abs(endPos - startPos) === 4) return false;

    const startPt = this.noteRenderer.getPositionOnRing(startPos);
    const endPt = this.noteRenderer.getPositionOnRing(endPos);
    const center = { x: this.context.centerX, y: this.context.centerY };

    const distToCenter = this.distanceToCenter(startPt.x, startPt.y);
    const distFromCenter = this.distanceToCenter(endPt.x, endPt.y);
    const totalDist = distToCenter + distFromCenter;

    this.iterateArrowsAlongPath(
      (t) => {
        if (t < distToCenter / totalDist) {
          const subT = t / (distToCenter / totalDist);
          return {
            x: startPt.x + (center.x - startPt.x) * subT,
            y: startPt.y + (center.y - startPt.y) * subT,
          };
        } else {
          const subT = (t - distToCenter / totalDist) / (distFromCenter / totalDist);
          return {
            x: center.x + (endPt.x - center.x) * subT,
            y: center.y + (endPt.y - center.y) * subT,
          };
        }
      },
      totalDist,
      progress
    );

    return true;
  }

  private renderSPath(start: Point2D, end: Point2D, progress: number): void {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / length;
    const ny = dy / length;
    const perpX = -ny;
    const perpY = nx;
    const offset = this.context.radius * SLIDE_CURVE_OFFSET_RATIO;

    const mid1 = {
      x: start.x + nx * length * 0.49 + perpX * offset,
      y: start.y + ny * length * 0.49 + perpY * offset,
    };
    const mid2 = {
      x: start.x + nx * length * 0.51 - perpX * offset,
      y: start.y + ny * length * 0.51 - perpY * offset,
    };

    const seg1Len = Math.sqrt(Math.pow(mid1.x - start.x, 2) + Math.pow(mid1.y - start.y, 2));
    const seg2Len = Math.sqrt(Math.pow(mid2.x - mid1.x, 2) + Math.pow(mid2.y - mid1.y, 2));
    const seg3Len = Math.sqrt(Math.pow(end.x - mid2.x, 2) + Math.pow(end.y - mid2.y, 2));
    const totalLen = seg1Len + seg2Len + seg3Len;

    this.iterateArrowsAlongPath(
      (t) => {
        const r1 = seg1Len / totalLen;
        const r2 = seg2Len / totalLen;
        
        if (t < r1) {
          const subT = t / r1;
          return { x: start.x + (mid1.x - start.x) * subT, y: start.y + (mid1.y - start.y) * subT };
        } else if (t < r1 + r2) {
          const subT = (t - r1) / r2;
          return { x: mid1.x + (mid2.x - mid1.x) * subT, y: mid1.y + (mid2.y - mid1.y) * subT };
        } else {
          const subT = (t - r1 - r2) / (1 - r1 - r2);
          return { x: mid2.x + (end.x - mid2.x) * subT, y: mid2.y + (end.y - mid2.y) * subT };
        }
      },
      totalLen,
      progress
    );
  }

  private renderZPath(start: Point2D, end: Point2D, progress: number): void {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const nx = dx / length;
    const ny = dy / length;
    const perpX = -ny;
    const perpY = nx;
    const offset = this.context.radius * SLIDE_CURVE_OFFSET_RATIO;

    // Z 是 S 的镜像
    const mid1 = {
      x: start.x + nx * length * 0.49 - perpX * offset,
      y: start.y + ny * length * 0.49 - perpY * offset,
    };
    const mid2 = {
      x: start.x + nx * length * 0.51 + perpX * offset,
      y: start.y + ny * length * 0.51 + perpY * offset,
    };

    const seg1Len = Math.sqrt(Math.pow(mid1.x - start.x, 2) + Math.pow(mid1.y - start.y, 2));
    const seg2Len = Math.sqrt(Math.pow(mid2.x - mid1.x, 2) + Math.pow(mid2.y - mid1.y, 2));
    const seg3Len = Math.sqrt(Math.pow(end.x - mid2.x, 2) + Math.pow(end.y - mid2.y, 2));
    const totalLen = seg1Len + seg2Len + seg3Len;

    this.iterateArrowsAlongPath(
      (t) => {
        const r1 = seg1Len / totalLen;
        const r2 = seg2Len / totalLen;
        
        if (t < r1) {
          const subT = t / r1;
          return { x: start.x + (mid1.x - start.x) * subT, y: start.y + (mid1.y - start.y) * subT };
        } else if (t < r1 + r2) {
          const subT = (t - r1) / r2;
          return { x: mid1.x + (mid2.x - mid1.x) * subT, y: mid1.y + (mid2.y - mid1.y) * subT };
        } else {
          const subT = (t - r1 - r2) / (1 - r1 - r2);
          return { x: mid2.x + (end.x - mid2.x) * subT, y: mid2.y + (end.y - mid2.y) * subT };
        }
      },
      totalLen,
      progress
    );
  }

  private renderWifiPath(startPos: ButtonPosition, endPos: ButtonPosition, progress: number): void {
    const start = this.noteRenderer.getPositionOnRing(startPos);
    const end = this.noteRenderer.getPositionOnRing(endPos);
    
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    const spacing = WIFI_ARROW_SPACING * this.context.radius / 300;
    const count = Math.floor(length / spacing);

    if (count === 0) return;

    const FAN_SPREAD = 1.0;
    const START_RATIO = 0.07;
    const END_ASPECT = 5.5;
    const START_ASPECT = 3.0;

    const adjacentDistance = this.context.radius * Math.PI / 4;
    const endHeight = adjacentDistance * 2 * FAN_SPREAD;
    const endWidth = endHeight / END_ASPECT;

    const startHeight = endHeight * START_RATIO;
    const startWidth = startHeight / START_ASPECT;

    // 预计算所有可见箭头
    const arrows: { x: number; y: number; height: number; width: number }[] = [];
    
    for (let i = count - 2; i >= 0; i--) {
      const t = (i + 0.5) / count;
      if (t < progress) continue;

      arrows.push({
        x: start.x + dx * t,
        y: start.y + dy * t,
        height: startHeight + (endHeight - startHeight) * t,
        width: startWidth + (endWidth - startWidth) * t,
      });
    }

    if (arrows.length === 0) return;

    // 批量绘制 WiFi 箭头
    this.drawWifiArrowsBatch(arrows, angle);
  }

  private renderCurvePath(startPos: ButtonPosition, endPos: ButtonPosition, originalType: SlidePathType, progress: number): void {
    // 使用原始类型创建段，让 getPointOnSegment 处理镜像
    const segment: SlideSegment = {
      type: originalType,
      startPos,
      endPos,
    };
    const pathFn = (t: number) => this.getPointOnSegment(segment, t);
    const length = this.estimatePathLength(pathFn);
    this.iterateArrowsAlongPath(pathFn, length, progress);
  }

  private iterateArrowsAlongPath(
    pathFn: (t: number) => Point2D,
    totalLength: number,
    progress: number
  ): void {
    const spacing = SLIDE_ARROW_SPACING * this.context.radius / 300;
    const arrowCount = Math.floor(totalLength / spacing);

    if (arrowCount === 0) return;

    // 预计算所有可见箭头的位置和角度
    const arrows: { x: number; y: number; angle: number }[] = [];
    
    for (let i = arrowCount - 1; i >= 0; i--) {
      const t = (i + 0.5) / arrowCount;
      if (t < progress) continue;

      const pos = pathFn(t);
      const nextPos = pathFn(Math.min(t + 0.01, 1));
      const angle = Math.atan2(nextPos.y - pos.y, nextPos.x - pos.x);
      arrows.push({ x: pos.x, y: pos.y, angle });
    }

    if (arrows.length === 0) return;

    // 批量绘制所有箭头
    this.drawSlideArrowsBatch(arrows);
  }

  private drawSlideArrowsBatch(arrows: { x: number; y: number; angle: number }[]): void {
    const ctx = this.context.ctx;
    const arrowHeight = 32 * this.context.radius / 300;
    const arrowWidth = 6 * 1.6 * this.context.radius / 300;
    const lineWidth = this.scaleByRadius(SLIDE_ARROW_WIDTH_RATIO);
    const radiusScale = this.context.radius / 300;
    const currentStroke = ctx.strokeStyle;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 阴影层配置
    const shadows = [
      { offset: 5, alpha: 0.2, extra: 6 },
      { offset: 3, alpha: 0.5, extra: 3 },
    ];

    // 批量绘制阴影层
    for (const shadow of shadows) {
      ctx.beginPath();
      for (const arrow of arrows) {
        const cos = Math.cos(arrow.angle);
        const sin = Math.sin(arrow.angle);
        const offsetX = -shadow.offset * radiusScale;
        
        // 计算变换后的顶点
        const x1 = arrow.x + cos * (-arrowWidth / 2 + offsetX) - sin * (-arrowHeight / 2);
        const y1 = arrow.y + sin * (-arrowWidth / 2 + offsetX) + cos * (-arrowHeight / 2);
        const x2 = arrow.x + cos * (arrowWidth / 2 + offsetX);
        const y2 = arrow.y + sin * (arrowWidth / 2 + offsetX);
        const x3 = arrow.x + cos * (-arrowWidth / 2 + offsetX) - sin * (arrowHeight / 2);
        const y3 = arrow.y + sin * (-arrowWidth / 2 + offsetX) + cos * (arrowHeight / 2);

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
      }
      ctx.lineWidth = lineWidth + shadow.extra;
      ctx.strokeStyle = `rgba(0, 0, 0, ${shadow.alpha})`;
      ctx.stroke();
    }

    // 批量绘制主箭头
    ctx.beginPath();
    for (const arrow of arrows) {
      const cos = Math.cos(arrow.angle);
      const sin = Math.sin(arrow.angle);

      const x1 = arrow.x + cos * (-arrowWidth / 2) - sin * (-arrowHeight / 2);
      const y1 = arrow.y + sin * (-arrowWidth / 2) + cos * (-arrowHeight / 2);
      const x2 = arrow.x + cos * (arrowWidth / 2);
      const y2 = arrow.y + sin * (arrowWidth / 2);
      const x3 = arrow.x + cos * (-arrowWidth / 2) - sin * (arrowHeight / 2);
      const y3 = arrow.y + sin * (-arrowWidth / 2) + cos * (arrowHeight / 2);

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
    }
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = currentStroke;
    ctx.stroke();

    // 批量绘制黑色轮廓
    ctx.lineWidth = lineWidth + 2;
    ctx.strokeStyle = '#000000';
    ctx.globalCompositeOperation = 'destination-over';
    ctx.stroke();

    ctx.restore();
  }


  private drawWifiArrowsBatch(
    arrows: { x: number; y: number; height: number; width: number }[],
    angle: number
  ): void {
    const ctx = this.context.ctx;
    const lineWidth = 19.2 * this.context.radius / 300;
    const radiusScale = this.context.radius / 300;
    const currentStroke = ctx.strokeStyle;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const shadows = [
      { offset: 5, alpha: 0.15, extra: 6 },
      { offset: 3, alpha: 0.4, extra: 3 },
    ];

    // 批量绘制阴影层
    for (const shadow of shadows) {
      ctx.beginPath();
      for (const arrow of arrows) {
        const offsetX = -shadow.offset * radiusScale;
        
        const x1 = arrow.x + cos * (-arrow.width / 2 + offsetX) - sin * (-arrow.height / 2);
        const y1 = arrow.y + sin * (-arrow.width / 2 + offsetX) + cos * (-arrow.height / 2);
        const x2 = arrow.x + cos * (arrow.width / 2 + offsetX);
        const y2 = arrow.y + sin * (arrow.width / 2 + offsetX);
        const x3 = arrow.x + cos * (-arrow.width / 2 + offsetX) - sin * (arrow.height / 2);
        const y3 = arrow.y + sin * (-arrow.width / 2 + offsetX) + cos * (arrow.height / 2);

        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x3, y3);
      }
      ctx.lineWidth = lineWidth + shadow.extra;
      ctx.strokeStyle = `rgba(0, 0, 0, ${shadow.alpha})`;
      ctx.stroke();
    }

    // 批量绘制主箭头
    ctx.beginPath();
    for (const arrow of arrows) {
      const x1 = arrow.x + cos * (-arrow.width / 2) - sin * (-arrow.height / 2);
      const y1 = arrow.y + sin * (-arrow.width / 2) + cos * (-arrow.height / 2);
      const x2 = arrow.x + cos * (arrow.width / 2);
      const y2 = arrow.y + sin * (arrow.width / 2);
      const x3 = arrow.x + cos * (-arrow.width / 2) - sin * (arrow.height / 2);
      const y3 = arrow.y + sin * (-arrow.width / 2) + cos * (arrow.height / 2);

      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
    }
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = currentStroke;
    ctx.stroke();

    // 批量绘制黑色轮廓
    ctx.lineWidth = lineWidth + 2;
    ctx.strokeStyle = '#000000';
    ctx.globalCompositeOperation = 'destination-over';
    ctx.stroke();

    ctx.restore();
  }


  renderSlideStar(
    note: SlideNote,
    progress: number,
    segments: SlideSegment[],
    pathIndex: number,
    currentTimeMs: number,
    isSimultaneous: boolean
  ): void {
    // WiFi 滑条有特殊的星星渲染
    if (segments.length > 0 && segments[0].type === 'w') {
      this.renderWifiStars(note, progress, segments, currentTimeMs, isSimultaneous, pathIndex);
      return;
    }

    const delayMs = note.delayMs ?? 60000 / note.bpm;
    const slideStart = note.timingMs + delayMs;
    
    let starPos: Point2D;
    let starScale = 1;
    let rotation = 0;
    const isSliding = currentTimeMs >= slideStart;

    if (!isSliding) {
      // 滑条开始前: 星星在起始位置，逐渐增长，使用累积旋转
      starPos = this.noteRenderer.getPositionOnRing(segments[0].startPos);
      const elapsed = currentTimeMs - note.timingMs;
      starScale = Math.min(1, elapsed / delayMs);
      
      if (this.context.config.slideRotation) {
        rotation = this.calculateStarRotation(note, currentTimeMs);
      }
    } else {
      // 滑条期间: 星星沿着路径移动，根据路径切线方向旋转
      starPos = this.getPointAlongPath(progress, segments);
      starScale = 1;
      
      if (this.context.config.slideRotation) {
        rotation = this.getPathTangentAngle(progress, segments) + Math.PI / 2;
      }
    }

    if (!starPos) return;

    this.withContext(() => {
      this.context.ctx.globalAlpha = 1;
      const size = this.context.radius / 10.42 * starScale * 1.2;

      let color: string;
      const isBreak = note.allSlideBreaks?.[pathIndex] && !this.context.config.normalColorBreakSlide;
      
      if (isBreak) {
        color = COLORS.BREAK_ORANGE;
      } else if (isSimultaneous) {
        color = COLORS.SLIDE_SIMULTANEOUS;
      } else {
        color = this.context.config.pinkSlideStart ? COLORS.SLIDE_PINK : COLORS.SLIDE_CYAN;
      }

      this.drawStar(starPos.x, starPos.y, size, color, rotation);
    });
  }

  private renderWifiStars(
    note: SlideNote,
    progress: number,
    segments: SlideSegment[],
    currentTimeMs: number,
    isSimultaneous: boolean,
    pathIndex: number
  ): void {
    const delayMs = note.delayMs ?? 60000 / note.bpm;
    const slideStart = note.timingMs + delayMs;
    const startPos = segments[0].startPos;
    const endPos = segments[0].endPos;

    // 三个扇形位置
    const fanPositions = [
      { startPos, endPos },
      { startPos, endPos: ((endPos - 1 - 1 + 8) % 8 + 1) as ButtonPosition },
      { startPos, endPos: ((endPos - 1 + 1) % 8 + 1) as ButtonPosition },
    ];

    this.withContext(() => {
      this.context.ctx.globalAlpha = 1;

      for (const fan of fanPositions) {
        let starPos: Point2D;
        let starScale = 1;

        if (currentTimeMs < slideStart) {
          starPos = this.noteRenderer.getPositionOnRing(fan.startPos);
          const elapsed = currentTimeMs - note.timingMs;
          starScale = Math.min(1, elapsed / delayMs);
        } else {
          const start = this.noteRenderer.getPositionOnRing(fan.startPos);
          const end = this.noteRenderer.getPositionOnRing(fan.endPos);
          starPos = {
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
          };
        }

        if (starPos) {
          const size = this.context.radius / 10.42 * starScale * 1.2;
          const isBreak = note.allSlideBreaks?.[pathIndex] && !this.context.config.normalColorBreakSlide;
          
          let color: string;
          if (isBreak) {
            color = COLORS.BREAK_ORANGE;
          } else if (isSimultaneous) {
            color = COLORS.SLIDE_SIMULTANEOUS;
          } else {
            color = this.context.config.pinkSlideStart ? COLORS.SLIDE_PINK : COLORS.SLIDE_CYAN;
          }

          this.drawStar(starPos.x, starPos.y, size, color, 0);
        }
      }
    });
  }

  drawStar(x: number, y: number, size: number, color: string, rotation: number = 0): void {
    this.withContext(() => {
      const ctx = this.context.ctx;
      
      if (rotation !== 0) {
        ctx.translate(x, y);
        ctx.rotate(rotation);
        ctx.translate(-x, -y);
      }

      const outerRadius = size;
      const innerRadius = size * 0.5;
      const innerHoleOuter = outerRadius * 0.55;
      const innerHoleInner = innerRadius * 0.55;

      // 外星
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // 内孔 (创建环形效果)
      for (let i = 9; i >= 0; i--) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? innerHoleOuter : innerHoleInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 9) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = color;
      ctx.fill();

      // 白色轮廓
      ctx.strokeStyle = COLORS.WHITE;
      ctx.lineWidth = this.getNoteStrokeWidth();

      // 绘制外星轮廓
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // 绘制内孔轮廓
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? innerHoleOuter : innerHoleInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();

      // 中心点
      const centerSize = size * 0.15;
      ctx.beginPath();
      ctx.arc(x, y, centerSize, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }

  renderExStarRing(
    x: number, 
    y: number, 
    size: number, 
    isBreak: boolean = false, 
    isSimultaneous: boolean = false, 
    scaleFactor: number = 1
  ): void {
    this.withContext(() => {
      const ctx = this.context.ctx;
      
      const scale = 1.19 * scaleFactor;
      const outerRadius = size * scale;
      const outerInner = size * 0.5 * scale;
      const innerRadius = size;
      const innerInner = size * 0.5;

      // 根据类型选择颜色
      let color: string;
      if (isBreak) {
        color = 'rgba(255, 200, 120, 0.8)';
      } else if (isSimultaneous) {
        color = 'rgba(255, 245, 150, 0.8)';
      } else if (this.context.config.pinkSlideStart) {
        color = 'rgba(255, 180, 210, 0.8)';
      } else {
        color = 'rgba(100, 230, 230, 0.8)';
      }

      ctx.beginPath();
      // 外星形状
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI / 5) - Math.PI / 2;
        const radius = i % 2 === 0 ? outerRadius : outerInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // 内孔 (星形孔)
      for (let i = 9; i >= 0; i--) {
        const angle = (i * Math.PI / 5) - Math.PI / 2;
        const radius = i % 2 === 0 ? innerRadius : innerInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 9) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = color;
      ctx.fill();
    });
  }

  renderExSplitStarRing(
    x: number, 
    y: number, 
    size: number, 
    isBreak: boolean = false, 
    isSimultaneous: boolean = false, 
    scaleFactor: number = 1
  ): void {
    this.withContext(() => {
      const ctx = this.context.ctx;
      
      const scale = 1.19 * scaleFactor;
      const outerRadius = size * scale;
      const outerInner = size * 0.5 * scale;
      const innerRadius = size;
      const innerInner = size * 0.5;

      // 根据类型选择颜色
      let color: string;
      if (isBreak) {
        color = 'rgba(255, 200, 120, 0.8)';
      } else if (isSimultaneous) {
        color = 'rgba(255, 245, 150, 0.8)';
      } else if (this.context.config.pinkSlideStart) {
        color = 'rgba(255, 180, 210, 0.8)';
      } else {
        color = 'rgba(100, 230, 230, 0.8)';
      }

      // 第一个星星 (指向向上，baseAngle = -PI/2)
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI / 5) - Math.PI / 2;
        const radius = i % 2 === 0 ? outerRadius : outerInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      for (let i = 9; i >= 0; i--) {
        const angle = (i * Math.PI / 5) - Math.PI / 2;
        const radius = i % 2 === 0 ? innerRadius : innerInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 9) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = color;
      ctx.fill();

      // 第二个星星 (指向向下，baseAngle = PI/2)
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI / 5) + Math.PI / 2;
        const radius = i % 2 === 0 ? outerRadius : outerInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      for (let i = 9; i >= 0; i--) {
        const angle = (i * Math.PI / 5) + Math.PI / 2;
        const radius = i % 2 === 0 ? innerRadius : innerInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 9) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fill();
    });
  }

  private calculateStarRotation(note: SlideNote, currentTimeMs: number): number {
    const durationMs = note.allDurationMs ? note.allDurationMs[0] : note.durationMs;
    const segments = note.allSlideSegments ? note.allSlideSegments[0] : note.slideSegments;
    
    if (!segments || segments.length === 0 || !durationMs || durationMs === 0) return 0;

    // 计算路径长度（像素）
    let totalLengthPixels = 0;
    for (const seg of segments) {
      totalLengthPixels += this.getSegmentLength(seg);
    }

    // 归一化到标准半径 300
    const normalizedLength = totalLengthPixels * (300 / this.context.radius);

    // 原始公式：SpeedMultiplier = (NormalizedLength / π / TotalDuration(ms)) × 15 (度/帧@60FPS)
    // 转换为时间基准：(度/帧) / (1000ms/60帧) = (度/帧) × 0.06 = 度/ms
    const rotationSpeedDegPerMs = (normalizedLength / Math.PI / durationMs) * 15 * 0.06;
    
    // 限制最大值：18.0 度/帧
    const MAX_ROTATION_DEG_PER_MS = 1.08;
    const cappedRotationDegPerMs = Math.min(rotationSpeedDegPerMs, MAX_ROTATION_DEG_PER_MS);
    
    // 转换为弧度并应用旋转方向（负号表示顺时针）
    const rotationSpeedRadPerMs = -cappedRotationDegPerMs * (Math.PI / 180);

    const approachTime = this.getApproachTimeMs();
    const visibilityStart = note.timingMs - approachTime;
    
    if (currentTimeMs < visibilityStart) return 0;

    // 计算经过的时间（毫秒）并返回累计旋转角度（弧度）
    const elapsedMs = currentTimeMs - visibilityStart;
    return rotationSpeedRadPerMs * elapsedMs;
  }

  getSegmentLength(segment: SlideSegment): number {
    if (segment.cachedLength !== undefined) {
      return segment.cachedLength;
    }

    let length = 0;
    const pathFn = (t: number) => this.getPointOnSegment(segment, t);
    let prevPoint = pathFn(0);

    for (let i = 1; i <= 50; i++) {
      const t = i / 50;
      const point = pathFn(t);
      const dx = point.x - prevPoint.x;
      const dy = point.y - prevPoint.y;
      length += Math.sqrt(dx * dx + dy * dy);
      prevPoint = point;
    }

    segment.cachedLength = length;
    return length;
  }

  getPointOnSegment(segment: SlideSegment, t: number): Point2D {
    const start = this.noteRenderer.getPositionOnRing(segment.startPos);
    const end = this.noteRenderer.getPositionOnRing(segment.endPos);
    
    // 镜像路径类型和位置用于正确的路径计算
    const mirroredType = this.mirrorPathType(segment.type);
    const mirroredStartPos = this.mirrorPosition(segment.startPos);
    const mirroredEndPos = this.mirrorPosition(segment.endPos);

    switch (mirroredType) {
      case '-':
        return {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        };

      case '>':
      case '<':
      case '^': {
        const startAngle = this.getButtonAngle(segment.startPos);
        const endAngle = this.getButtonAngle(segment.endPos);
        let angleDiff = endAngle - startAngle;

        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        // 使用原始位置判断弧方向
        if (mirroredType === '>') {
          const isLeft = [1, 2, 7, 8].includes(segment.startPos);
          if (isLeft ? angleDiff <= 0 : angleDiff >= 0) {
            angleDiff += (isLeft ? 1 : -1) * 2 * Math.PI;
          }
        } else if (mirroredType === '<') {
          const isLeft = [1, 2, 7, 8].includes(segment.startPos);
          if (isLeft ? angleDiff >= 0 : angleDiff <= 0) {
            angleDiff += (isLeft ? -1 : 1) * 2 * Math.PI;
          }
        }

        const angle = startAngle + angleDiff * t;
        return {
          x: this.context.centerX + Math.cos(angle) * this.context.radius,
          y: this.context.centerY + Math.sin(angle) * this.context.radius,
        };
      }

      case 'v':
        if (Math.abs(mirroredEndPos - mirroredStartPos) === 4) {
          return {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t,
          };
        }
        if (t < 0.5) {
          const subT = t * 2;
          return {
            x: start.x + (this.context.centerX - start.x) * subT,
            y: start.y + (this.context.centerY - start.y) * subT,
          };
        } else {
          const subT = (t - 0.5) * 2;
          return {
            x: this.context.centerX + (end.x - this.context.centerX) * subT,
            y: this.context.centerY + (end.y - this.context.centerY) * subT,
          };
        }

      case 's': {
        // S 曲线: start → ctrl1 → ctrl2 → end
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;
        const perpX = -uy;
        const perpY = ux;
        const offset = 0.4 * this.context.radius;

        const ctrl1X = start.x + ux * len * 0.49 + perpX * offset;
        const ctrl1Y = start.y + uy * len * 0.49 + perpY * offset;
        const ctrl2X = start.x + ux * len * 0.51 - perpX * offset;
        const ctrl2Y = start.y + uy * len * 0.51 - perpY * offset;

        const len1 = Math.sqrt((ctrl1X - start.x) ** 2 + (ctrl1Y - start.y) ** 2);
        const len2 = Math.sqrt((ctrl2X - ctrl1X) ** 2 + (ctrl2Y - ctrl1Y) ** 2);
        const len3 = Math.sqrt((end.x - ctrl2X) ** 2 + (end.y - ctrl2Y) ** 2);
        const total = len1 + len2 + len3;
        const r1 = len1 / total;
        const r2 = len2 / total;

        if (t < r1) {
          const subT = t / r1;
          return { x: start.x + (ctrl1X - start.x) * subT, y: start.y + (ctrl1Y - start.y) * subT };
        } else if (t < r1 + r2) {
          const subT = (t - r1) / r2;
          return { x: ctrl1X + (ctrl2X - ctrl1X) * subT, y: ctrl1Y + (ctrl2Y - ctrl1Y) * subT };
        } else {
          const subT = (t - r1 - r2) / (1 - r1 - r2);
          return { x: ctrl2X + (end.x - ctrl2X) * subT, y: ctrl2Y + (end.y - ctrl2Y) * subT };
        }
      }

      case 'z': {
        // Z 曲线: S 的反向
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;
        const perpX = -uy;
        const perpY = ux;
        const offset = 0.4 * this.context.radius;

        // Z 路线: start → ctrl1 (右侧) → ctrl2 (左侧) → end
        const ctrl1X = start.x + ux * len * 0.49 + perpX * offset;
        const ctrl1Y = start.y + uy * len * 0.49 + perpY * offset;
        const ctrl2X = start.x + ux * len * 0.51 - perpX * offset;
        const ctrl2Y = start.y + uy * len * 0.51 - perpY * offset;

        const len1 = Math.sqrt((ctrl2X - start.x) ** 2 + (ctrl2Y - start.y) ** 2);
        const len2 = Math.sqrt((ctrl1X - ctrl2X) ** 2 + (ctrl1Y - ctrl2Y) ** 2);
        const len3 = Math.sqrt((end.x - ctrl1X) ** 2 + (end.y - ctrl1Y) ** 2);
        const total = len1 + len2 + len3;
        const r1 = len1 / total;
        const r2 = len2 / total;

        if (t < r1) {
          const subT = t / r1;
          return { x: start.x + (ctrl2X - start.x) * subT, y: start.y + (ctrl2Y - start.y) * subT };
        } else if (t < r1 + r2) {
          const subT = (t - r1) / r2;
          return { x: ctrl2X + (ctrl1X - ctrl2X) * subT, y: ctrl2Y + (ctrl1Y - ctrl2Y) * subT };
        } else {
          const subT = (t - r1 - r2) / (1 - r1 - r2);
          return { x: ctrl1X + (end.x - ctrl1X) * subT, y: ctrl1Y + (end.y - ctrl1Y) * subT };
        }
      }

      case 'q':
      case 'qq': {
        // 逆时针曲线
        if (mirroredType === 'qq') {
          // 双曲线: entry → arc around offset circle → exit
          const interPos = ((mirroredStartPos - 1 + 4) % 8 + 1) as ButtonPosition;
          const interPoint = this.noteRenderer.getPositionOnRing(this.mirrorPosition(interPos)); // 传入原始位置
          
          // 入口点在 40% 处靠近中间
          const entryX = start.x + 0.4 * (interPoint.x - start.x);
          const entryY = start.y + 0.4 * (interPoint.y - start.y);
          
          // 方向向量
          const dirX = interPoint.x - start.x;
          const dirY = interPoint.y - start.y;
          const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
          const unitX = dirX / dirLen;
          const unitY = dirY / dirLen;
          
          // 圆心 (q 的垂直偏移: -unitY, +unitX)
          const circleRadius = 0.45 * this.context.radius;
          const circleX = entryX + (-unitY) * circleRadius;
          const circleY = entryY + unitX * circleRadius;
          
          // 圆上的起始角度
          const startAngle = Math.atan2(entryY - circleY, entryX - circleX);
          
          // 根据镜像后的位置差计算扫掠角度
          const posDiff = (mirroredEndPos - mirroredStartPos + 8) % 8;
          let sweepAngle: number;
          switch (posDiff) {
            case 0: sweepAngle = 1.25 * Math.PI; break;
            case 1: sweepAngle = 1.5 * Math.PI; break;
            case 2: sweepAngle = 1.625 * Math.PI; break;
            case 3: sweepAngle = 1.875 * Math.PI; break;
            case 4: default: sweepAngle = 2 * Math.PI; break;
            case 5: sweepAngle = 2.25 * Math.PI; break;
            case 6: sweepAngle = 0.75 * Math.PI; break;
            case 7: sweepAngle = 1.125 * Math.PI; break;
          }
          
          const endAngle = startAngle + sweepAngle;
          const arcLen = Math.abs(sweepAngle) * circleRadius;
          const exitX = circleX + Math.cos(endAngle) * circleRadius;
          const exitY = circleY + Math.sin(endAngle) * circleRadius;
          
          const len1 = Math.sqrt((entryX - start.x) ** 2 + (entryY - start.y) ** 2);
          const len3 = Math.sqrt((end.x - exitX) ** 2 + (end.y - exitY) ** 2);
          const total = len1 + arcLen + len3;
          const r1 = len1 / total;
          const r2 = arcLen / total;
          
          if (t < r1) {
            const subT = t / r1;
            return { x: start.x + (entryX - start.x) * subT, y: start.y + (entryY - start.y) * subT };
          } else if (t < r1 + r2) {
            const angle = startAngle + ((t - r1) / r2) * sweepAngle;
            return { x: circleX + Math.cos(angle) * circleRadius, y: circleY + Math.sin(angle) * circleRadius };
          } else {
            const subT = (t - r1 - r2) / (1 - r1 - r2);
            return { x: exitX + (end.x - exitX) * subT, y: exitY + (end.y - exitY) * subT };
          }
        } else {
          // 单曲线: 围绕中心弧
          const interPos = ((mirroredStartPos + 3 - 1) % 8 + 1) as ButtonPosition;
          const interPoint = this.noteRenderer.getPositionOnRing(this.mirrorPosition(interPos)); // 传入原始位置
          
          // 起点和中间点之间的中点
          const midX = (start.x + interPoint.x) / 2;
          const midY = (start.y + interPoint.y) / 2;
          
          const circleRadius = Math.sqrt((midX - this.context.centerX) ** 2 + (midY - this.context.centerY) ** 2);
          const startAngle = Math.atan2(midY - this.context.centerY, midX - this.context.centerX);
          
          // 根据镜像后的位置差计算扫掠角度
          const posDiff = (mirroredEndPos - mirroredStartPos + 8) % 8;
          let sweepAngle: number;
          switch (posDiff) {
            case 0: sweepAngle = 1.25 * Math.PI; break;
            case 1: sweepAngle = 1.5 * Math.PI; break;
            case 2: sweepAngle = 1.75 * Math.PI; break;
            case 3: default: sweepAngle = 2 * Math.PI; break;
            case 4: sweepAngle = 0.25 * Math.PI; break;
            case 5: sweepAngle = 0.5 * Math.PI; break;
            case 6: sweepAngle = 0.75 * Math.PI; break;
            case 7: sweepAngle = Math.PI; break;
          }
          
          const endAngle = startAngle + sweepAngle;
          const arcLen = Math.abs(sweepAngle) * circleRadius;
          const exitX = this.context.centerX + Math.cos(endAngle) * circleRadius;
          const exitY = this.context.centerY + Math.sin(endAngle) * circleRadius;
          
          const len1 = Math.sqrt((midX - start.x) ** 2 + (midY - start.y) ** 2);
          const len3 = Math.sqrt((end.x - exitX) ** 2 + (end.y - exitY) ** 2);
          const total = len1 + arcLen + len3;
          const r1 = len1 / total;
          const r2 = arcLen / total;
          
          if (t < r1) {
            const subT = t / r1;
            return { x: start.x + (midX - start.x) * subT, y: start.y + (midY - start.y) * subT };
          } else if (t < r1 + r2) {
            const angle = startAngle + ((t - r1) / r2) * sweepAngle;
            return { x: this.context.centerX + Math.cos(angle) * circleRadius, y: this.context.centerY + Math.sin(angle) * circleRadius };
          } else {
            const subT = (t - r1 - r2) / (1 - r1 - r2);
            return { x: exitX + (end.x - exitX) * subT, y: exitY + (end.y - exitY) * subT };
          }
        }
      }

      case 'p':
      case 'pp': {
        // 顺时针曲线
        if (mirroredType === 'pp') {
          // 双曲线: 入口 → 围绕偏移圆弧 → 退出
          const interPos = ((mirroredStartPos - 1 + 4) % 8 + 1) as ButtonPosition;
          const interPoint = this.noteRenderer.getPositionOnRing(this.mirrorPosition(interPos)); // 传入原始位置
          
          // 入口点在 40% 处靠近中间
          const entryX = start.x + 0.4 * (interPoint.x - start.x);
          const entryY = start.y + 0.4 * (interPoint.y - start.y);
          
          // 方向向量
          const dirX = interPoint.x - start.x;
          const dirY = interPoint.y - start.y;
          const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
          const unitX = dirX / dirLen;
          const unitY = dirY / dirLen;
          
          // 圆心 (p 的垂直偏移: +unitY, -unitX)
          const circleRadius = 0.45 * this.context.radius;
          const circleX = entryX + unitY * circleRadius;
          const circleY = entryY + (-unitX) * circleRadius;
          
          // 圆上的起始角度
          const startAngle = Math.atan2(entryY - circleY, entryX - circleX);
          
          // 根据镜像后的位置差计算扫掠角度 (顺时针为负)
          const posDiff = (mirroredEndPos - mirroredStartPos + 8) % 8;
          let sweepAngle: number;
          switch (posDiff) {
            case 0: sweepAngle = -1.25 * Math.PI; break;
            case 1: sweepAngle = -1.125 * Math.PI; break;
            case 2: sweepAngle = -0.75 * Math.PI; break;
            case 3: sweepAngle = -2.25 * Math.PI; break;
            case 4: default: sweepAngle = -2 * Math.PI; break;
            case 5: sweepAngle = -1.875 * Math.PI; break;
            case 6: sweepAngle = -1.625 * Math.PI; break;
            case 7: sweepAngle = -1.5 * Math.PI; break;
          }
          
          const endAngle = startAngle + sweepAngle;
          const arcLen = Math.abs(sweepAngle) * circleRadius;
          const exitX = circleX + Math.cos(endAngle) * circleRadius;
          const exitY = circleY + Math.sin(endAngle) * circleRadius;
          
          const len1 = Math.sqrt((entryX - start.x) ** 2 + (entryY - start.y) ** 2);
          const len3 = Math.sqrt((end.x - exitX) ** 2 + (end.y - exitY) ** 2);
          const total = len1 + arcLen + len3;
          const r1 = len1 / total;
          const r2 = arcLen / total;
          
          if (t < r1) {
            const subT = t / r1;
            return { x: start.x + (entryX - start.x) * subT, y: start.y + (entryY - start.y) * subT };
          } else if (t < r1 + r2) {
            const angle = startAngle + ((t - r1) / r2) * sweepAngle;
            return { x: circleX + Math.cos(angle) * circleRadius, y: circleY + Math.sin(angle) * circleRadius };
          } else {
            const subT = (t - r1 - r2) / (1 - r1 - r2);
            return { x: exitX + (end.x - exitX) * subT, y: exitY + (end.y - exitY) * subT };
          }
        } else {
          // 单曲线: 围绕中心弧
          const interPos = ((mirroredStartPos + 5 - 1) % 8 + 1) as ButtonPosition;
          const interPoint = this.noteRenderer.getPositionOnRing(this.mirrorPosition(interPos)); // 传入原始位置
          
          // 起点和中间点之间的中点
          const midX = (start.x + interPoint.x) / 2;
          const midY = (start.y + interPoint.y) / 2;
          
          const circleRadius = Math.sqrt((midX - this.context.centerX) ** 2 + (midY - this.context.centerY) ** 2);
          const startAngle = Math.atan2(midY - this.context.centerY, midX - this.context.centerX);
          
          // 根据镜像后的位置差计算扫掠角度 (顺时针为负)
          const posDiff = (mirroredEndPos - mirroredStartPos + 8) % 8;
          let sweepAngle: number;
          switch (posDiff) {
            case 0: sweepAngle = -1.25 * Math.PI; break;
            case 1: sweepAngle = -Math.PI; break;
            case 2: sweepAngle = -0.75 * Math.PI; break;
            case 3: sweepAngle = -0.5 * Math.PI; break;
            case 4: sweepAngle = -0.25 * Math.PI; break;
            case 5: default: sweepAngle = -2 * Math.PI; break;
            case 6: sweepAngle = -1.75 * Math.PI; break;
            case 7: sweepAngle = -1.5 * Math.PI; break;
          }
          
          const endAngle = startAngle + sweepAngle;
          const arcLen = Math.abs(sweepAngle) * circleRadius;
          const exitX = this.context.centerX + Math.cos(endAngle) * circleRadius;
          const exitY = this.context.centerY + Math.sin(endAngle) * circleRadius;
          
          const len1 = Math.sqrt((midX - start.x) ** 2 + (midY - start.y) ** 2);
          const len3 = Math.sqrt((end.x - exitX) ** 2 + (end.y - exitY) ** 2);
          const total = len1 + arcLen + len3;
          const r1 = len1 / total;
          const r2 = arcLen / total;
          
          if (t < r1) {
            const subT = t / r1;
            return { x: start.x + (midX - start.x) * subT, y: start.y + (midY - start.y) * subT };
          } else if (t < r1 + r2) {
            const angle = startAngle + ((t - r1) / r2) * sweepAngle;
            return { x: this.context.centerX + Math.cos(angle) * circleRadius, y: this.context.centerY + Math.sin(angle) * circleRadius };
          } else {
            const subT = (t - r1 - r2) / (1 - r1 - r2);
            return { x: exitX + (end.x - exitX) * subT, y: exitY + (end.y - exitY) * subT };
          }
        }
      }

      default:
        // 对于未知类型，使用线性插值作为备用
        return {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        };
    }
  }

  /**
   * 沿着多段路径获取点
   */
  private getPointAlongPath(progress: number, segments: SlideSegment[]): Point2D {
    if (!segments || segments.length === 0) {
      return { x: this.context.centerX, y: this.context.centerY };
    }

    const lengths = segments.map(seg => this.getSegmentLength(seg));
    const totalLength = lengths.reduce((a, b) => a + b, 0);

    if (totalLength === 0) {
      return this.noteRenderer.getPositionOnRing(segments[0].startPos);
    }

    const targetDist = progress * totalLength;
    let cumulative = 0;

    for (let i = 0; i < segments.length; i++) {
      if (cumulative + lengths[i] >= targetDist) {
        const t = lengths[i] > 0 ? (targetDist - cumulative) / lengths[i] : 0;
        return this.getPointOnSegment(segments[i], t);
      }
      cumulative += lengths[i];
    }

    // 返回最后一个段末尾
    const lastSeg = segments[segments.length - 1];
    return this.noteRenderer.getPositionOnRing(lastSeg.endPos);
  }

  private getPathTangentAngle(progress: number, segments: SlideSegment[]): number {
    if (!segments || segments.length === 0) return 0;

    const lengths = segments.map(seg => this.getSegmentLength(seg));
    const totalLength = lengths.reduce((a, b) => a + b, 0);

    if (totalLength === 0) return 0;

    const targetDist = progress * totalLength;
    let cumulative = 0;

    for (let i = 0; i < segments.length; i++) {
      if (cumulative + lengths[i] >= targetDist) {
        const t = lengths[i] > 0 ? (targetDist - cumulative) / lengths[i] : 0;
        // 计算当前段的切线方向
        const delta = 0.01; // 用于计算切线的微小偏移
        const t1 = Math.max(0, t - delta);
        const t2 = Math.min(1, t + delta);
        const p1 = this.getPointOnSegment(segments[i], t1);
        const p2 = this.getPointOnSegment(segments[i], t2);
        return Math.atan2(p2.y - p1.y, p2.x - p1.x);
      }
      cumulative += lengths[i];
    }

    // 返回最后一个段的切线角度
    const lastSeg = segments[segments.length - 1];
    const p1 = this.getPointOnSegment(lastSeg, 0.99);
    const p2 = this.getPointOnSegment(lastSeg, 1);
    return Math.atan2(p2.y - p1.y, p2.x - p1.x);
  }

  /**
   * 通过采样估计路径长度
   */
  private estimatePathLength(pathFn: (t: number) => Point2D): number {
    let length = 0;
    let prev = pathFn(0);
    
    for (let i = 1; i <= 50; i++) {
      const curr = pathFn(i / 50);
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      length += Math.sqrt(dx * dx + dy * dy);
      prev = curr;
    }

    return length;
  }
}

export default SlideRenderer;
