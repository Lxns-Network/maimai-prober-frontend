import { Point2D, RendererConfig, TouchPosition, ButtonPosition } from "../types";
import {
  BASE_ANGLE,
  BUTTON_ANGLE_OFFSET,
  BUTTON_ANGLE_STEP,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  DDR_DARKEN_RATIO,
} from "../utils/constants";

/**
 * 线性插值混合两个十六进制 RGB 颜色（#rrggbb）。
 *
 * @param amount 目标颜色所占权重比例（0 为起始色，1 为目标色）。
 */
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
 * 按倍率缩放 #rrggbb 的亮度，逐通道乘算并钳到 [0, 255]。
 *
 * 与 mixHexColor(color, "#ffffff" | "#000000", …) 不同：后者对亮暗两侧不对称，
 * 且会把已经饱和的通道往白里拉，不适合做"整体调亮/调暗"。
 */
export function scaleHexBrightness(color: string, factor: number): string {
  const channel = (offset: number) => {
    const value = Math.round(Number.parseInt(color.slice(offset, offset + 2), 16) * factor);
    return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/**
 * 根据音符属性获取渲染所需的渐变颜色对 [startColor, endColor]。
 *
 * 判定优先级依次为：节拍着色 > Break > 双押（同时按压） > 普通 Tap。
 *
 * @param ddrColor 节拍着色模式下的指定颜色；传入 null 时回退到常规音符渐变色。
 */
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

/**
 * 渲染上下文环境，包含目标画布、几何尺寸、流速参数及渲染配置。
 */
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

/**
 * 渲染器抽象基类，提供坐标映射、角度计算、流速换算以及常用绘图辅助方法。
 */
export abstract class BaseRenderer {
  protected context: RenderContext;

  constructor(context: RenderContext) {
    this.context = context;
  }

  /** 增量更新渲染上下文中的属性。 */
  updateContext(context: Partial<RenderContext>): void {
    Object.assign(this.context, context);
  }

  /** 根据当前配置的镜像模式转换按钮位置编号（1 ~ 8）。 */
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

  /**
   * 根据当前配置的镜像模式转换触摸区域传感器位置。
   *
   * 中心区 "C" 在镜像或旋转后位置保持不变；外圈各区域根据对称轴映射对应传感器编号。
   */
  protected mirrorTouchPosition(touchPosition: TouchPosition): TouchPosition {
    const mode = this.context.config.mirrorMode;
    if (mode === "none") return touchPosition;

    const region = touchPosition[0];
    const sensorNum = touchPosition.length > 1 ? parseInt(touchPosition[1]) : 0;

    if (region === "C") {
      return touchPosition;
    }

    const mirrorMaps: Record<string, Record<string, number[]>> = {
      horizontal: {
        AB: [0, 8, 7, 6, 5, 4, 3, 2, 1],
        DE: [0, 1, 8, 7, 6, 5, 4, 3, 2],
      },
      vertical: {
        AB: [0, 4, 3, 2, 1, 8, 7, 6, 5],
        DE: [0, 5, 4, 3, 2, 1, 8, 7, 6],
      },
      rotate180: {
        ABDE: [0, 5, 6, 7, 8, 1, 2, 3, 4],
      },
    };

    const map = mirrorMaps[mode];
    if (!map) return touchPosition;

    let key: string;
    if (mode === "rotate180") {
      key = "ABDE";
    } else {
      key = region === "A" || region === "B" ? "AB" : "DE";
    }

    const mapping = map[key];
    if (!mapping) return touchPosition;

    const mirroredSensorNum = mapping[sensorNum];
    return `${region}${mirroredSensorNum}` as TouchPosition;
  }

  /**
   * 计算指定按钮位置在画布坐标系中的极坐标弧度角。
   *
   * 内部会自动应用当前的镜像模式变换。
   */
  protected getButtonAngle(position: ButtonPosition): number {
    const mirroredPos = this.mirrorPosition(position);
    return BASE_ANGLE + BUTTON_ANGLE_OFFSET + (mirroredPos - 1) * BUTTON_ANGLE_STEP;
  }

  /** 计算指定按钮在画布判定圈上的二维绝对像素坐标。 */
  protected getButtonPosition(position: ButtonPosition): Point2D {
    const angle = this.getButtonAngle(position);
    return {
      x: this.context.centerX + Math.cos(angle) * this.context.radius,
      y: this.context.centerY + Math.sin(angle) * this.context.radius,
    };
  }

  /**
   * 计算全局基准进场时长（毫秒）。
   *
   * 当开启保持流速（alwaysKeepHiSpeed）时，根据回放倍速修正流速比例，使音符视觉移速与倍速解耦。
   */
  protected getApproachTimeMs(): number {
    if (this.context.config.alwaysKeepHiSpeed) {
      return (
        this.context.baseApproachTimeMs / (this.context.hiSpeed / this.context.config.playbackSpeed)
      );
    }

    return this.context.baseApproachTimeMs / this.context.hiSpeed;
  }

  /**
   * 计算指定音符的进场时长（毫秒）。
   *
   * 音符自带流速倍率（simai `<HS*x>`）叠加在全局流速上；负流速时长取幅值，运动方向由 getNoteApproachDir 另行确定。
   */
  protected getNoteApproachTimeMs(note: { hiSpeed?: number }): number {
    return this.getApproachTimeMs() / (Math.abs(note.hiSpeed ?? 1) || 1);
  }

  /** 径向进场方向：+1 常规由内向外，-1（负流速）由判定圈外向内。 */
  protected getNoteApproachDir(note: { hiSpeed?: number }): 1 | -1 {
    return (note.hiSpeed ?? 1) < 0 ? -1 : 1;
  }

  /** 计算指定二维坐标点距画布判定中心的像素距离。 */
  protected distanceToCenter(x: number, y: number): number {
    return Math.sqrt(Math.pow(x - this.context.centerX, 2) + Math.pow(y - this.context.centerY, 2));
  }

  /** 按当前判定圈基准半径等比缩放指定比例值（像素）。 */
  protected scaleByRadius(ratio: number): number {
    return ratio * this.context.radius;
  }

  /** 获取音符外边框的标准描边宽度（像素）。 */
  protected getNoteStrokeWidth(): number {
    return this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
  }

  /**
   * 对当前 Canvas 路径应用指定颜色与线宽进行描边。
   *
   * @param width 可选的描边宽度（像素）；未指定时采用 getNoteStrokeWidth() 标准宽度。
   */
  protected stroke(color: string, width?: number): void {
    const ctx = this.context.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = width ?? this.getNoteStrokeWidth();
    ctx.stroke();
  }

  /** 将以拍数（beat）为单位的时长按指定 BPM 换算为毫秒（ms）时长。 */
  protected durationToMs(duration: number, bpm: number): number {
    return (60000 * duration) / bpm;
  }

  /**
   * 根据音符所在节拍位置计算其对应的节拍着色颜色。
   *
   * 未开启节拍着色模式（ddrColorMode）时返回 null；开启时按分频（1/1、1/2、1/4 拍，及扩展模式下的 1/8、1/6 拍）依次匹配对应颜色，其余拍位回退为绿色。
   */
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

  /**
   * 在独立的 Canvas 状态栈（save/restore）中执行绘图操作。
   *
   * 保证即使 drawFn 抛出异常也能在 finally 中可靠恢复 Canvas 上下文状态。
   */
  protected withContext(drawFn: () => void): void {
    this.context.ctx.save();
    try {
      drawFn();
    } finally {
      this.context.ctx.restore();
    }
  }

  /** 在 Canvas 上构建指定圆心与半径的圆形路径（不包含 fill 或 stroke 调用）。 */
  protected drawCircle(x: number, y: number, radius: number): void {
    this.context.ctx.beginPath();
    this.context.ctx.arc(x, y, radius, 0, Math.PI * 2);
  }

  /** 线性插值混合两个十六进制 RGB 颜色。 */
  protected mixHexColor(color: string, target: string, amount: number): string {
    return mixHexColor(color, target, amount);
  }

  /** 按倍率缩放十六进制 RGB 颜色（#rrggbb）的各通道亮度。 */
  protected scaleHexBrightness(color: string, factor: number): string {
    return scaleHexBrightness(color, factor);
  }

  /**
   * 在 Canvas 上构建具有内外半径的圆环闭合路径（不包含 fill 或 stroke 调用）。
   *
   * 采用奇偶环绕规则，外圆为顺时针方向，内圆为逆时针方向。
   */
  protected drawRing(x: number, y: number, innerRadius: number, outerRadius: number): void {
    this.context.ctx.beginPath();
    this.context.ctx.arc(x, y, outerRadius, 0, Math.PI * 2, false);
    this.context.ctx.arc(x, y, innerRadius, 0, Math.PI * 2, true);
    this.context.ctx.closePath();
  }
}

export default BaseRenderer;
