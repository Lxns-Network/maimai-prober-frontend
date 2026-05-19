import { BaseRenderer, RenderContext } from "./BaseRenderer";
import { TouchNote, TouchHoldStartNote, Point2D, TouchPosition } from "../types";
import {
  TOUCH_SENSOR_RADII,
  TOUCH_APPROACH_MULTIPLIER,
  TOUCH_CENTER_DOT_RATIO,
  TOUCH_PETAL_OPEN_RATIO,
  TOUCH_PETAL_CLOSED_RATIO,
  NOTE_SIZE_RATIO,
  NOTE_STROKE_WIDTH_RATIO,
  COLORS,
  BASE_ANGLE,
  BUTTON_ANGLE_OFFSET,
  BUTTON_ANGLE_STEP,
} from "../utils/constants";

const FIREWORK_DURATION_MS = 1333;
// 15 片 pastel wedge，颜色循环。
const FIREWORK_PETAL_COLORS = [
  "#FFB3BA",
  "#FFD0A8",
  "#FFFAB8",
  "#D8F0A8",
  "#B8E0B0",
  "#A8E0CC",
  "#A8C8E8",
  "#B8B0E8",
  "#D0B0E8",
  "#F0B0D8",
  "#FFC9A8",
  "#FFEFA8",
  "#C8E8A8",
  "#A8E0BC",
  "#A8CCE8",
];

export class TouchRenderer extends BaseRenderer {
  // firework 离屏缓冲：让 dissolve 的 destination-out 只擦自身像素，不影响主 canvas。
  private fireworkOffscreen: HTMLCanvasElement | null = null;
  private fireworkOffscreenCtx: CanvasRenderingContext2D | null = null;
  private fireworkOffscreenSize = 0;
  private fireworkOffscreenDpr = 0;

  constructor(context: RenderContext) {
    super(context);
  }

  private acquireFireworkOffscreen(): {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    logicalSize: number;
  } {
    const mainCanvas = this.context.canvas;
    const logicalSize = this.context.centerX * 2;
    const dpr = mainCanvas.width / logicalSize;
    if (
      !this.fireworkOffscreen ||
      this.fireworkOffscreenSize !== logicalSize ||
      this.fireworkOffscreenDpr !== dpr
    ) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(logicalSize * dpr);
      canvas.height = Math.round(logicalSize * dpr);
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.fireworkOffscreen = canvas;
      this.fireworkOffscreenCtx = ctx;
      this.fireworkOffscreenSize = logicalSize;
      this.fireworkOffscreenDpr = dpr;
    }
    this.fireworkOffscreenCtx!.clearRect(0, 0, logicalSize, logicalSize);
    return { canvas: this.fireworkOffscreen!, ctx: this.fireworkOffscreenCtx!, logicalSize };
  }

  getTouchPosition(touchPosition: TouchPosition): Point2D {
    const mirroredPosition = this.mirrorTouchPosition(touchPosition);
    const region = mirroredPosition[0];
    const sensorNum = mirroredPosition.length > 1 ? parseInt(mirroredPosition[1]) : 0;

    const radiusRatio = TOUCH_SENSOR_RADII[region] || 0;
    const distance = this.context.radius * radiusRatio;

    if (region === "C") {
      return { x: this.context.centerX, y: this.context.centerY };
    }

    // D/E 与按钮对齐；A/B 偏移半个按钮。
    const angle =
      region === "D" || region === "E"
        ? BASE_ANGLE + (sensorNum - 1) * BUTTON_ANGLE_STEP
        : BASE_ANGLE + BUTTON_ANGLE_OFFSET + (sensorNum - 1) * BUTTON_ANGLE_STEP;

    return {
      x: this.context.centerX + Math.cos(angle) * distance,
      y: this.context.centerY + Math.sin(angle) * distance,
    };
  }

  renderTouch(
    note: TouchNote | TouchHoldStartNote,
    _currentBeat: number,
    currentTimeMs: number,
  ): void {
    const isHold = note.type === "touch-hold-start";
    const timeDiff = note.timingMs - currentTimeMs;
    const approachTime = this.getApproachTimeMs() * TOUCH_APPROACH_MULTIPLIER;

    let visibilityWindow = 50;
    if (isHold && "durationMs" in note && note.durationMs !== undefined) {
      visibilityWindow = note.durationMs + 50;
    }
    if (timeDiff > approachTime || timeDiff < -visibilityWindow) return;

    let alpha = 1;
    if (timeDiff > approachTime * 0.95) {
      alpha = 1 - (timeDiff - approachTime * 0.95) / (approachTime * 0.05);
    }

    // 淡出期：剩余 < 150ms 时花瓣线性淡出。
    let petalAlpha = 1;
    if (timeDiff > 0 && timeDiff < approachTime) {
      const remaining = approachTime - timeDiff;
      if (remaining < 150) {
        petalAlpha = remaining / 150;
      }
    }

    // 花瓣距离：approach 中 openDist → closedDist（ease-quartic），命中后保持 closedDist。
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
    const isSimultaneous = (note.simultaneousNoteCount ?? 0) >= 2;
    const isHoldActive = isHold && timeDiff < 0;
    const ctx = this.context.ctx;

    const cornerRadius = this.scaleByRadius(8 / 300);
    const innerCornerRadius = cornerRadius * 0.4;
    const strokeWidth = this.scaleByRadius(NOTE_STROKE_WIDTH_RATIO);
    const ddrColor = this.getDdrColor(note.timing);
    const petalBaseAngles = [-Math.PI / 4, Math.PI / 4, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];
    const angleOffset = isHold ? 0 : -Math.PI / 4;
    const petalColors = [
      COLORS.TOUCH_HOLD_RED,
      COLORS.TOUCH_HOLD_YELLOW,
      COLORS.TOUCH_HOLD_GREEN,
      COLORS.TOUCH_HOLD_BLUE,
    ];
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

    ctx.save();
    ctx.globalAlpha = alpha;

    // Hold 进度指示器
    if (isHoldActive && "durationMs" in note && note.durationMs !== undefined) {
      const elapsed = -timeDiff;
      const progress = Math.min(elapsed / note.durationMs, 1);

      const progressScale = 1.35;
      // 花瓣外侧黑边宽度，进度框/弧同步外扩保持视觉间距；跟随 strokeWidth 缩放。
      const progressBandPad = strokeWidth;
      const progressRadius = closedDist * progressScale * 1.8 + progressBandPad;
      const squareSize = closedDist * progressScale * 1.5 + progressBandPad;
      const r = Math.min(this.scaleByRadius(25 / 300), squareSize * 0.707); // 0.707 = sqrt(2)/2
      const endAngle = -Math.PI / 2 + progress * Math.PI * 2;

      ctx.save();

      // 圆角菱形 clip：上 → 右 → 下 → 左 角，每角用 quadratic 圆弧。
      const offset = r * 0.707;
      ctx.beginPath();
      ctx.moveTo(position.x - offset, position.y - squareSize + offset);
      ctx.quadraticCurveTo(
        position.x,
        position.y - squareSize,
        position.x + offset,
        position.y - squareSize + offset,
      );
      ctx.lineTo(position.x + squareSize - offset, position.y - offset);
      ctx.quadraticCurveTo(
        position.x + squareSize,
        position.y,
        position.x + squareSize - offset,
        position.y + offset,
      );
      ctx.lineTo(position.x + offset, position.y + squareSize - offset);
      ctx.quadraticCurveTo(
        position.x,
        position.y + squareSize,
        position.x - offset,
        position.y + squareSize - offset,
      );
      ctx.lineTo(position.x - squareSize + offset, position.y + offset);
      ctx.quadraticCurveTo(
        position.x - squareSize,
        position.y,
        position.x - squareSize + offset,
        position.y - offset,
      );
      ctx.closePath();
      ctx.clip();

      // 进度弧 clip：从顶部按 progress 顺时针扇形。
      ctx.beginPath();
      ctx.moveTo(position.x, position.y);
      ctx.arc(position.x, position.y, progressRadius, -Math.PI / 2, endAngle, false);
      ctx.closePath();
      ctx.clip();

      // 放大花瓣：scale 后再径向外推 progressBandPad，贴到放大后的裁剪边界。
      const px = position.x,
        py = position.y;
      const scaleOut = (vx: number, vy: number) => {
        const sx = (vx - px) * progressScale;
        const sy = (vy - py) * progressScale;
        const len = Math.hypot(sx, sy);
        if (len === 0) return { x: px, y: py };
        const k = (len + progressBandPad) / len;
        return { x: px + sx * k, y: py + sy * k };
      };
      for (let i = 0; i < 4; i++) {
        const p = petals[i];
        const tip = scaleOut(p.tipX, p.tipY);
        const lf = scaleOut(p.leftX, p.leftY);
        const rt = scaleOut(p.rightX, p.rightY);
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(lf.x, lf.y);
        ctx.lineTo(rt.x, rt.y);
        ctx.closePath();
        ctx.fillStyle = petalColors[i];
        ctx.fill();
      }

      ctx.restore();
    }

    // 花瓣阴影层（透明 fill 触发 canvas shadowBlur）。
    ctx.globalAlpha = combinedAlpha;
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = this.scaleByRadius(8 / 300);
    ctx.shadowOffsetX = this.scaleByRadius(2 / 300);
    ctx.shadowOffsetY = this.scaleByRadius(2 / 300);
    ctx.fillStyle = "rgba(0, 0, 0, 0.01)"; // 透明填充，只为阴影

    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const p = petals[i];
      this.drawRoundedTriangle(p.tipX, p.tipY, p.leftX, p.leftY, p.rightX, p.rightY, cornerRadius);
    }
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 外三角 + 内三角洞各做 wider black，逐花瓣 fill 覆盖内侧 halo 只剩外缘 + 空心。
    // wider = strokeWidth*3 让可见黑边跟随画布缩放，避免小屏下显得过粗。
    ctx.lineWidth = strokeWidth * 3;
    ctx.strokeStyle = "#000000";
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const p = petals[i];
      this.drawRoundedTriangle(p.tipX, p.tipY, p.leftX, p.leftY, p.rightX, p.rightY, cornerRadius);
    }
    ctx.stroke();
    if (!isHold) {
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const p = petals[i];
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
      ctx.stroke();
    }

    // 绘制花瓣填充
    for (let i = 0; i < 4; i++) {
      const p = petals[i];
      let fillStyle: string | CanvasGradient;

      if (ddrColor) {
        fillStyle = ddrColor;
      } else if (isHold) {
        fillStyle = petalColors[i];
      } else if (isSimultaneous) {
        const gradient = ctx.createLinearGradient(p.petalX, p.petalY, p.tipX, p.tipY);
        gradient.addColorStop(0, "#FFFF00");
        gradient.addColorStop(1, "#FFD700");
        fillStyle = gradient;
      } else {
        const gradient = ctx.createLinearGradient(p.petalX, p.petalY, p.tipX, p.tipY);
        gradient.addColorStop(0, "#00FFFF");
        gradient.addColorStop(1, "#0080FF");
        fillStyle = gradient;
      }

      // 非 hold 花瓣是外三角带内三角洞，反向缠绕挖空。
      ctx.beginPath();
      this.drawRoundedTriangle(p.tipX, p.tipY, p.leftX, p.leftY, p.rightX, p.rightY, cornerRadius);
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
      ctx.fillStyle = fillStyle;
      ctx.fill();
    }

    ctx.strokeStyle = COLORS.WHITE;
    ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const p = petals[i];
      this.drawRoundedTriangle(p.tipX, p.tipY, p.leftX, p.leftY, p.rightX, p.rightY, cornerRadius);
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
    }
    ctx.stroke();

    // 中心点：wider black → fill → white，fill 覆盖内侧 halo。
    ctx.globalAlpha = alpha;
    const centerSize = this.scaleByRadius(TOUCH_CENTER_DOT_RATIO) * 0.8;
    ctx.beginPath();
    ctx.arc(position.x, position.y, centerSize, 0, Math.PI * 2);
    ctx.lineWidth = strokeWidth * 3;
    ctx.strokeStyle = "#000000";
    ctx.stroke();
    ctx.fillStyle = isSimultaneous ? "#FFFF00" : "#00BFFF";
    ctx.fill();
    ctx.strokeStyle = COLORS.WHITE;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();

    ctx.restore();
  }

  /**
   * 触摸火花（`f` 标记）：单例，只渲染最近一次 hit 且在 1333ms 内的 touch。
   * Touch hold 在 hold 结束时触发（timingMs + durationMs）。
   */
  renderTouchFireworks(
    touches: ReadonlyArray<TouchNote | TouchHoldStartNote>,
    currentTimeMs: number,
  ): void {
    let latestTriggerMs = -Infinity;
    let latestNote: TouchNote | TouchHoldStartNote | null = null;
    for (const t of touches) {
      if (!t.hasFirework) continue;
      const triggerMs = t.type === "touch-hold-start" ? t.timingMs + t.durationMs : t.timingMs;
      if (triggerMs > currentTimeMs) continue;
      if (currentTimeMs - triggerMs >= FIREWORK_DURATION_MS) continue;
      if (triggerMs > latestTriggerMs) {
        latestTriggerMs = triggerMs;
        latestNote = t;
      }
    }
    if (!latestNote) return;
    const position = this.getTouchPosition(latestNote.position);

    // 渲染到离屏 canvas 再 drawImage，让 destination-out 只擦 firework 自身。
    const mainCtx = this.context.ctx;
    const { canvas: offCanvas, ctx: offCtx, logicalSize } = this.acquireFireworkOffscreen();
    this.context.ctx = offCtx;
    try {
      this.drawFirework(position.x, position.y, currentTimeMs - latestTriggerMs);
    } finally {
      this.context.ctx = mainCtx;
    }
    mainCtx.drawImage(offCanvas, 0, 0, logicalSize, logicalSize);
  }

  /** 渐变 pastel wedge starburst，所有参数硬编码。 */
  private drawFirework(x: number, y: number, ageMs: number): void {
    const ctx = this.context.ctx;
    const tSec = ageMs / 1000;
    // dissolve 完成后 mask 完全覆盖，直接返回
    if (tSec >= 1.1) return;

    // scale: cubic ease-out 0→5.0（t=0.1→0.5），之后维持到 mask 擦完。
    let scale: number;
    if (tSec < 0.1) scale = 0;
    else if (tSec < 0.5) {
      const u = (tSec - 0.1) / 0.4;
      scale = (1 - Math.pow(1 - u, 3)) * 5.0;
    } else scale = 5.0;
    if (scale <= 0) return;

    // canvas y-down 下正角即 CW。
    const rotation = (ageMs / FIREWORK_DURATION_MS) * ((72 * Math.PI) / 180);
    // 消失改由后面 destination-out mask 处理，alpha 全程保持 plateau。
    const alpha = 0.589;

    // scale=5.0 时外缘正好贴 canvas 内切圆。
    const baseRadius = this.context.radius / 4.5;
    const outerR = baseRadius * scale;
    if (outerR <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;

    // 三角形 wedge 从中心辐射，wedge 角宽 < 间隙；边缘 10% radial fade 避免硬切。
    const N = FIREWORK_PETAL_COLORS.length;
    const halfWidth = (Math.PI / N) * 0.45;
    const FADE_INNER = 0.9;

    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2 + rotation;
      const outerLA = angle - halfWidth;
      const outerRA = angle + halfWidth;
      const path = new Path2D();
      path.moveTo(x, y);
      path.lineTo(x + Math.cos(outerLA) * outerR, y + Math.sin(outerLA) * outerR);
      path.lineTo(x + Math.cos(outerRA) * outerR, y + Math.sin(outerRA) * outerR);
      path.closePath();

      const color = FIREWORK_PETAL_COLORS[i];
      const grad = ctx.createRadialGradient(x, y, 0, x, y, outerR);
      grad.addColorStop(0, color);
      grad.addColorStop(FADE_INNER, color);
      grad.addColorStop(1, color + "00"); // 8-hex 形式给 alpha=0
      ctx.fillStyle = grad;
      ctx.fill(path);
    }

    // 中心两层闪光，'lighter' 加法混合让重叠中心更亮。
    const growT = tSec - 0.1;
    if (growT >= 0) {
      ctx.globalCompositeOperation = "lighter";

      // ---- ColorBallBig（外圈光晕）：peak 0.7 留 headroom，避免与小球叠加后硬切。
      const BIG_GROW = 0.06;
      const BIG_RISE = 0.04;
      const bigRMax = baseRadius * 1.3;
      const BIG_DECAY_END = FIREWORK_DURATION_MS / 1000 - 0.1;
      const BIG_PEAK_ALPHA = 0.7;
      let bigAlpha = 0;
      let bigR = 0;
      if (growT < BIG_GROW) {
        bigR = (growT / BIG_GROW) * bigRMax;
        bigAlpha = BIG_PEAK_ALPHA * Math.min(1, growT / BIG_RISE);
      } else {
        const d = (growT - BIG_GROW) / (BIG_DECAY_END - BIG_GROW);
        bigR = bigRMax * (1 - d);
        bigAlpha = BIG_PEAK_ALPHA * (1 - d);
      }
      if (bigAlpha > 0 && bigR > 0) {
        ctx.globalAlpha = bigAlpha;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, bigR);
        grad.addColorStop(0, "rgb(255, 235, 200)");
        grad.addColorStop(1, "rgba(255, 180, 100, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, bigR, 0, Math.PI * 2);
        ctx.fill();
      }

      // ---- ColorBall（内核高光）：peak 0.6，与外圈叠加得到纯白中心 + 平滑 falloff。
      const SMALL_GROW = 0.04;
      const SMALL_RISE = 0.02;
      const smallRMax = baseRadius * 0.55;
      const SMALL_DECAY_END = 0.55;
      const SMALL_PEAK_ALPHA = 0.6;
      let smallAlpha = 0;
      let smallR = 0;
      if (growT < SMALL_GROW) {
        smallR = (growT / SMALL_GROW) * smallRMax;
        smallAlpha = SMALL_PEAK_ALPHA * Math.min(1, growT / SMALL_RISE);
      } else if (growT < SMALL_DECAY_END) {
        const d = (growT - SMALL_GROW) / (SMALL_DECAY_END - SMALL_GROW);
        smallR = smallRMax * (1 - d);
        smallAlpha = SMALL_PEAK_ALPHA * (1 - d);
      }
      if (smallAlpha > 0 && smallR > 0) {
        ctx.globalAlpha = smallAlpha;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, smallR);
        grad.addColorStop(0, "rgb(255, 245, 220)");
        grad.addColorStop(1, "rgba(255, 220, 160, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, smallR, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";
    }

    // 消失阶段：destination-out mask = 实心核心 + 羽化阴影，从中心扩张擦除。
    const HOLE_START_SEC = 0.6;
    const HOLE_END_SEC = 1.1;
    const MASK_FEATHER_RATIO = 0.5;
    const MASK_START_SOLID_R_RATIO = 0.05;
    if (tSec > HOLE_START_SEC) {
      const linearU = Math.min(1, (tSec - HOLE_START_SEC) / (HOLE_END_SEC - HOLE_START_SEC));
      // alpha 在前 20% 快速升到 1 让实心 mask 早早可见；尺寸 smoothstep 起停柔和。
      const u = linearU * linearU * (3 - 2 * linearU);
      const featherThickness = outerR * MASK_FEATHER_RATIO;
      const solidR = outerR * (MASK_START_SOLID_R_RATIO + u * (1 - MASK_START_SOLID_R_RATIO));
      const totalR = solidR + featherThickness;
      const ALPHA_RISE_U = 0.2;
      const maskAlpha = Math.min(1, linearU / ALPHA_RISE_U);
      if (totalR > 0 && maskAlpha > 0) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = maskAlpha;
        const maskGrad = ctx.createRadialGradient(x, y, 0, x, y, totalR);
        maskGrad.addColorStop(0, "rgba(0,0,0,1)");
        maskGrad.addColorStop(solidR / totalR, "rgba(0,0,0,1)");
        maskGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = maskGrad;
        ctx.beginPath();
        ctx.arc(x, y, totalR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  /** 同位置多 touch 时围一圈带 gap 的圆角框。 */
  renderTouchBorder(
    note: TouchNote | TouchHoldStartNote,
    position: Point2D,
    isSimultaneous: boolean,
  ): void {
    if (!note.visibleTouchCount || note.visibleTouchCount < 2) {
      return;
    }

    const boxSize = this.scaleByRadius(1 / 4.46) * 1.1 * 1.2;
    const cornerRadius = this.scaleByRadius(NOTE_SIZE_RATIO);
    const color = isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TOUCH_CYAN;

    // 绘制更大的边框用于 3+ 触摸
    if (note.visibleTouchCount >= 3) {
      const largerSize = boxSize * 1.2;
      this.drawTouchBorderBox(position.x, position.y, largerSize, cornerRadius, color, 3);
    }

    this.drawTouchBorderBox(position.x, position.y, boxSize, cornerRadius, color, 3);
  }

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

    // 圆角方框，每条边中点被 gap 切开 → 8 段（每边两半 + 4 个圆角）。
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

      // 圆角半径上限 = 两边一半，避免过大触发回绕。
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
