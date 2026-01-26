import { Point2D, RendererConfig, BpmEvent } from '../types';
import {
  BASE_ANGLE,
  BUTTON_ANGLE_OFFSET,
  BUTTON_ANGLE_STEP,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
} from '../utils/constants';

export interface RenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  centerX: number;
  centerY: number;
  radius: number;
  hiSpeed: number;
  baseApproachTimeMs: number;
  config: RendererConfig;
}

export abstract class BaseRenderer {
  protected context: RenderContext;

  constructor(context: RenderContext) {
    this.context = context;
  }

  updateContext(context: Partial<RenderContext>): void {
    Object.assign(this.context, context);
  }

  protected mirrorPosition(position: number): number {
    const mode = this.context.config.mirrorMode;
    if (mode === 'none') return position;

    // 位置镜像查找表
    const mirrorH = [0, 8, 7, 6, 5, 4, 3, 2, 1]; // L↔R: 1↔8, 2↔7, 3↔6, 4↔5
    const mirrorV = [0, 4, 3, 2, 1, 8, 7, 6, 5]; // U↔D: 1↔4, 2↔3, 5↔8, 6↔7
    const rotate180 = [0, 5, 6, 7, 8, 1, 2, 3, 4]; // 180°: 1↔5, 2↔6, 3↔7, 4↔8

    switch (mode) {
      case 'horizontal': return mirrorH[position];
      case 'vertical': return mirrorV[position];
      case 'rotate180': return rotate180[position];
      default: return position;
    }
  }

  protected getButtonAngle(position: number): number {
    const mirroredPos = this.mirrorPosition(position);
    return BASE_ANGLE + BUTTON_ANGLE_OFFSET + (mirroredPos - 1) * BUTTON_ANGLE_STEP;
  }

  protected getButtonPosition(position: number): Point2D {
    const angle = this.getButtonAngle(position);
    return {
      x: this.context.centerX + Math.cos(angle) * this.context.radius,
      y: this.context.centerY + Math.sin(angle) * this.context.radius,
    };
  }

  protected getApproachTimeMs(): number {
    return this.context.baseApproachTimeMs / this.context.hiSpeed;
  }

  protected distanceToCenter(x: number, y: number): number {
    return Math.sqrt(
      Math.pow(x - this.context.centerX, 2) +
      Math.pow(y - this.context.centerY, 2)
    );
  }

  protected scaleByRadius(ratio: number): number {
    return ratio * this.context.radius;
  }

  protected getNoteStrokeWidth(): number {
    return this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
  }

  protected beatsToMs(beats: number, bpmEvents: BpmEvent[] | null, defaultBpm: number): number {
    if (!bpmEvents || bpmEvents.length === 0) {
      return (60000 * beats) / defaultBpm;
    }

    let totalMs = 0;
    let lastBeat = 0;
    // 在第一个 BPM 事件之前使用 defaultBpm
    let currentBpm = defaultBpm;

    for (const event of bpmEvents) {
      if (event.timing >= beats) break;
      totalMs += (60000 * (event.timing - lastBeat)) / currentBpm;
      lastBeat = event.timing;
      currentBpm = event.bpm;
    }

    totalMs += (60000 * (beats - lastBeat)) / currentBpm;
    return totalMs;
  }

  protected durationToMs(duration: number, bpm: number): number {
    return (60000 * duration) / bpm;
  }

  protected getBpmAtTiming(timing: number, bpmEvents: BpmEvent[] | null, defaultBpm: number): number {
    if (!bpmEvents || bpmEvents.length === 0) {
      return defaultBpm;
    }

    // 在第一个 BPM 事件之前使用 defaultBpm
    let currentBpm = defaultBpm;
    for (const event of bpmEvents) {
      if (event.timing > timing) break;
      currentBpm = event.bpm;
    }
    return currentBpm;
  }

  protected getDdrColor(timing: number): string | null {
    if (!this.context.config.ddrColorMode) {
      return null;
    }

    const epsilon = 0.001;
    const fractional = Math.abs(timing % 1);

    // 节拍（1/1）
    if (fractional < epsilon || fractional > 1 - epsilon) {
      return COLORS.DDR_RED;
    }

    // 半节拍（1/2）
    const halfFrac = Math.abs(timing % 0.5);
    if (halfFrac < epsilon || halfFrac > 0.499) {
      return COLORS.DDR_BLUE;
    }

    // 四分之一节拍（1/4）
    const quarterFrac = Math.abs(timing % 0.25);
    if (quarterFrac < epsilon || quarterFrac > 0.249) {
      return COLORS.DDR_YELLOW;
    }

    // 扩展模式颜色
    if (this.context.config.ddrColorExtended) {
      // 八分之一节拍（1/8）
      const eighthFrac = Math.abs(timing % 0.125);
      if (eighthFrac < epsilon || eighthFrac > 0.124) {
        return COLORS.DDR_ORANGE;
      }

      // 六分之一节拍（1/6）
      const sixthFrac = 1 / 6;
      const sixthRemainder = Math.abs(timing % sixthFrac);
      if (sixthRemainder < epsilon || sixthRemainder > sixthFrac - epsilon) {
        return COLORS.DDR_CYAN;
      }
    }

    return COLORS.DDR_GREEN;
  }

  protected withContext(drawFn: () => void): void {
    this.context.ctx.save();
    try {
      drawFn();
    } finally {
      this.context.ctx.restore();
    }
  }

  protected drawCircle(x: number, y: number, radius: number): void {
    this.context.ctx.beginPath();
    this.context.ctx.arc(x, y, radius, 0, Math.PI * 2);
  }

  protected drawRing(x: number, y: number, innerRadius: number, outerRadius: number): void {
    this.context.ctx.beginPath();
    this.context.ctx.arc(x, y, outerRadius, 0, Math.PI * 2, false);
    this.context.ctx.arc(x, y, innerRadius, 0, Math.PI * 2, true);
    this.context.ctx.closePath();
  }
}

export default BaseRenderer;
