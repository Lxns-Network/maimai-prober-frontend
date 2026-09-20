import {
  flushTouchDrawCommands,
  type TouchDrawCommand,
  type TouchPart,
} from "../utils/touchDrawOrder";
import { BaseRenderer, mixHexColor, RenderContext } from "./BaseRenderer";
import { TouchNote, TouchHoldStartNote, Point2D } from "../types";
import {
  TOUCH_APPROACH_MULTIPLIER,
  TOUCH_CENTER_DOT_RATIO,
  TOUCH_PETAL_OPEN_RATIO,
  TOUCH_PETAL_CLOSED_RATIO,
  PANEL_RADIUS_UNITS,
  NOTE_SIZE_RATIO,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
} from "../utils/constants";
// Touch Hold 花瓣纵向渐变色阶与进度环四象限基色。
const TOUCH_HOLD_PETAL_PALETTES = [
  ["#FF5511", COLORS.TOUCH_HOLD_RED, "#E74201", "#FFF6F2"],
  ["#F8DE00", COLORS.TOUCH_HOLD_YELLOW, "#ECF402", "#FFFBEF"],
  ["#1EB476", COLORS.TOUCH_HOLD_GREEN, "#0AA062", "#ECFFF8"],
  ["#00AAF8", COLORS.TOUCH_HOLD_BLUE, "#0289F4", "#EFFCFF"],
] as const;
const TOUCH_HOLD_PROGRESS_COLORS = ["#E95513", "#FAED00", "#0DAC67", "#2CA6E0"];

// Touch Hold 进度环实测采样几何尺寸（基准单位，以 alpha>=128 轮廓测量）。
const TOUCH_HOLD_PROGRESS_GEOMETRY = {
  canvasHalf: 99.75,
  innerAxis: 64,
  innerDiagonal: 50.5,
  outerAxis: 97.75,
  outerDiagonal: 82.75,
} as const;

/** Touch 音符与特效渲染器，负责 Touch/Touch Hold、花瓣收拢、Hold 环形进度、多押外框与烟花特效。 */
export class TouchRenderer extends BaseRenderer {
  // Touch 花瓣贴图缓存（键: "图层|变体|花瓣索引"）
  private touchPetalSprites = new Map<string, HTMLCanvasElement>();
  private touchSpriteBasis = "";
  private touchHoldProgressSprite: HTMLCanvasElement | null = null;
  private touchHoldProgressBasis = "";

  constructor(context: RenderContext) {
    super(context);
  }

  /** 花瓣贴图逻辑半宽（包含本体尺寸、外层描边与阴影余量）。 */
  private getTouchSpriteHalf(): number {
    return (
      this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3 +
      this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO) * 3 +
      this.scaleByRadius(8 / 300) +
      this.scaleByRadius(2 / 300)
    );
  }

  /**
   * 获取或烘焙单片 Touch 花瓣离屏贴图。
   * - layer: "sb"=阴影与黑边, "f"=色块填充, "w"=白色轮廓；
   * - kind: "n"=普通, "s"=双押, "h"=Touch Hold；
   * - i: 花瓣索引（0~3）。
   */
  private getTouchPetalSprite(
    layer: "sb" | "f" | "w",
    kind: "n" | "s" | "h",
    i: number,
  ): HTMLCanvasElement {
    const backingScale = this.getBackingScale();
    const basis = `${this.context.radius}|${backingScale}`;
    if (this.touchSpriteBasis !== basis) {
      this.touchPetalSprites.clear();
      this.touchSpriteBasis = basis;
    }
    // 阴影与白轮廓层与颜色无关，双押和普通音符共用贴图
    const geomKind = layer === "f" ? kind : kind === "h" ? "h" : "n";
    const key = `${layer}|${geomKind}|${i}`;
    let sprite = this.touchPetalSprites.get(key);
    if (sprite) return sprite;

    const half = this.getTouchSpriteHalf();
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    sprite = document.createElement("canvas");
    sprite.width = sizePx;
    sprite.height = sizePx;
    const sctx = sprite.getContext("2d")!;
    sctx.setTransform(backingScale, 0, 0, backingScale, sizePx / 2, sizePx / 2);

    const isHold = geomKind === "h";
    const petalBaseAngles = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
    const petalAngle = petalBaseAngles[i] + (isHold ? 0 : -Math.PI / 4);
    const petalSize = this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3;
    const tipAngle = petalAngle + Math.PI;
    const leftAngle = petalAngle + Math.PI / 2;
    const rightAngle = petalAngle - Math.PI / 2;
    const tipX = Math.cos(tipAngle) * petalSize;
    const tipY = Math.sin(tipAngle) * petalSize;
    const leftX = Math.cos(leftAngle) * petalSize;
    const leftY = Math.sin(leftAngle) * petalSize;
    const rightX = Math.cos(rightAngle) * petalSize;
    const rightY = Math.sin(rightAngle) * petalSize;
    const innerRatio = 0.4;
    const cx = (tipX + leftX + rightX) / 3;
    const cy = (tipY + leftY + rightY) / 3;
    const innerTipX = cx + (tipX - cx) * innerRatio;
    const innerTipY = cy + (tipY - cy) * innerRatio;
    const innerLeftX = cx + (leftX - cx) * innerRatio;
    const innerLeftY = cy + (leftY - cy) * innerRatio;
    const innerRightX = cx + (rightX - cx) * innerRatio;
    const innerRightY = cy + (rightY - cy) * innerRatio;
    const cornerRadius = this.scaleByRadius(8 / 300);
    const innerCornerRadius = cornerRadius * 0.4;
    const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);

    const mainCtx = this.context.ctx;
    this.context.ctx = sctx;
    try {
      if (layer === "sb") {
        sctx.shadowColor = "rgba(0, 0, 0, 0.5)";
        sctx.shadowBlur = this.scaleByRadius(8 / 300);
        sctx.shadowOffsetX = this.scaleByRadius(2 / 300);
        sctx.shadowOffsetY = this.scaleByRadius(2 / 300);
        sctx.fillStyle = "rgba(0, 0, 0, 0.01)"; // 填充微小透明度触发阴影渲染
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        sctx.fill();
        sctx.shadowColor = "transparent";
        sctx.shadowBlur = 0;
        sctx.shadowOffsetX = 0;
        sctx.shadowOffsetY = 0;
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        this.stroke(COLORS.BLACK, strokeWidth * 3);
        if (!isHold) {
          sctx.beginPath();
          this.drawRoundedTriangle(
            innerTipX,
            innerTipY,
            innerLeftX,
            innerLeftY,
            innerRightX,
            innerRightY,
            innerCornerRadius,
          );
          this.stroke(COLORS.BLACK, strokeWidth * 3);
        }
      } else if (layer === "f") {
        let fillStyle: string | CanvasGradient;
        if (kind === "h") {
          fillStyle = this.createTouchHoldPetalGradient(
            sctx,
            TOUCH_HOLD_PETAL_PALETTES[i],
            0,
            0,
            tipX,
            tipY,
          );
        } else {
          const gradient = sctx.createLinearGradient(0, 0, tipX, tipY);
          gradient.addColorStop(0, kind === "s" ? "#FFFF00" : "#00FFFF");
          gradient.addColorStop(1, kind === "s" ? "#FFD700" : "#0080FF");
          fillStyle = gradient;
        }
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        if (!isHold) {
          this.drawRoundedTriangle(
            innerTipX,
            innerTipY,
            innerRightX,
            innerRightY,
            innerLeftX,
            innerLeftY,
            innerCornerRadius,
          );
        }
        sctx.fillStyle = fillStyle;
        sctx.fill();
      } else {
        sctx.beginPath();
        this.drawRoundedTriangle(tipX, tipY, leftX, leftY, rightX, rightY, cornerRadius);
        if (!isHold) {
          this.drawRoundedTriangle(
            innerTipX,
            innerTipY,
            innerLeftX,
            innerLeftY,
            innerRightX,
            innerRightY,
            innerCornerRadius,
          );
        }
        this.stroke(COLORS.WHITE, strokeWidth);
      }
    } finally {
      this.context.ctx = mainCtx;
    }
    this.touchPetalSprites.set(key, sprite);
    return sprite;
  }

  private createTouchHoldPetalGradient(
    ctx: CanvasRenderingContext2D,
    colors: readonly [string, string, string, string],
    baseX: number,
    baseY: number,
    tipX: number,
    tipY: number,
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(0.35, colors[1]);
    gradient.addColorStop(0.72, colors[2]);
    gradient.addColorStop(1, colors[3]);
    return gradient;
  }

  private getTouchHoldProgressHalf(): number {
    // 进度环几何常量以判定圈基准半径归一化映射。
    return (this.context.radius / PANEL_RADIUS_UNITS) * TOUCH_HOLD_PROGRESS_GEOMETRY.canvasHalf;
  }

  private getTouchHoldProgressSprite(): HTMLCanvasElement {
    const backingScale = this.getBackingScale();
    const basis = `${this.context.radius}|${backingScale}`;
    if (this.touchHoldProgressSprite && this.touchHoldProgressBasis === basis) {
      return this.touchHoldProgressSprite;
    }

    const half = this.getTouchHoldProgressHalf();
    const unit = this.context.radius / PANEL_RADIUS_UNITS;
    const sprite = document.createElement("canvas");
    const sizePx = Math.max(2, Math.ceil(half * 2 * backingScale));
    sprite.width = sizePx;
    sprite.height = sizePx;
    const ctx = sprite.getContext("2d")!;
    const scale = sizePx / (half * 2);
    ctx.setTransform(scale, 0, 0, scale, sizePx / 2, sizePx / 2);

    const roundedDiamond = (axisRadius: number, diagonalRadius: number) => {
      const radius = diagonalRadius * Math.SQRT2 * unit;
      // 二次曲线的轴向极值为 radius-offset/2，对角直边距离为 radius/sqrt(2)。
      const offset = 2 * (radius - axisRadius * unit);
      const path = new Path2D();
      path.moveTo(-offset, -radius + offset);
      path.quadraticCurveTo(0, -radius, offset, -radius + offset);
      path.lineTo(radius - offset, -offset);
      path.quadraticCurveTo(radius, 0, radius - offset, offset);
      path.lineTo(offset, radius - offset);
      path.quadraticCurveTo(0, radius, -offset, radius - offset);
      path.lineTo(-radius + offset, offset);
      path.quadraticCurveTo(-radius, 0, -radius + offset, -offset);
      path.closePath();
      return path;
    };
    // 外缘按相邻主体的相切间距校准；内孔保持与闭合花瓣衔接。
    const ring = roundedDiamond(
      TOUCH_HOLD_PROGRESS_GEOMETRY.outerAxis,
      TOUCH_HOLD_PROGRESS_GEOMETRY.outerDiagonal,
    );
    ring.addPath(
      roundedDiamond(
        TOUCH_HOLD_PROGRESS_GEOMETRY.innerAxis,
        TOUCH_HOLD_PROGRESS_GEOMETRY.innerDiagonal,
      ),
    );
    ctx.clip(ring, "evenodd");
    for (let i = 0; i < 4; i++) {
      const angle = -Math.PI / 4 + (i * Math.PI) / 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const gradient = ctx.createLinearGradient(
        dx * TOUCH_HOLD_PROGRESS_GEOMETRY.innerDiagonal * unit,
        dy * TOUCH_HOLD_PROGRESS_GEOMETRY.innerDiagonal * unit,
        dx * TOUCH_HOLD_PROGRESS_GEOMETRY.outerDiagonal * unit,
        dy * TOUCH_HOLD_PROGRESS_GEOMETRY.outerDiagonal * unit,
      );
      const color = TOUCH_HOLD_PROGRESS_COLORS[i];
      gradient.addColorStop(0, mixHexColor(color, COLORS.BLACK, 0.28));
      gradient.addColorStop(0.35, color);
      gradient.addColorStop(0.72, mixHexColor(color, COLORS.WHITE, 0.32));
      gradient.addColorStop(1, mixHexColor(color, COLORS.WHITE, 0.08));
      ctx.fillStyle = gradient;
      ctx.fillRect(dx > 0 ? 0 : -half, dy > 0 ? 0 : -half, half, half);
    }

    this.touchHoldProgressSprite = sprite;
    this.touchHoldProgressBasis = basis;
    return sprite;
  }

  getTouchApproachTimeMs(note: { hiSpeed?: number }): number {
    return this.getNoteApproachTimeMs(note) * TOUCH_APPROACH_MULTIPLIER;
  }

  /** 渲染单个 Touch 或 Touch Hold 音符；同帧所有音符须共享 queue 并在收集完后 flush 才能定出覆盖顺序。 */
  renderTouch(
    note: TouchNote | TouchHoldStartNote,
    _currentBeat: number,
    currentTimeMs: number,
    isSimultaneous: boolean,
    queue?: TouchDrawCommand[],
    // 未提供时按入队位置兜底：sourceIndex 撞车会让 flush 丢掉整颗音符。
    sourceIndex = queue?.length ?? 0,
  ): void {
    const isHold = note.type === "touch-hold-start";
    const timeDiff = note.timingMs - currentTimeMs;
    const approachTime = this.getTouchApproachTimeMs(note);

    let visibilityWindow = 50;
    if (isHold && "durationMs" in note && note.durationMs !== undefined) {
      visibilityWindow = note.durationMs + 50;
    }
    if (timeDiff > approachTime || timeDiff < -visibilityWindow) return;

    let alpha = 1;
    if (timeDiff > approachTime * 0.95) {
      alpha = 1 - (timeDiff - approachTime * 0.95) / (approachTime * 0.05);
    }

    let petalAlpha = 1;
    if (timeDiff > 0 && timeDiff < approachTime) {
      const remaining = approachTime - timeDiff;
      if (remaining < 150) {
        petalAlpha = remaining / 150;
      }
    }

    const openDist = this.scaleByRadius(TOUCH_PETAL_OPEN_RATIO) * 1.1;
    const closedDist = this.scaleByRadius(TOUCH_PETAL_CLOSED_RATIO) * 1.3;
    let petalDist = openDist;

    if (timeDiff > 0 && timeDiff <= approachTime) {
      const progress = 1 - timeDiff / approachTime;
      const eased = progress * progress * progress * progress;
      petalDist = openDist - (openDist - closedDist) * eased;
    } else if (timeDiff <= 0) {
      petalDist = closedDist;
    }

    const position = this.getTouchPosition(note.position);
    const isHoldActive = isHold && timeDiff < 0;
    const ctx = this.context.ctx;

    const cornerRadius = this.scaleByRadius(8 / 300);
    const innerCornerRadius = cornerRadius * 0.4;
    const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
    const ddrColor = this.getDdrColor(note.timing);
    const petalBaseAngles = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
    const angleOffset = isHold ? 0 : -Math.PI / 4;
    const combinedAlpha = alpha * petalAlpha;

    interface PetalGeometry {
      tipX: number;
      tipY: number;
      leftX: number;
      leftY: number;
      rightX: number;
      rightY: number;
      petalX: number;
      petalY: number;
      innerTipX?: number;
      innerTipY?: number;
      innerLeftX?: number;
      innerLeftY?: number;
      innerRightX?: number;
      innerRightY?: number;
    }
    const petals: PetalGeometry[] = [];

    for (let i = 0; i < 4; i++) {
      const petalAngle = petalBaseAngles[i] + angleOffset;
      const petalX = position.x + Math.cos(petalAngle) * petalDist;
      const petalY = position.y + Math.sin(petalAngle) * petalDist;
      const tipAngle = petalAngle + Math.PI;
      const leftAngle = petalAngle + Math.PI / 2;
      const rightAngle = petalAngle - Math.PI / 2;
      const petalSize = closedDist;

      const tipX = petalX + Math.cos(tipAngle) * petalSize;
      const tipY = petalY + Math.sin(tipAngle) * petalSize;
      const leftX = petalX + Math.cos(leftAngle) * petalSize;
      const leftY = petalY + Math.sin(leftAngle) * petalSize;
      const rightX = petalX + Math.cos(rightAngle) * petalSize;
      const rightY = petalY + Math.sin(rightAngle) * petalSize;

      const petal: PetalGeometry = { tipX, tipY, leftX, leftY, rightX, rightY, petalX, petalY };

      if (!isHold) {
        const innerRatio = 0.4;
        const cx = (tipX + leftX + rightX) / 3;
        const cy = (tipY + leftY + rightY) / 3;
        petal.innerTipX = cx + (tipX - cx) * innerRatio;
        petal.innerTipY = cy + (tipY - cy) * innerRatio;
        petal.innerLeftX = cx + (leftX - cx) * innerRatio;
        petal.innerLeftY = cy + (leftY - cy) * innerRatio;
        petal.innerRightX = cx + (rightX - cx) * innerRatio;
        petal.innerRightY = cy + (rightY - cy) * innerRatio;
      }

      petals.push(petal);
    }

    const drawPart = (part: TouchPart) => {
      ctx.save();
      ctx.globalAlpha = alpha;

      if (
        part === "gauge" &&
        isHoldActive &&
        "durationMs" in note &&
        note.durationMs !== undefined
      ) {
        const elapsed = -timeDiff;
        const progress = Math.min(elapsed / note.durationMs, 1);

        const half = this.getTouchHoldProgressHalf();
        const endAngle = -Math.PI / 2 + progress * Math.PI * 2;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(position.x, position.y);
        ctx.arc(position.x, position.y, half, -Math.PI / 2, endAngle, false);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(
          this.getTouchHoldProgressSprite(),
          position.x - half,
          position.y - half,
          half * 2,
          half * 2,
        );

        ctx.restore();
      }

      ctx.globalAlpha = combinedAlpha;
      if (part.startsWith("petal-")) {
        const petalIndex = Number(part.slice(-1));
        const p = petals[petalIndex];

        if (ddrColor) {
          // DDR 动态节拍着色模式走矢量路径
          ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
          ctx.shadowBlur = this.scaleByRadius(8 / 300);
          ctx.shadowOffsetX = this.scaleByRadius(2 / 300);
          ctx.shadowOffsetY = this.scaleByRadius(2 / 300);
          ctx.fillStyle = "rgba(0, 0, 0, 0.01)"; // 填充微小透明度触发阴影渲染

          ctx.beginPath();
          this.drawRoundedTriangle(
            p.tipX,
            p.tipY,
            p.leftX,
            p.leftY,
            p.rightX,
            p.rightY,
            cornerRadius,
          );
          ctx.fill();

          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;

          // 外三角与内孔各画加宽黑轮廓，再用填充色覆盖内侧光晕
          ctx.beginPath();
          this.drawRoundedTriangle(
            p.tipX,
            p.tipY,
            p.leftX,
            p.leftY,
            p.rightX,
            p.rightY,
            cornerRadius,
          );
          this.stroke(COLORS.BLACK, strokeWidth * 3);
          if (!isHold) {
            ctx.beginPath();
            this.drawRoundedTriangle(
              p.innerTipX!,
              p.innerTipY!,
              p.innerLeftX!,
              p.innerLeftY!,
              p.innerRightX!,
              p.innerRightY!,
              innerCornerRadius,
            );
            this.stroke(COLORS.BLACK, strokeWidth * 3);
          }

          ctx.beginPath();
          this.drawRoundedTriangle(
            p.tipX,
            p.tipY,
            p.leftX,
            p.leftY,
            p.rightX,
            p.rightY,
            cornerRadius,
          );
          if (!isHold) {
            this.drawRoundedTriangle(
              p.innerTipX!,
              p.innerTipY!,
              p.innerRightX!,
              p.innerRightY!,
              p.innerLeftX!,
              p.innerLeftY!,
              innerCornerRadius,
            );
          }
          ctx.fillStyle = isHold
            ? this.createTouchHoldPetalGradient(
                ctx,
                [
                  mixHexColor(ddrColor, COLORS.WHITE, 0.24),
                  ddrColor,
                  mixHexColor(ddrColor, COLORS.BLACK, 0.22),
                  mixHexColor(ddrColor, COLORS.WHITE, 0.5),
                ],
                p.petalX,
                p.petalY,
                p.tipX,
                p.tipY,
              )
            : ddrColor;
          ctx.fill();

          ctx.beginPath();
          this.drawRoundedTriangle(
            p.tipX,
            p.tipY,
            p.leftX,
            p.leftY,
            p.rightX,
            p.rightY,
            cornerRadius,
          );
          if (!isHold) {
            this.drawRoundedTriangle(
              p.innerTipX!,
              p.innerTipY!,
              p.innerLeftX!,
              p.innerLeftY!,
              p.innerRightX!,
              p.innerRightY!,
              innerCornerRadius,
            );
          }
          this.stroke(COLORS.WHITE, strokeWidth);
        } else {
          // 分层贴图绘制：按阴影黑边、填充、白边次序绘制
          const spriteKind = isHold ? "h" : isSimultaneous ? "s" : "n";
          const spriteHalf = this.getTouchSpriteHalf();
          for (const layer of ["sb", "f", "w"] as const) {
            ctx.drawImage(
              this.getTouchPetalSprite(layer, spriteKind, petalIndex),
              p.petalX - spriteHalf,
              p.petalY - spriteHalf,
              spriteHalf * 2,
              spriteHalf * 2,
            );
          }
        }
      }

      if (part === "center") {
        ctx.globalAlpha = alpha;
        const centerSize = this.scaleByRadius(TOUCH_CENTER_DOT_RATIO) * 0.8;
        ctx.beginPath();
        ctx.arc(position.x, position.y, centerSize, 0, Math.PI * 2);
        this.stroke(COLORS.BLACK, strokeWidth * 3);
        ctx.fillStyle = isSimultaneous ? "#FFFF00" : "#00BFFF";
        ctx.fill();
        this.stroke(COLORS.WHITE, strokeWidth);
      }

      ctx.restore();
    };
    const commands = queue ?? [];
    commands.push({
      sourceIndex,
      isHold,
      draw: drawPart,
      position: this.mirrorTouchPosition(note.position),
      registeredAtMs: note.timingMs - approachTime,
    });
    if (!queue) flushTouchDrawCommands(commands);
  }

  /** 渲染同位置多押缺口圆角外框（>=2 个生效，>=3 个叠加双层外框）。 */
  renderTouchBorder(position: Point2D, isSimultaneous: boolean, visibleTouchCount: number): void {
    if (visibleTouchCount < 2) {
      return;
    }

    const boxSize = this.scaleByRadius(1 / 4.46) * 1.1 * 1.2;
    const cornerRadius = this.scaleByRadius(NOTE_SIZE_RATIO);
    const color = isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TOUCH_CYAN;

    if (visibleTouchCount >= 3) {
      const largerSize = boxSize * 1.2;
      this.drawTouchBorderBox(position.x, position.y, largerSize, cornerRadius, color, 3);
    }

    this.drawTouchBorderBox(position.x, position.y, boxSize, cornerRadius, color, 3);
  }

  /** 绘制单层带缺口的圆角矩形框。 */
  private drawTouchBorderBox(
    x: number,
    y: number,
    size: number,
    cornerRadius: number,
    color: string,
    lineWidth: number,
  ): void {
    const half = size / 2;
    const left = x - half;
    const top = y - half;
    const gap = size * 0.3;
    const ctx = this.context.ctx;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = (lineWidth * this.context.radius) / 300;
    ctx.beginPath();

    // 每条边中点留 gap 缺口，共 8 段 + 4 个圆角
    ctx.moveTo(left + cornerRadius, top);
    ctx.lineTo(left + size / 2 - gap / 2, top);
    ctx.moveTo(left + size / 2 + gap / 2, top);
    ctx.lineTo(left + size - cornerRadius, top);
    ctx.arcTo(left + size, top, left + size, top + cornerRadius, cornerRadius);

    ctx.lineTo(left + size, top + size / 2 - gap / 2);
    ctx.moveTo(left + size, top + size / 2 + gap / 2);
    ctx.lineTo(left + size, top + size - cornerRadius);
    ctx.arcTo(left + size, top + size, left + size - cornerRadius, top + size, cornerRadius);

    ctx.lineTo(left + size / 2 + gap / 2, top + size);
    ctx.moveTo(left + size / 2 - gap / 2, top + size);
    ctx.lineTo(left + cornerRadius, top + size);
    ctx.arcTo(left, top + size, left, top + size - cornerRadius, cornerRadius);

    ctx.lineTo(left, top + size / 2 + gap / 2);
    ctx.moveTo(left, top + size / 2 - gap / 2);
    ctx.lineTo(left, top + cornerRadius);
    ctx.arcTo(left, top, left + cornerRadius, top, cornerRadius);

    ctx.stroke();
    ctx.restore();
  }

  /** 在当前路径中追加圆角三角形（cornerRadius <= 0 退化为尖角）。 */
  private drawRoundedTriangle(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    cornerRadius: number,
  ): void {
    if (cornerRadius <= 0) {
      const ctx = this.context.ctx;
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.closePath();
      return;
    }

    const vertices = [
      { from: { x: x1, y: y1 }, to: { x: x2, y: y2 } },
      { from: { x: x2, y: y2 }, to: { x: x3, y: y3 } },
      { from: { x: x3, y: y3 }, to: { x: x1, y: y1 } },
    ];

    const ctx = this.context.ctx;

    for (let i = 0; i < 3; i++) {
      const prevEdge = vertices[(i + 2) % 3];
      const currEdge = vertices[i];
      const corner = currEdge.from;

      const dx1 = corner.x - prevEdge.from.x;
      const dy1 = corner.y - prevEdge.from.y;
      const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);

      const dx2 = currEdge.to.x - corner.x;
      const dy2 = currEdge.to.y - corner.y;
      const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

      const nx1 = dx1 / len1;
      const ny1 = dy1 / len1;
      const nx2 = dx2 / len2;
      const ny2 = dy2 / len2;

      // 圆角半径不超过两边一半，避免过大回绕
      const r = Math.min(cornerRadius, len1 / 2, len2 / 2);

      const beforeX = corner.x - nx1 * r;
      const beforeY = corner.y - ny1 * r;
      const afterX = corner.x + nx2 * r;
      const afterY = corner.y + ny2 * r;

      if (i === 0) {
        ctx.moveTo(beforeX, beforeY);
      } else {
        ctx.lineTo(beforeX, beforeY);
      }

      ctx.quadraticCurveTo(corner.x, corner.y, afterX, afterY);
    }

    ctx.closePath();
  }
}

export default TouchRenderer;
