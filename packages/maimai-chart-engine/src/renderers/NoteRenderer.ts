import { BaseRenderer, RenderContext, getGradientColors } from "./BaseRenderer";
import { Note, Point2D, NoteRenderPosition, ButtonPosition } from "../types";
import {
  NOTE_SIZE_RATIO,
  TAP_INNER_RING_RATIO,
  APPROACH_START_SCALE,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  NOTE_VISIBILITY_AFTER_MS,
  NOTE_LIGHTEN_RATIO,
} from "../utils/constants";

export const INVISIBLE_NOTE_POSITION: NoteRenderPosition = Object.freeze({
  x: 0,
  y: 0,
  scale: 0,
  visible: false,
});

const TAP_SPRITE_HALF_RATIO = 1.7;
const TAP_SPRITE_SUPERSAMPLE = 2;

/**
 * 精灵合成范围按实际墨迹算：留白的全透明像素每帧都会参与合成，Tap 裁掉烘焙画布的透明边缘再贴图。
 * Tap 仍按旧尺寸烘焙，以保持原有的像素中心与抗锯齿结果；裁剪矩形与原画布保持同奇偶，
 * source/destination 比例固定为 noteScale / SS，因此只跳过全透明边缘，不改变图形映射。
 */
const TAP_SPRITE_CROP_MARGIN_PX = 1;

/** 基础音符渲染器，负责 Tap、接近弧、双押线、EX 环及 Break 标记等。 */
export class NoteRenderer extends BaseRenderer {
  // Tap 贴图缓存（按方位/配色/EX 键），radius 或 mirrorMode 变化时失效
  private tapSpriteCache = new Map<string, HTMLCanvasElement>();
  private tapSpriteBasis = "";

  constructor(context: RenderContext) {
    super(context);
  }

  /** 获取按键在判定圈上的坐标。 */
  getPositionOnRing(position: ButtonPosition): Point2D {
    return this.getButtonPosition(position);
  }

  /** 获取按键弧度角。 */
  getAngle(position: ButtonPosition): number {
    return this.getButtonAngle(position);
  }

  /** 计算音符当前渲染位置与缩放；超出可见范围返回 INVISIBLE_NOTE_POSITION。 */
  calculateNotePosition(
    note: Note,
    _currentBeat: number,
    currentTimeMs: number,
  ): NoteRenderPosition {
    const position = note.position as ButtonPosition;
    const angle = this.getButtonAngle(position);
    const timeDiff = note.timingMs - currentTimeMs;
    const approachTime = this.getNoteApproachTimeMs(note);

    // Hold 起点在 duration 内持续可见；普通音符保留 NOTE_VISIBILITY_AFTER_MS
    let holdWindow = NOTE_VISIBILITY_AFTER_MS;
    if ("isHoldStart" in note && note.isHoldStart && "duration" in note) {
      holdWindow = this.durationToMs(note.duration, note.bpm);
    }
    if (timeDiff > approachTime || timeDiff < -holdWindow) {
      return INVISIBLE_NOTE_POSITION;
    }

    // 上半段淡入、下半段推进到判定线；dir=-1 从圈外 1.75R 向内
    const dir = this.getNoteApproachDir(note);
    const halfApproach = approachTime / 2;
    let distance: number;
    let scale: number;
    if (timeDiff > halfApproach) {
      distance = this.context.radius * (1 + dir * (APPROACH_START_SCALE - 1));
      scale = 1 - (timeDiff - halfApproach) / halfApproach;
    } else if (timeDiff >= 0) {
      const progress = 1 - timeDiff / halfApproach;
      distance = this.context.radius * (1 + dir * (APPROACH_START_SCALE - 1 + 0.75 * progress));
      scale = 1;
    } else if ("isHoldStart" in note && note.isHoldStart) {
      distance = this.context.radius;
      scale = 1;
    } else {
      const fadeProgress = 1 + -timeDiff / halfApproach;
      distance = this.context.radius * (1 + dir * (APPROACH_START_SCALE - 1 + 0.75 * fadeProgress));
      scale = 1;
    }

    return {
      x: this.context.centerX + Math.cos(angle) * distance,
      y: this.context.centerY + Math.sin(angle) * distance,
      scale,
      visible: true,
    };
  }

  /** 渲染单个音符接近弧（中心主弧与两侧渐隐拖影）。 */
  renderApproachArc(position: ButtonPosition, noteX: number, noteY: number, color: string): void {
    const angle = this.getButtonAngle(position);
    const distance = this.distanceToCenter(noteX, noteY);
    const ctx = this.context.ctx;
    const centerX = this.context.centerX;
    const centerY = this.context.centerY;
    const trailStep = Math.PI / 8 / 4;
    const lineWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);

    ctx.save();

    // i=0 主弧（±π/8），i>0 左右两侧拖影
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
      this.stroke(color, lineWidth);
    }

    ctx.restore();
  }

  /** 批量渲染接近弧：同心弧按 (颜色, 拖影档) 合并绘制，每档一次 stroke。 */
  renderApproachArcsBatch(
    arcs: { position: ButtonPosition; distance: number; color: string }[],
  ): void {
    if (arcs.length === 0) return;
    const ctx = this.context.ctx;
    const cx = this.context.centerX;
    const cy = this.context.centerY;
    const trailStep = Math.PI / 8 / 4;
    const lineWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);

    const byColor = new Map<string, { position: ButtonPosition; distance: number }[]>();
    for (const arc of arcs) {
      const group = byColor.get(arc.color);
      if (group) group.push(arc);
      else byColor.set(arc.color, [arc]);
    }

    ctx.save();
    ctx.lineWidth = lineWidth;
    for (const [color, group] of byColor) {
      ctx.strokeStyle = color;
      for (let i = 4; i >= 0; i--) {
        ctx.globalAlpha = i === 0 ? 0.4 : 0.4 * (1 - i / 5);
        ctx.beginPath();
        for (const arc of group) {
          const angle = this.getButtonAngle(arc.position);
          const d = arc.distance;
          if (i === 0) {
            ctx.moveTo(
              cx + Math.cos(angle - Math.PI / 8) * d,
              cy + Math.sin(angle - Math.PI / 8) * d,
            );
            ctx.arc(cx, cy, d, angle - Math.PI / 8, angle + Math.PI / 8, false);
          } else {
            const leftStart = angle - Math.PI / 8 - i * trailStep;
            ctx.moveTo(cx + Math.cos(leftStart) * d, cy + Math.sin(leftStart) * d);
            ctx.arc(cx, cy, d, leftStart, angle - Math.PI / 8 - (i - 1) * trailStep, false);
            const rightStart = angle + Math.PI / 8 + (i - 1) * trailStep;
            ctx.moveTo(cx + Math.cos(rightStart) * d, cy + Math.sin(rightStart) * d);
            ctx.arc(cx, cy, d, rightStart, angle + Math.PI / 8 + i * trailStep, false);
          }
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** 渲染双押圆弧连接线（取两键间短弧；间距 4 键正对时连整圈）。 */
  renderSimultaneousConnector(
    startPos: ButtonPosition,
    endPos: ButtonPosition,
    distance: number,
    color: string,
  ): void {
    const startAngle = this.getButtonAngle(startPos);
    const endAngle = this.getButtonAngle(endPos);

    // 沿短弧连；正对位（diff=±4）连整圈
    let angleDiff = endPos - startPos;
    while (angleDiff > 4) angleDiff -= 8;
    while (angleDiff < -4) angleDiff += 8;
    const isFullCircle = Math.abs(angleDiff) === 4;

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.globalAlpha = 0.7;

      ctx.beginPath();
      if (isFullCircle) {
        ctx.arc(this.context.centerX, this.context.centerY, distance, 0, Math.PI * 2);
      } else {
        const [arcStart, arcEnd] = angleDiff > 0 ? [startAngle, endAngle] : [endAngle, startAngle];
        ctx.arc(this.context.centerX, this.context.centerY, distance, arcStart, arcEnd, false);
      }
      this.stroke(color);
    });
  }

  /** 渲染 EX 发光外环。 */
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

  /** 渲染 Break 尖角标记（尖端朝外）。 */
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

      this.stroke("rgba(255, 255, 255, 0.8)", this.scaleByRadius(4 / 300));
    });
  }

  private getTapRingColors(
    ddrColor: string | null,
    isBreak: boolean,
    isSimultaneous: boolean,
  ): [string, string] {
    return getGradientColors(ddrColor, isBreak, isSimultaneous);
  }

  /** 渲染四段方向渐变圆环（起始角与按键方位对齐）。 */
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
    const lightColor = this.mixHexColor(colors[0], "#ffffff", NOTE_LIGHTEN_RATIO);

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

  /** 渲染 Tap 音符（优先用离屏精灵，DDR 节拍着色模式回退矢量绘制）。 */
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
    // DDR 节拍颜色随 timing 实时变化，无法烘焙缓存，回退矢量路径绘制
    if (this.context.config.ddrColorMode) {
      this.drawTapNoteVector(
        x,
        y,
        noteScale,
        position,
        isBreak,
        isSimultaneous,
        isEx,
        timing,
        highlightExScale,
      );
      return;
    }
    const sprite = this.getTapSprite(position, isBreak, isSimultaneous, isEx, highlightExScale);
    let cropSize = Math.ceil(
      this.getTapSpriteCropHalf(isEx, highlightExScale) * 2 * TAP_SPRITE_SUPERSAMPLE,
    );
    if (cropSize % 2 !== sprite.width % 2) cropSize++;
    cropSize = Math.min(cropSize, sprite.width);
    const sourceOffset = (sprite.width - cropSize) / 2;
    const size = (cropSize / TAP_SPRITE_SUPERSAMPLE) * noteScale;
    this.context.ctx.drawImage(
      sprite,
      sourceOffset,
      sourceOffset,
      cropSize,
      cropSize,
      x - size / 2,
      y - size / 2,
      size,
      size,
    );
  }

  /** 计算 Tap 贴图实际墨迹裁剪半径（逻辑像素，EX 为外环外径，普通为外黑边）。 */
  private getTapSpriteCropHalf(isEx: boolean, highlightExScale: number): number {
    const outerRadius = this.scaleByRadius(NOTE_SIZE_RATIO) * 1.36;
    const strokeW = this.getNoteStrokeWidth();
    const ink = isEx
      ? Math.max(outerRadius * 1.19 * highlightExScale, outerRadius + strokeW / 2)
      : outerRadius + strokeW * 1.5;
    return ink + TAP_SPRITE_CROP_MARGIN_PX;
  }

  /**
   * 校验已烘焙 Tap 精灵的裁剪矩形是否完整覆盖墨迹（用于防回归手工推导漏裁）。
   * 含 getImageData 开销，严禁在渲染热路径中调用；只能校验当前缓存已烘焙的贴图。
   */
  validateTapSpriteCrops(): string[] {
    const violations: string[] = [];
    for (const [key, sprite] of this.tapSpriteCache) {
      const parts = key.split("|");
      const isEx = parts[3] === "1";
      const highlightExScale = Number(parts[4]);
      let cropSize = Math.ceil(
        this.getTapSpriteCropHalf(isEx, highlightExScale) * 2 * TAP_SPRITE_SUPERSAMPLE,
      );
      if (cropSize % 2 !== sprite.width % 2) cropSize++;
      cropSize = Math.min(cropSize, sprite.width);
      const inset = (sprite.width - cropSize) / 2;
      const spriteCtx = sprite.getContext("2d");
      if (!spriteCtx) continue;
      const { data } = spriteCtx.getImageData(0, 0, sprite.width, sprite.height);
      let minX = sprite.width;
      let minY = sprite.height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < sprite.height; y++) {
        for (let x = 0; x < sprite.width; x++) {
          if (data[(y * sprite.width + x) * 4 + 3] === 0) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
      if (maxX < 0) continue;
      if (
        minX < inset ||
        minY < inset ||
        maxX >= sprite.width - inset ||
        maxY >= sprite.height - inset
      ) {
        violations.push(
          `tap sprite ${key}: ink [${minX},${minY}]-[${maxX},${maxY}] escapes crop inset ${inset} of ${sprite.width}px`,
        );
      }
    }
    return violations;
  }

  /** 获取或烘焙 Tap 贴图，radius 或 mirrorMode 变化时失效。 */
  private getTapSprite(
    position: ButtonPosition,
    isBreak: boolean,
    isSimultaneous: boolean,
    isEx: boolean,
    highlightExScale: number,
  ): HTMLCanvasElement {
    const basis = `${this.context.radius}|${this.context.config.mirrorMode}`;
    if (basis !== this.tapSpriteBasis) {
      this.tapSpriteCache.clear();
      this.tapSpriteBasis = basis;
    }
    const key = `${position}|${+isBreak}|${+isSimultaneous}|${+isEx}|${highlightExScale}`;
    let sprite = this.tapSpriteCache.get(key);
    if (sprite) return sprite;

    const half = this.scaleByRadius(NOTE_SIZE_RATIO) * 1.36 * TAP_SPRITE_HALF_RATIO;
    sprite = document.createElement("canvas");
    sprite.width = sprite.height = Math.max(2, Math.ceil(half * 2 * TAP_SPRITE_SUPERSAMPLE));
    const offscreenCtx = sprite.getContext("2d")!;
    offscreenCtx.setTransform(
      TAP_SPRITE_SUPERSAMPLE,
      0,
      0,
      TAP_SPRITE_SUPERSAMPLE,
      sprite.width / 2,
      sprite.height / 2,
    );
    const mainCtx = this.context.ctx;
    this.context.ctx = offscreenCtx;
    try {
      this.drawTapNoteVector(0, 0, 1, position, isBreak, isSimultaneous, isEx, 0, highlightExScale);
    } finally {
      this.context.ctx = mainCtx;
    }
    this.tapSpriteCache.set(key, sprite);
    return sprite;
  }

  /** 矢量绘制 Tap 各图层（离屏烘焙或 DDR 模式使用）。 */
  private drawTapNoteVector(
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

      // 白边外各贴一圈黑边；EX 占用外圈跳过外黑边保留内黑边，黑边宽度跟随 strokeW 缩放
      const strokeW = this.getNoteStrokeWidth();
      const blackBandW = strokeW;
      if (!isEx) {
        this.drawCircle(x, y, outerRadius + strokeW / 2 + blackBandW / 2);
        this.stroke(COLORS.BLACK, blackBandW);
      }
      const innerBlackR = innerRadius - strokeW / 2 - blackBandW / 2;
      if (innerBlackR > 0) {
        this.drawCircle(x, y, innerBlackR);
        this.stroke(COLORS.BLACK, blackBandW);
      }

      this.drawCircle(x, y, outerRadius);
      this.stroke(COLORS.WHITE, strokeW);

      this.drawCircle(x, y, innerRadius);
      this.stroke(COLORS.WHITE, strokeW);

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

  /** 渲染 Break 序号。 */
  renderBreakIndex(x: number, y: number, scale: number, index: number): void {
    const fontSize = Math.round(((30 * this.context.radius) / 300) * scale);

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.WHITE;
      // 纯偏移阴影避免 shadowBlur 开销
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(`${index}`, x, y);
    });
  }
}

export default NoteRenderer;
