import { Point2D, RendererConfig, TouchPosition, ButtonPosition } from "../types";
import {
  BASE_ANGLE,
  BUTTON_ANGLE_OFFSET,
  BUTTON_ANGLE_STEP,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  DDR_DARKEN_RATIO,
} from "../utils/constants";
import { mirrorTouchSensor, touchSensorPoint } from "../utils/touchGeometry";

/** 插值混合两个十六进制 RGB 颜色（#rrggbb），amount 范围 0~1。 */
export function mixHexColor(color: string, target: string, amount: number): string {
  const parse = (value: string) => Number.parseInt(value, 16);
  const r = parse(color.slice(1, 3));
  const g = parse(color.slice(3, 5));
  const b = parse(color.slice(5, 7));
  const tr = parse(target.slice(1, 3));
  const tg = parse(target.slice(3, 5));
  const tb = parse(target.slice(5, 7));
  const mix = (from: number, to: number) => Math.round(from + (to - from) * amount);
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  return `#${toHex(mix(r, tr))}${toHex(mix(g, tg))}${toHex(mix(b, tb))}`;
}

/**
 * 按倍率缩放 #rrggbb 的逐通道亮度并截断到 0~255。
 * 不用 mixHexColor 混黑白是因为它对亮暗两侧不对称，还会把已饱和通道往白里拉。
 */
export function scaleHexBrightness(color: string, factor: number): string {
  const channel = (offset: number) => {
    const value = Math.round(Number.parseInt(color.slice(offset, offset + 2), 16) * factor);
    return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** 音符渐变色对 [startColor, endColor]，优先级：节拍着色 > Break > 双押 > 普通 Tap。 */
export function getGradientColors(
  ddrColor: string | null,
  isBreak: boolean,
  isSimultaneous: boolean,
): [string, string] {
  if (ddrColor) {
    return [ddrColor, mixHexColor(ddrColor, COLORS.BLACK, DDR_DARKEN_RATIO)];
  }
  if (isBreak) {
    return [COLORS.BREAK_GRADIENT_START, COLORS.BREAK_GRADIENT_END];
  }
  if (isSimultaneous) {
    return [COLORS.SIMULTANEOUS_GRADIENT_START, COLORS.SIMULTANEOUS_GRADIENT_END];
  }
  return [COLORS.TAP_GRADIENT_START, COLORS.TAP_GRADIENT_END];
}

/** 渲染上下文，持有 Canvas、中心半径几何参数、流速与渲染配置。 */
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

/** 渲染器基类，封装坐标与角度映射、流速计算及基础 Canvas 绘图辅助。 */
export abstract class BaseRenderer {
  protected context: RenderContext;

  constructor(context: RenderContext) {
    this.context = context;
  }

  updateContext(context: Partial<RenderContext>): void {
    Object.assign(this.context, context);
  }

  /** 按当前镜像模式转换按钮编号 1~8。 */
  protected mirrorPosition(position: ButtonPosition): ButtonPosition {
    const mode = this.context.config.mirrorMode;
    if (mode === "none") return position;

    const mirrorH = [0, 8, 7, 6, 5, 4, 3, 2, 1];
    const mirrorV = [0, 4, 3, 2, 1, 8, 7, 6, 5];
    const rotate180 = [0, 5, 6, 7, 8, 1, 2, 3, 4];

    switch (mode) {
      case "horizontal":
        return mirrorH[position] as ButtonPosition;
      case "vertical":
        return mirrorV[position] as ButtonPosition;
      case "rotate180":
        return rotate180[position] as ButtonPosition;
      default:
        return position;
    }
  }

  /** 按当前镜像模式转换 Touch 传感器位置（C 区不变，外圈按对称轴映射）。 */
  protected mirrorTouchPosition(touchPosition: TouchPosition): TouchPosition {
    return mirrorTouchSensor(touchPosition, this.context.config.mirrorMode);
  }

  /** Touch 传感器在画布上的像素坐标（已应用镜像变换，"C" 对应圆心）。 */
  getTouchPosition(touchPosition: TouchPosition): Point2D {
    const { centerX, centerY, radius, config } = this.context;
    return touchSensorPoint(touchPosition, {
      centerX,
      centerY,
      radius,
      mirrorMode: config.mirrorMode,
    });
  }

  /** backing store 相对逻辑坐标的缩放（含 DPR）。 */
  protected getBackingScale(): number {
    return this.context.canvas.width / (this.context.centerX * 2);
  }

  /** 获取按钮在画布上的弧度角（已应用镜像变换）。 */
  protected getButtonAngle(position: ButtonPosition): number {
    const mirroredPos = this.mirrorPosition(position);
    return BASE_ANGLE + BUTTON_ANGLE_OFFSET + (mirroredPos - 1) * BUTTON_ANGLE_STEP;
  }

  /** 获取按钮在判定圈上的像素坐标。 */
  protected getButtonPosition(position: ButtonPosition): Point2D {
    const angle = this.getButtonAngle(position);
    return {
      x: this.context.centerX + Math.cos(angle) * this.context.radius,
      y: this.context.centerY + Math.sin(angle) * this.context.radius,
    };
  }

  /** 全局进场时长（ms）；开启 alwaysKeepHiSpeed 时除以播放倍速，避免视觉移速随回放倍速变快。 */
  protected getApproachTimeMs(): number {
    if (this.context.config.alwaysKeepHiSpeed) {
      return (
        this.context.baseApproachTimeMs / (this.context.hiSpeed / this.context.config.playbackSpeed)
      );
    }

    return this.context.baseApproachTimeMs / this.context.hiSpeed;
  }

  /** 音符进场时长（ms），叠加了音符自身流速倍率（<HS*x>）；负流速取绝对值，方向由 getNoteApproachDir 处理。 */
  protected getNoteApproachTimeMs(note: { hiSpeed?: number }): number {
    return this.getApproachTimeMs() / (Math.abs(note.hiSpeed ?? 1) || 1);
  }

  /** 进场移动方向：+1 常规从圆心向外，-1（负流速）从圈外向内。 */
  protected getNoteApproachDir(note: { hiSpeed?: number }): 1 | -1 {
    return (note.hiSpeed ?? 1) < 0 ? -1 : 1;
  }

  protected distanceToCenter(x: number, y: number): number {
    return Math.sqrt(Math.pow(x - this.context.centerX, 2) + Math.pow(y - this.context.centerY, 2));
  }

  protected scaleByRadius(ratio: number): number {
    return ratio * this.context.radius;
  }

  protected getNoteStrokeWidth(): number {
    return this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
  }

  /** 对当前路径描边，未指定线宽时使用音符标准线宽。 */
  protected stroke(color: string, width?: number): void {
    const ctx = this.context.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width ?? this.getNoteStrokeWidth();
    ctx.stroke();
  }

  /** 拍数（beat）按 BPM 换算为毫秒（ms）。 */
  protected durationToMs(duration: number, bpm: number): number {
    return (60000 * duration) / bpm;
  }

  /** 节拍着色（DDR 模式）颜色，按 1/1、1/2、1/4 拍分频匹配，扩展模式支持 1/8、1/6 拍，其余默认绿色；未开启返回 null。 */
  protected getDdrColor(timing: number): string | null {
    if (!this.context.config.ddrColorMode) {
      return null;
    }

    const epsilon = 0.001;
    const fractional = Math.abs(timing % 1);

    // 1/1 拍
    if (fractional < epsilon || fractional > 1 - epsilon) {
      return COLORS.DDR_RED;
    }

    // 1/2 拍
    const halfFrac = Math.abs(timing % 0.5);
    if (halfFrac < epsilon || halfFrac > 0.499) {
      return COLORS.DDR_BLUE;
    }

    // 1/4 拍
    const quarterFrac = Math.abs(timing % 0.25);
    if (quarterFrac < epsilon || quarterFrac > 0.249) {
      return COLORS.DDR_YELLOW;
    }

    // 扩展模式
    if (this.context.config.ddrColorExtended) {
      // 1/8 拍
      const eighthFrac = Math.abs(timing % 0.125);
      if (eighthFrac < epsilon || eighthFrac > 0.124) {
        return COLORS.DDR_ORANGE;
      }

      // 1/6 拍
      const sixthFrac = 1 / 6;
      const sixthRemainder = Math.abs(timing % sixthFrac);
      if (sixthRemainder < epsilon || sixthRemainder > sixthFrac - epsilon) {
        return COLORS.DDR_CYAN;
      }
    }

    return COLORS.DDR_GREEN;
  }

  /** 在 save/restore 中执行绘图，finally 保证抛错时也能可靠恢复 Canvas 状态。 */
  protected withContext(drawFn: () => void): void {
    this.context.ctx.save();
    try {
      drawFn();
    } finally {
      this.context.ctx.restore();
    }
  }

  /** 构建圆形路径（不含 fill/stroke）。 */
  protected drawCircle(x: number, y: number, radius: number): void {
    this.context.ctx.beginPath();
    this.context.ctx.arc(x, y, radius, 0, Math.PI * 2);
  }

  protected mixHexColor(color: string, target: string, amount: number): string {
    return mixHexColor(color, target, amount);
  }

  protected scaleHexBrightness(color: string, factor: number): string {
    return scaleHexBrightness(color, factor);
  }

  /** 构建圆环闭合路径（外顺内逆，非零环绕自动镂空）。 */
  protected drawRing(x: number, y: number, innerRadius: number, outerRadius: number): void {
    this.context.ctx.beginPath();
    this.context.ctx.arc(x, y, outerRadius, 0, Math.PI * 2, false);
    this.context.ctx.arc(x, y, innerRadius, 0, Math.PI * 2, true);
    this.context.ctx.closePath();
  }
}

export default BaseRenderer;
