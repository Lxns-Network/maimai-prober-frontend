import { BaseRenderer, RenderContext } from "./BaseRenderer";
import {
  SlideNote,
  SlideSegment,
  Point2D,
  ButtonPosition,
  NoteRenderPosition,
  SlideArcLutPoint,
} from "../types";
import { NoteRenderer } from "./NoteRenderer";
import {
  SLIDE_ARROW_WIDTH_RATIO,
  SLIDE_ARROW_SPACING,
  SLIDE_CURVE_OFFSET_RATIO,
  COLORS,
  APPROACH_START_SCALE,
  NOTE_VISIBILITY_AFTER_MS,
} from "../utils/constants";
import { detectSlideShape, SLIDE_AREA_STEP_MAP } from "../utils/slideAreaSteps";
import { SLIDE_BARS } from "../utils/slideBars";

export type SlideRenderMode = "tracks" | "stars";

export class SlideRenderer extends BaseRenderer {
  private noteRenderer: NoteRenderer;

  constructor(context: RenderContext, noteRenderer: NoteRenderer) {
    super(context);
    this.noteRenderer = noteRenderer;
  }

  /**
   * 把 prefab bar 列表（unit-disc）变换到当前 canvas 坐标。返回的 polyline 同时
   * 喂给箭头渲染和 getPointOnSegment（星头），保证两者跟同一条曲线。
   */
  private getBarChain(segment: SlideSegment): { x: number; y: number }[] | null {
    const shape = detectSlideShape(segment.type, segment.startPos, segment.endPos);
    if (!shape) return null;
    const bars = SLIDE_BARS[shape.shape];
    if (!bars) return null;

    // 模板按 startPos=1 设计：非镜像时旋 (startPos-1)·π/4 把 button 1 → startPos；
    // shape.mirror 先 x→-x 把 button 1 翻到 button 8，要多旋 45° 才能转回。
    const startRotation = ((segment.startPos - (shape.mirror ? 0 : 1)) * Math.PI) / 4;
    const cosR = Math.cos(startRotation);
    const sinR = Math.sin(startRotation);
    const r = this.context.radius;
    const cx = this.context.centerX;
    const cy = this.context.centerY;
    // 用户 mirror（h 翻 x / v 翻 y / rotate180 双翻），跟 mirrorPosition 配套。
    const mode = this.context.config.mirrorMode;
    const sx = mode === "horizontal" || mode === "rotate180" ? -1 : 1;
    const sy = mode === "vertical" || mode === "rotate180" ? -1 : 1;

    // Circle prefab 原意是 π/32 等距 grid（8 bar/button-step）+ 半径 ~0.993，源数据
    // 有 float 漂移。snap 到精确 grid + 固定半径，让 π/4 倍数的旋转后 overlap 对齐。
    const isCircle = shape.shape.startsWith("circle");
    const CIRCLE_BAR_R = 0.993;
    const GRID_PER_PI = 32;

    return bars.map((bar) => {
      let bx = shape.mirror ? -bar.x : bar.x;
      let by = bar.y;
      if (isCircle) {
        const angle = Math.atan2(by, bx);
        const snapped = Math.round((angle * GRID_PER_PI) / Math.PI) * (Math.PI / GRID_PER_PI);
        bx = Math.cos(snapped) * CIRCLE_BAR_R;
        by = Math.sin(snapped) * CIRCLE_BAR_R;
      }
      return {
        x: cx + sx * r * (bx * cosR - by * sinR),
        y: cy + sy * r * (bx * sinR + by * cosR),
      };
    });
  }

  calculateSlideStartPosition(
    note: SlideNote,
    _currentBeat: number,
    currentTimeMs: number,
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
    mode: SlideRenderMode = "tracks",
  ): void {
    if (note.isSplitSlide && note.allSlideSegments) {
      for (let i = 0; i < note.allSlideSegments.length; i++) {
        const segments = note.allSlideSegments[i];
        if (segments && segments.length > 0) {
          this.renderSlidePath(note, currentBeat, currentTimeMs, segments, i, mode);
        }
      }
    } else if (note.slideSegments && note.slideSegments.length > 0) {
      this.renderSlidePath(note, currentBeat, currentTimeMs, note.slideSegments, 0, mode);
    }
  }

  private renderSlidePath(
    note: SlideNote,
    _currentBeat: number,
    currentTimeMs: number,
    segments: SlideSegment[],
    pathIndex: number = 0,
    mode: SlideRenderMode = "tracks",
  ): void {
    const approachHalf = this.getApproachTimeMs() / 2;
    const visibilityStart = note.timingMs - approachHalf;

    const durationMs = note.allDurationMs ? note.allDurationMs[pathIndex] : note.durationMs;
    const delayMs = note.allDelayMs
      ? note.allDelayMs[pathIndex]
      : (note.delayMs ?? 60000 / note.bpm);
    const slideStart = note.timingMs + delayMs;

    if (currentTimeMs < visibilityStart || currentTimeMs > slideStart + durationMs) {
      return;
    }

    let alpha = 1;
    if (currentTimeMs < note.timingMs) {
      const fadeProgress = (currentTimeMs - visibilityStart) / approachHalf;
      alpha = Math.max(0, Math.min(1, fadeProgress));
    }

    this.withContext(() => {
      this.context.ctx.globalAlpha = alpha;

      let progress = 0;
      if (currentTimeMs >= slideStart) {
        const elapsed = currentTimeMs - slideStart;
        progress = Math.min(1, elapsed / durationMs);
      }

      const isSimultaneous =
        (note.simultaneousSlideCount ?? 0) >= 2 || (note.isSplitSlide ?? false);

      if (mode === "tracks") {
        const isBreak = note.allSlideBreaks?.[pathIndex] ?? false;

        const segmentLengths = segments.map((seg) => this.getSegmentLength(seg));
        const totalLength = segmentLengths.reduce((a, b) => a + b, 0);
        const segmentRanges: { start: number; end: number }[] = [];
        let cumulative = 0;
        for (const len of segmentLengths) {
          const start = cumulative / totalLength;
          cumulative += len;
          const end = cumulative / totalLength;
          segmentRanges.push({ start, end });
        }

        // 反向迭代让后画的段叠在前画的段上；chunky snap 让内部函数查 areaStep，
        // 外层只传原始 progress（双层 snap 会在 chunk 边界处错位）。
        for (let i = segments.length - 1; i >= 0; i--) {
          const segment = segments[i];
          const range = segmentRanges[i];

          let segmentProgress = 0;
          if (progress > range.start) {
            segmentProgress =
              progress >= range.end ? 1 : (progress - range.start) / (range.end - range.start);
          }

          this.renderSlideSegment(
            segment,
            isBreak,
            segmentProgress,
            isSimultaneous,
            this.context.config.normalColorBreakSlide,
          );
        }
      } else {
        if (currentTimeMs >= note.timingMs) {
          this.renderSlideStar(note, progress, segments, pathIndex, currentTimeMs, isSimultaneous);
        }
      }
    });
  }

  private renderSlideSegment(
    segment: SlideSegment,
    isBreak: boolean,
    progress: number = 0,
    isSimultaneous: boolean = false,
    normalBreakColor: boolean = false,
  ): boolean {
    const mirroredType = this.mirrorPathType(segment.type);

    this.withContext(() => {
      const ctx = this.context.ctx;
      ctx.lineWidth = this.scaleByRadius(SLIDE_ARROW_WIDTH_RATIO);

      if (isBreak && !normalBreakColor) {
        ctx.strokeStyle = COLORS.BREAK_ORANGE;
      } else if (isSimultaneous) {
        ctx.strokeStyle = COLORS.SLIDE_SIMULTANEOUS;
      } else {
        ctx.strokeStyle = COLORS.SLIDE_CYAN;
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (segment.type === "w") {
        this.renderWifiBars(segment, progress);
        return;
      }

      // 其他形状：prefab bar 位置 + drawSlideArrowsBatch（均匀箭头）。
      const bars = this.getVisibleBarsForSegment(segment, progress);
      if (bars !== null) {
        if (bars.length > 0) this.drawSlideArrowsBatch(bars);
        return;
      }

      switch (mirroredType) {
        case "-":
          this.renderSegmentPath(segment, progress);
          break;
        case ">":
          this.renderSegmentPath(segment, progress);
          break;
        case "<":
          this.renderSegmentPath(segment, progress);
          break;
        case "^":
          if (Math.abs(this.mirrorPosition(segment.endPos) - this.mirrorPosition(segment.startPos)) === 4) return false;
          this.renderSegmentPath(segment, progress);
          break;
        case "v":
          if (Math.abs(this.mirrorPosition(segment.endPos) - this.mirrorPosition(segment.startPos)) === 4) return false;
          this.renderSegmentPath(segment, progress);
          break;
        case "p":
        case "pp":
        case "q":
        case "qq":
          this.renderSegmentPath(segment, progress);
          break;
        case "s":
          this.renderSegmentPath(segment, progress);
          break;
        case "z":
          this.renderSegmentPath(segment, progress);
          break;
      }
    });

    return true;
  }

  /**
   * Wifi 渲染：每个 bar 是对称 chevron，corner 朝 endPos、两臂朝 startPos 方向张开。
   *
   * - 11 个 corner 落在 pivot(startPos)→endPos 的 button 直线上，等距插值（prefab
   *   原始位置跟 button 直线有 ~0.7% 横向偏差，所以投影到直线再插值）。
   * - `CHAIN_SCALE` 控制 chain 沿 fan 方向总长（>1 把 prefab 末端推向 endPos rim）。
   * - 每个 chevron 两臂等长，bend 135°（每臂与 -x_fan 轴成 ±67.5°）。
   * - armLen = `cos(67.5°) · d_from_pivot`：精确反解能让 arm tip 正好落到从 startPos
   *   出发的 ±22.5° fan blade ray 上，所有 chevron 的 tip 在左右各自共线。
   * - chunky：floor + `steps[i] + 1`（inclusive 隐藏），progress = 0 时全部可见。
   */
  private renderWifiBars(segment: SlideSegment, progress: number): void {
    const chain = this.getBarChain(segment);
    if (!chain || chain.length < 2) return;

    const steps = SLIDE_AREA_STEP_MAP["wifi"];
    let hiddenCount = 0;
    if (progress > 0 && steps && steps.length >= 2) {
      const i = Math.min(steps.length - 1, Math.floor(progress * (steps.length - 1)));
      hiddenCount = steps[i] + 1;
    }

    const pivot = this.noteRenderer.getPositionOnRing(segment.startPos);
    const endPivot = this.noteRenderer.getPositionOnRing(segment.endPos);
    const axisLen = Math.hypot(endPivot.x - pivot.x, endPivot.y - pivot.y);
    const axisUx = (endPivot.x - pivot.x) / axisLen;
    const axisUy = (endPivot.y - pivot.y) / axisLen;
    const fanAngle = Math.atan2(axisUy, axisUx);

    const CHAIN_SCALE = 1.15;
    const N = chain.length;
    const dFirst = Math.hypot(chain[0].x - pivot.x, chain[0].y - pivot.y) * CHAIN_SCALE;
    const dLast = Math.hypot(chain[N - 1].x - pivot.x, chain[N - 1].y - pivot.y) * CHAIN_SCALE;

    const ARM_HALF_ANGLE = ((135 / 2) * Math.PI) / 180; // 67.5°
    const cosA = Math.cos(ARM_HALF_ANGLE); // ≈ 0.383
    const sinA = Math.sin(ARM_HALF_ANGLE); // ≈ 0.924

    const chevrons: {
      x: number;
      y: number;
      arm1Dx: number;
      arm1Dy: number;
      arm2Dx: number;
      arm2Dy: number;
    }[] = [];
    for (let i = N - 1; i >= hiddenCount; i--) {
      const d = dFirst + (dLast - dFirst) * (i / (N - 1));
      const armLen = cosA * d;
      chevrons.push({
        x: pivot.x + axisUx * d,
        y: pivot.y + axisUy * d,
        arm1Dx: -armLen * cosA,
        arm1Dy: +armLen * sinA,
        arm2Dx: -armLen * cosA,
        arm2Dy: -armLen * sinA,
      });
    }
    if (chevrons.length === 0) return;
    this.drawWifiChevronsBatch(chevrons, fanAngle);
  }

  private getVisibleBarsForSegment(
    segment: SlideSegment,
    progress: number,
  ): { x: number; y: number; angle: number }[] | null {
    if (segment.type === "w") return null;
    const chain = this.getBarChain(segment);
    if (!chain) return null;
    const shape = detectSlideShape(segment.type, segment.startPos, segment.endPos)!;

    // chunky 隐藏：areaStep[i] = 累积隐藏数量，floor 对齐分段时序。
    const steps = SLIDE_AREA_STEP_MAP[shape.shape];
    const hiddenCount =
      steps && steps.length >= 2
        ? steps[Math.min(steps.length - 1, Math.floor(progress * (steps.length - 1)))]
        : 0;

    // 各 bar 自带的朝向数据不一致，从相邻 bar 算 tangent。central difference
    // 让索引无关：两条 overlap slide 同 prefab 旋转后，同位置的 bar 在两侧索引
    // 可能不同（一条的 last 可能是另一条的中间），forward-only 会算出不同 tangent。
    // 倒序 push 让近 star 的 bar 落数组末尾 = 最后画 = 最上层。
    const result: { x: number; y: number; angle: number }[] = [];
    const last = chain.length - 1;
    for (let i = last; i >= hiddenCount; i--) {
      const lo = i === 0 ? 0 : i - 1;
      const hi = i === last ? last : i + 1;
      const dx = chain[hi].x - chain[lo].x;
      const dy = chain[hi].y - chain[lo].y;
      result.push({ x: chain[i].x, y: chain[i].y, angle: Math.atan2(dy, dx) });
    }
    return result;
  }

  private renderSegmentPath(segment: SlideSegment, progress: number): void {
    const lut = this.getSegmentLut(segment);
    const totalLength = lut[lut.length - 1].s;
    if (totalLength <= 0) return;

    const spacing = (SLIDE_ARROW_SPACING * this.context.radius) / 300;
    const arrowCount = Math.floor(totalLength / spacing);
    if (arrowCount === 0) return;

    const minS = progress * totalLength;
    const arrows: { x: number; y: number; angle: number }[] = [];

    for (let i = arrowCount - 1; i >= 0; i--) {
      const s = (i + 0.5) * spacing;
      if (s < minS) continue;
      arrows.push(this.sampleArcLut(lut, s));
    }

    if (arrows.length === 0) return;
    this.drawSlideArrowsBatch(arrows);
  }

  /**
   * 沿 pathFn 等步长采样 t∈[0,1]，输出每点位置、入向切线角和累计弧长。
   * 第 0 点的角度用 t→0 的"出向"方向，避免首段方向缺失。
   */
  private buildArcLut(pathFn: (t: number) => Point2D, samples: number = 64): SlideArcLutPoint[] {
    const lut: SlideArcLutPoint[] = new Array(samples + 1);
    const p0 = pathFn(0);
    const p1 = pathFn(1 / samples);
    lut[0] = { x: p0.x, y: p0.y, angle: Math.atan2(p1.y - p0.y, p1.x - p0.x), s: 0 };

    let prev = p0;
    let acc = 0;
    for (let i = 1; i <= samples; i++) {
      const cur = i === 1 ? p1 : pathFn(i / samples);
      const dx = cur.x - prev.x;
      const dy = cur.y - prev.y;
      acc += Math.hypot(dx, dy);
      lut[i] = { x: cur.x, y: cur.y, angle: Math.atan2(dy, dx), s: acc };
      prev = cur;
    }
    return lut;
  }

  /**
   * 取 segment 的弧长 LUT，缓存到 segment.cachedLut。
   * 顺手回填 cachedLength（与 LUT 同源，避免两套长度数据不一致）。
   * canvas radius / mirror mode 变化时缓存失效重算。
   */
  private getSegmentLut(segment: SlideSegment): readonly SlideArcLutPoint[] {
    const mode = this.context.config.mirrorMode;
    if (
      segment.cachedLut &&
      segment.cachedRadius === this.context.radius &&
      segment.cachedMirrorMode === mode
    ) {
      return segment.cachedLut;
    }
    const lut = this.buildArcLut((t) => this.getPointOnSegment(segment, t));
    segment.cachedLut = lut;
    segment.cachedLength = lut[lut.length - 1].s;
    segment.cachedRadius = this.context.radius;
    segment.cachedMirrorMode = mode;
    return lut;
  }

  /**
   * 在 LUT 上按累计弧长 s 二分查找，并在所在段内线性内插位置。
   * 角度直接取该段的入向角（比插值更稳定，避免回转点抖动）。
   */
  private sampleArcLut(
    lut: readonly SlideArcLutPoint[],
    s: number,
  ): { x: number; y: number; angle: number } {
    if (s <= 0) {
      const f = lut[0];
      return { x: f.x, y: f.y, angle: f.angle };
    }
    const last = lut[lut.length - 1];
    if (s >= last.s) {
      return { x: last.x, y: last.y, angle: last.angle };
    }
    let lo = 0;
    let hi = lut.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >>> 1;
      if (lut[mid].s <= s) lo = mid;
      else hi = mid;
    }
    const a = lut[lo];
    const b = lut[hi];
    const span = b.s - a.s;
    const u = span > 0 ? (s - a.s) / span : 0;
    return {
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
      angle: b.angle,
    };
  }

  private drawSlideArrowsBatch(arrows: { x: number; y: number; angle: number }[]): void {
    if (arrows.length === 0) return;
    const ctx = this.context.ctx;
    const arrowHeight = (32 * this.context.radius) / 300;
    const arrowWidth = (6 * 1.6 * this.context.radius) / 300;
    const lineWidth = this.scaleByRadius(SLIDE_ARROW_WIDTH_RATIO);
    const radiusScale = this.context.radius / 300;
    const mainStroke = ctx.strokeStyle;

    // 拖影参数：从弱到强（先弱后强叠加，靠近本体的色更浓）
    const shadows = [
      { offset: 5, alpha: 0.2, extra: 6 },
      { offset: 3, alpha: 0.5, extra: 3 },
    ];

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // 逐箭头叠绘 outline → 拖影 → 主体（不按层批量）：arrows[0] 在远端、arrows[N-1]
    // 靠 star 头，正向迭代让靠 star 的盖在远端上，自重叠路径处可见黑边切割下层。
    for (const arrow of arrows) {
      const cos = Math.cos(arrow.angle);
      const sin = Math.sin(arrow.angle);

      const x1 = arrow.x + cos * (-arrowWidth / 2) - sin * (-arrowHeight / 2);
      const y1 = arrow.y + sin * (-arrowWidth / 2) + cos * (-arrowHeight / 2);
      const x2 = arrow.x + cos * (arrowWidth / 2);
      const y2 = arrow.y + sin * (arrowWidth / 2);
      const x3 = arrow.x + cos * (-arrowWidth / 2) - sin * (arrowHeight / 2);
      const y3 = arrow.y + sin * (-arrowWidth / 2) + cos * (arrowHeight / 2);

      const main = new Path2D();
      main.moveTo(x1, y1);
      main.lineTo(x2, y2);
      main.lineTo(x3, y3);

      ctx.lineWidth = lineWidth + 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke(main);

      for (const shadow of shadows) {
        const offsetX = -shadow.offset * radiusScale;
        const sx1 = arrow.x + cos * (-arrowWidth / 2 + offsetX) - sin * (-arrowHeight / 2);
        const sy1 = arrow.y + sin * (-arrowWidth / 2 + offsetX) + cos * (-arrowHeight / 2);
        const sx2 = arrow.x + cos * (arrowWidth / 2 + offsetX);
        const sy2 = arrow.y + sin * (arrowWidth / 2 + offsetX);
        const sx3 = arrow.x + cos * (-arrowWidth / 2 + offsetX) - sin * (arrowHeight / 2);
        const sy3 = arrow.y + sin * (-arrowWidth / 2 + offsetX) + cos * (arrowHeight / 2);

        const trail = new Path2D();
        trail.moveTo(sx1, sy1);
        trail.lineTo(sx2, sy2);
        trail.lineTo(sx3, sy3);

        ctx.lineWidth = lineWidth + shadow.extra;
        ctx.strokeStyle = `rgba(0, 0, 0, ${shadow.alpha})`;
        ctx.stroke(trail);
      }

      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = mainStroke;
      ctx.stroke(main);
    }

    ctx.restore();
  }

  /**
   * 画 chevron：每条 chevron 由 corner + 两条 arm tip 在 fan-local 帧的偏移定义。
   * path = `M arm1 L corner L arm2`，stroke 同 slide arrow（外黑边 + 两层 drop shadow
   * + 主色）。arm1/arm2 是 arm tip 相对 corner 的偏移，在调用方按 fanAngle 旋转。
   */
  private drawWifiChevronsBatch(
    chevrons: {
      x: number;
      y: number;
      arm1Dx: number;
      arm1Dy: number;
      arm2Dx: number;
      arm2Dy: number;
    }[],
    fanAngle: number,
  ): void {
    if (chevrons.length === 0) return;
    const ctx = this.context.ctx;
    const lineWidth = (19.2 * this.context.radius) / 300;
    const radiusScale = this.context.radius / 300;
    const mainStroke = ctx.strokeStyle;
    const cos = Math.cos(fanAngle);
    const sin = Math.sin(fanAngle);

    const shadows = [
      { offset: 5, alpha: 0.15, extra: 6 },
      { offset: 3, alpha: 0.4, extra: 3 },
    ];

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const c of chevrons) {
      const a1x = c.x + cos * c.arm1Dx - sin * c.arm1Dy;
      const a1y = c.y + sin * c.arm1Dx + cos * c.arm1Dy;
      const a2x = c.x + cos * c.arm2Dx - sin * c.arm2Dy;
      const a2y = c.y + sin * c.arm2Dx + cos * c.arm2Dy;

      const main = new Path2D();
      main.moveTo(a1x, a1y);
      main.lineTo(c.x, c.y);
      main.lineTo(a2x, a2y);

      ctx.lineWidth = lineWidth + 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke(main);

      for (const shadow of shadows) {
        const offsetX = -shadow.offset * radiusScale;
        const s1x = a1x + cos * offsetX;
        const s1y = a1y + sin * offsetX;
        const scx = c.x + cos * offsetX;
        const scy = c.y + sin * offsetX;
        const s2x = a2x + cos * offsetX;
        const s2y = a2y + sin * offsetX;
        const trail = new Path2D();
        trail.moveTo(s1x, s1y);
        trail.lineTo(scx, scy);
        trail.lineTo(s2x, s2y);
        ctx.lineWidth = lineWidth + shadow.extra;
        ctx.strokeStyle = `rgba(0, 0, 0, ${shadow.alpha})`;
        ctx.stroke(trail);
      }

      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = mainStroke;
      ctx.stroke(main);
    }

    ctx.restore();
  }

  renderSlideStar(
    note: SlideNote,
    progress: number,
    segments: SlideSegment[],
    pathIndex: number,
    currentTimeMs: number,
    isSimultaneous: boolean,
  ): void {
    if (segments.length > 0 && segments[0].type === "w") {
      this.renderWifiStars(note, progress, segments, currentTimeMs, isSimultaneous, pathIndex);
      return;
    }

    const delayMs = note.allDelayMs?.[pathIndex] ?? note.delayMs ?? 60000 / note.bpm;
    const slideStart = note.timingMs + delayMs;

    let starPos: Point2D;
    let starScale = 1;
    let rotation = 0;
    const isSliding = currentTimeMs >= slideStart;

    if (!isSliding) {
      if (note.headlessMode === "pop") return;

      starPos = this.noteRenderer.getPositionOnRing(segments[0].startPos);
      const elapsed = currentTimeMs - note.timingMs;
      starScale = Math.min(1, elapsed / delayMs);

      if (this.context.config.slideRotation) {
        rotation = this.calculateStarRotation(note, currentTimeMs);
      }
    } else {
      starPos = this.getPointAlongPath(progress, segments);
      starScale = 1;

      if (this.context.config.slideRotation) {
        rotation = this.getPathTangentAngle(progress, segments) + Math.PI / 2;
      }
    }

    if (!starPos) return;

    this.withContext(() => {
      this.context.ctx.globalAlpha = 1;
      const size = (this.context.radius / 10.42) * starScale * 1.2;

      let color: string;
      const isBreak =
        note.allSlideBreaks?.[pathIndex] && !this.context.config.normalColorBreakSlide;

      if (isBreak) {
        color = COLORS.BREAK_ORANGE;
      } else if (isSimultaneous) {
        color = COLORS.SLIDE_SIMULTANEOUS;
      } else {
        color = this.context.config.pinkSlideStart ? COLORS.SLIDE_PINK : COLORS.SLIDE_CYAN;
      }

      this.drawStar(starPos.x, starPos.y, size, color, rotation, note.isEx ?? false);
    });
  }

  private renderWifiStars(
    note: SlideNote,
    progress: number,
    segments: SlideSegment[],
    currentTimeMs: number,
    isSimultaneous: boolean,
    pathIndex: number,
  ): void {
    const delayMs = note.allDelayMs?.[pathIndex] ?? note.delayMs ?? 60000 / note.bpm;
    const slideStart = note.timingMs + delayMs;
    const startPos = segments[0].startPos;
    const endPos = segments[0].endPos;

    const fanPositions = [
      { startPos, endPos },
      { startPos, endPos: (((endPos - 1 - 1 + 8) % 8) + 1) as ButtonPosition },
      { startPos, endPos: (((endPos - 1 + 1) % 8) + 1) as ButtonPosition },
    ];

    this.withContext(() => {
      this.context.ctx.globalAlpha = 1;

      for (const fan of fanPositions) {
        const start = this.noteRenderer.getPositionOnRing(fan.startPos);
        const end = this.noteRenderer.getPositionOnRing(fan.endPos);
        // 每颗 fan 星头朝自己的目的地：左右两条 fan 的星尖恰好指向相邻轨迹。
        const direction = Math.atan2(end.y - start.y, end.x - start.x);
        const rotation = this.context.config.slideRotation ? direction + Math.PI / 2 : 0;

        let starPos: Point2D;
        let starScale = 1;

        if (currentTimeMs < slideStart) {
          if (note.headlessMode === "pop") continue;

          starPos = start;
          const elapsed = currentTimeMs - note.timingMs;
          starScale = Math.min(1, elapsed / delayMs);
        } else {
          starPos = {
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
          };
        }

        if (starPos) {
          const size = (this.context.radius / 10.42) * starScale * 1.2;
          const isBreak =
            note.allSlideBreaks?.[pathIndex] && !this.context.config.normalColorBreakSlide;

          let color: string;
          if (isBreak) {
            color = COLORS.BREAK_ORANGE;
          } else if (isSimultaneous) {
            color = COLORS.SLIDE_SIMULTANEOUS;
          } else {
            color = this.context.config.pinkSlideStart ? COLORS.SLIDE_PINK : COLORS.SLIDE_CYAN;
          }

          this.drawStar(starPos.x, starPos.y, size, color, rotation, note.isEx ?? false);
        }
      }
    });
  }

  drawStar(
    x: number,
    y: number,
    size: number,
    color: string,
    rotation: number = 0,
    isEx: boolean = false,
  ): void {
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
      const strokeW = this.getNoteStrokeWidth();

      // 外星 + 内孔各做一圈 wider black，ring fill 覆盖内侧 halo 只剩外缘黑边。
      // EX 占用外圈，跳过外星的黑边但保留内孔。wider = strokeW*3 让可见黑边 ≈
      // strokeW，跟随画布缩放避免小屏下过粗。
      ctx.lineWidth = strokeW * 3;
      ctx.strokeStyle = "#000000";

      if (!isEx) {
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
      }

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

      // 外星 + 内孔（同向 path 描外环，反向 path 挖内孔 = 环形效果）
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

      ctx.strokeStyle = COLORS.WHITE;
      ctx.lineWidth = this.getNoteStrokeWidth();
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
    scaleFactor: number = 1,
  ): void {
    this.withContext(() => {
      const ctx = this.context.ctx;

      const scale = 1.19 * scaleFactor;
      const outerRadius = size * scale;
      const outerInner = size * 0.5 * scale;
      const innerRadius = size;
      const innerInner = size * 0.5;

      let color: string;
      if (isBreak) {
        color = "rgba(255, 200, 120, 0.8)";
      } else if (isSimultaneous) {
        color = "rgba(255, 245, 150, 0.8)";
      } else if (this.context.config.pinkSlideStart) {
        color = "rgba(255, 180, 210, 0.8)";
      } else {
        color = "rgba(100, 230, 230, 0.8)";
      }

      ctx.beginPath();
      // 外星形状
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? outerRadius : outerInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      // 内孔 (星形孔)
      for (let i = 9; i >= 0; i--) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
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
    scaleFactor: number = 1,
  ): void {
    this.withContext(() => {
      const ctx = this.context.ctx;

      const scale = 1.19 * scaleFactor;
      const outerRadius = size * scale;
      const outerInner = size * 0.5 * scale;
      const innerRadius = size;
      const innerInner = size * 0.5;

      let color: string;
      if (isBreak) {
        color = "rgba(255, 200, 120, 0.8)";
      } else if (isSimultaneous) {
        color = "rgba(255, 245, 150, 0.8)";
      } else if (this.context.config.pinkSlideStart) {
        color = "rgba(255, 180, 210, 0.8)";
      } else {
        color = "rgba(100, 230, 230, 0.8)";
      }

      // 第一个星星 (指向向上，baseAngle = -PI/2)
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? outerRadius : outerInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      for (let i = 9; i >= 0; i--) {
        const angle = (i * Math.PI) / 5 - Math.PI / 2;
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
        const angle = (i * Math.PI) / 5 + Math.PI / 2;
        const radius = i % 2 === 0 ? outerRadius : outerInner;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      for (let i = 9; i >= 0; i--) {
        const angle = (i * Math.PI) / 5 + Math.PI / 2;
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

    let totalLengthPixels = 0;
    for (const seg of segments) {
      totalLengthPixels += this.getSegmentLength(seg);
    }

    // 归一化到标准 300 半径下的像素长度（与 spacing 常量同尺度）
    const normalizedLength = totalLengthPixels * (300 / this.context.radius);

    // 原始公式 (度/帧 @ 60FPS): NormalizedLength / π / TotalDurationMs × 15
    // ÷ (1000/60) 转成度/ms。最大值上限 18 度/帧 = 1.08 度/ms。
    const rotationSpeedDegPerMs = (normalizedLength / Math.PI / durationMs) * 15 * 0.06;
    const MAX_ROTATION_DEG_PER_MS = 1.08;
    const cappedRotationDegPerMs = Math.min(rotationSpeedDegPerMs, MAX_ROTATION_DEG_PER_MS);
    // 负号 = 顺时针
    const rotationSpeedRadPerMs = -cappedRotationDegPerMs * (Math.PI / 180);

    const approachTime = this.getApproachTimeMs();
    const visibilityStart = note.timingMs - approachTime;
    if (currentTimeMs < visibilityStart) return 0;

    const elapsedMs = currentTimeMs - visibilityStart;
    return rotationSpeedRadPerMs * elapsedMs;
  }

  getSegmentLength(segment: SlideSegment): number {
    if (
      segment.cachedLength !== undefined &&
      segment.cachedRadius === this.context.radius &&
      segment.cachedMirrorMode === this.context.config.mirrorMode
    ) {
      return segment.cachedLength;
    }
    // 用 LUT 算长度，cachedLength 由 getSegmentLut 一并写入。
    // 单一来源避免 50 采样长度估计与 64 采样 LUT 长度漂移。
    const lut = this.getSegmentLut(segment);
    return lut[lut.length - 1].s;
  }

  getPointOnSegment(segment: SlideSegment, t: number): Point2D {
    const mirroredType = this.mirrorPathType(segment.type);
    const mirroredStartPos = this.mirrorPosition(segment.startPos);
    const mirroredEndPos = this.mirrorPosition(segment.endPos);

    // star 头部沿 [startPos button, ...bars, endPos button] 这条 polyline 走：
    // prefab bar 0/last 距 button rim 还有一小段距离，多段链转折时若直接用 chain
    // 会在按钮处瞬移。箭头（chevron）渲染仍用纯 bars chain，bar 末端不到 rim 是预期。
    const chain = this.getBarChain(segment);
    if (chain && chain.length >= 2) {
      const start = this.noteRenderer.getPositionOnRing(segment.startPos);
      const end = this.noteRenderer.getPositionOnRing(segment.endPos);
      const N = chain.length + 2;
      const idx = Math.max(0, Math.min(N - 1, t * (N - 1)));
      const intBase = Math.min(N - 2, Math.floor(idx));
      const frac = idx - intBase;
      const get = (i: number) => (i === 0 ? start : i === N - 1 ? end : chain[i - 1]);
      const p0 = get(intBase);
      const p1 = get(intBase + 1);
      return {
        x: p0.x + (p1.x - p0.x) * frac,
        y: p0.y + (p1.y - p0.y) * frac,
      };
    }

    const start = this.noteRenderer.getPositionOnRing(segment.startPos);
    const end = this.noteRenderer.getPositionOnRing(segment.endPos);

    switch (mirroredType) {
      case "-":
        return {
          x: start.x + (end.x - start.x) * t,
          y: start.y + (end.y - start.y) * t,
        };

      case ">":
      case "<":
      case "^": {
        const startAngle = this.getButtonAngle(segment.startPos);
        const endAngle = this.getButtonAngle(segment.endPos);
        let angleDiff = endAngle - startAngle;

        while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
        while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

        if (mirroredType === ">") {
          const isLeft = [1, 2, 7, 8].includes(segment.startPos);
          if (isLeft ? angleDiff <= 0 : angleDiff >= 0) {
            angleDiff += (isLeft ? 1 : -1) * 2 * Math.PI;
          }
        } else if (mirroredType === "<") {
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

      case "v":
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

      case "s": {
        // S 曲线: start → ctrl1 → ctrl2 → end
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;
        const perpX = -uy;
        const perpY = ux;
        const offset = SLIDE_CURVE_OFFSET_RATIO * this.context.radius;

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

      case "z": {
        // Z 曲线: S 的反向
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const ux = dx / len;
        const uy = dy / len;
        const perpX = -uy;
        const perpY = ux;
        const offset = SLIDE_CURVE_OFFSET_RATIO * this.context.radius;

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

      case "q":
      case "qq": {
        // 逆时针曲线
        if (mirroredType === "qq") {
          // 双曲线: entry → arc around offset circle → exit
          const interPos = (((mirroredStartPos - 1 + 4) % 8) + 1) as ButtonPosition;
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
          const circleX = entryX + -unitY * circleRadius;
          const circleY = entryY + unitX * circleRadius;

          // 圆上的起始角度
          const startAngle = Math.atan2(entryY - circleY, entryX - circleX);

          // 根据镜像后的位置差计算扫掠角度
          const posDiff = (mirroredEndPos - mirroredStartPos + 8) % 8;
          let sweepAngle: number;
          switch (posDiff) {
            case 0:
              sweepAngle = 1.25 * Math.PI;
              break;
            case 1:
              sweepAngle = 1.5 * Math.PI;
              break;
            case 2:
              sweepAngle = 1.625 * Math.PI;
              break;
            case 3:
              sweepAngle = 1.875 * Math.PI;
              break;
            case 4:
            default:
              sweepAngle = 2 * Math.PI;
              break;
            case 5:
              sweepAngle = 2.25 * Math.PI;
              break;
            case 6:
              sweepAngle = 0.75 * Math.PI;
              break;
            case 7:
              sweepAngle = 1.125 * Math.PI;
              break;
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
            return {
              x: start.x + (entryX - start.x) * subT,
              y: start.y + (entryY - start.y) * subT,
            };
          } else if (t < r1 + r2) {
            const angle = startAngle + ((t - r1) / r2) * sweepAngle;
            return {
              x: circleX + Math.cos(angle) * circleRadius,
              y: circleY + Math.sin(angle) * circleRadius,
            };
          } else {
            const subT = (t - r1 - r2) / (1 - r1 - r2);
            return { x: exitX + (end.x - exitX) * subT, y: exitY + (end.y - exitY) * subT };
          }
        } else {
          // 单曲线: 围绕中心弧
          const interPos = (((mirroredStartPos + 3 - 1) % 8) + 1) as ButtonPosition;
          const interPoint = this.noteRenderer.getPositionOnRing(this.mirrorPosition(interPos)); // 传入原始位置

          // 起点和中间点之间的中点
          const midX = (start.x + interPoint.x) / 2;
          const midY = (start.y + interPoint.y) / 2;

          const circleRadius = Math.sqrt(
            (midX - this.context.centerX) ** 2 + (midY - this.context.centerY) ** 2,
          );
          const startAngle = Math.atan2(midY - this.context.centerY, midX - this.context.centerX);

          // 根据镜像后的位置差计算扫掠角度
          const posDiff = (mirroredEndPos - mirroredStartPos + 8) % 8;
          let sweepAngle: number;
          switch (posDiff) {
            case 0:
              sweepAngle = 1.25 * Math.PI;
              break;
            case 1:
              sweepAngle = 1.5 * Math.PI;
              break;
            case 2:
              sweepAngle = 1.75 * Math.PI;
              break;
            case 3:
            default:
              sweepAngle = 2 * Math.PI;
              break;
            case 4:
              sweepAngle = 0.25 * Math.PI;
              break;
            case 5:
              sweepAngle = 0.5 * Math.PI;
              break;
            case 6:
              sweepAngle = 0.75 * Math.PI;
              break;
            case 7:
              sweepAngle = Math.PI;
              break;
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
            return {
              x: this.context.centerX + Math.cos(angle) * circleRadius,
              y: this.context.centerY + Math.sin(angle) * circleRadius,
            };
          } else {
            const subT = (t - r1 - r2) / (1 - r1 - r2);
            return { x: exitX + (end.x - exitX) * subT, y: exitY + (end.y - exitY) * subT };
          }
        }
      }

      case "p":
      case "pp": {
        // 顺时针曲线
        if (mirroredType === "pp") {
          // 双曲线: 入口 → 围绕偏移圆弧 → 退出
          const interPos = (((mirroredStartPos - 1 + 4) % 8) + 1) as ButtonPosition;
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
          const circleY = entryY + -unitX * circleRadius;

          // 圆上的起始角度
          const startAngle = Math.atan2(entryY - circleY, entryX - circleX);

          // 根据镜像后的位置差计算扫掠角度 (顺时针为负)
          const posDiff = (mirroredEndPos - mirroredStartPos + 8) % 8;
          let sweepAngle: number;
          switch (posDiff) {
            case 0:
              sweepAngle = -1.25 * Math.PI;
              break;
            case 1:
              sweepAngle = -1.125 * Math.PI;
              break;
            case 2:
              sweepAngle = -0.75 * Math.PI;
              break;
            case 3:
              sweepAngle = -2.25 * Math.PI;
              break;
            case 4:
            default:
              sweepAngle = -2 * Math.PI;
              break;
            case 5:
              sweepAngle = -1.875 * Math.PI;
              break;
            case 6:
              sweepAngle = -1.625 * Math.PI;
              break;
            case 7:
              sweepAngle = -1.5 * Math.PI;
              break;
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
            return {
              x: start.x + (entryX - start.x) * subT,
              y: start.y + (entryY - start.y) * subT,
            };
          } else if (t < r1 + r2) {
            const angle = startAngle + ((t - r1) / r2) * sweepAngle;
            return {
              x: circleX + Math.cos(angle) * circleRadius,
              y: circleY + Math.sin(angle) * circleRadius,
            };
          } else {
            const subT = (t - r1 - r2) / (1 - r1 - r2);
            return { x: exitX + (end.x - exitX) * subT, y: exitY + (end.y - exitY) * subT };
          }
        } else {
          // 单曲线: 围绕中心弧
          const interPos = (((mirroredStartPos + 5 - 1) % 8) + 1) as ButtonPosition;
          const interPoint = this.noteRenderer.getPositionOnRing(this.mirrorPosition(interPos)); // 传入原始位置

          // 起点和中间点之间的中点
          const midX = (start.x + interPoint.x) / 2;
          const midY = (start.y + interPoint.y) / 2;

          const circleRadius = Math.sqrt(
            (midX - this.context.centerX) ** 2 + (midY - this.context.centerY) ** 2,
          );
          const startAngle = Math.atan2(midY - this.context.centerY, midX - this.context.centerX);

          // 根据镜像后的位置差计算扫掠角度 (顺时针为负)
          const posDiff = (mirroredEndPos - mirroredStartPos + 8) % 8;
          let sweepAngle: number;
          switch (posDiff) {
            case 0:
              sweepAngle = -1.25 * Math.PI;
              break;
            case 1:
              sweepAngle = -Math.PI;
              break;
            case 2:
              sweepAngle = -0.75 * Math.PI;
              break;
            case 3:
              sweepAngle = -0.5 * Math.PI;
              break;
            case 4:
              sweepAngle = -0.25 * Math.PI;
              break;
            case 5:
            default:
              sweepAngle = -2 * Math.PI;
              break;
            case 6:
              sweepAngle = -1.75 * Math.PI;
              break;
            case 7:
              sweepAngle = -1.5 * Math.PI;
              break;
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
            return {
              x: this.context.centerX + Math.cos(angle) * circleRadius,
              y: this.context.centerY + Math.sin(angle) * circleRadius,
            };
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

    const luts = segments.map((seg) => this.getSegmentLut(seg));
    const lengths = luts.map((lut) => lut[lut.length - 1].s);
    const totalLength = lengths.reduce((a, b) => a + b, 0);

    if (totalLength === 0) {
      return this.noteRenderer.getPositionOnRing(segments[0].startPos);
    }

    const targetDist = progress * totalLength;
    let cumulative = 0;

    for (let i = 0; i < segments.length; i++) {
      if (cumulative + lengths[i] >= targetDist) {
        const p = this.sampleArcLut(luts[i], targetDist - cumulative);
        return { x: p.x, y: p.y };
      }
      cumulative += lengths[i];
    }

    const lastSeg = segments[segments.length - 1];
    return this.noteRenderer.getPositionOnRing(lastSeg.endPos);
  }

  private getPathTangentAngle(progress: number, segments: SlideSegment[]): number {
    if (!segments || segments.length === 0) return 0;

    const luts = segments.map((seg) => this.getSegmentLut(seg));
    const lengths = luts.map((lut) => lut[lut.length - 1].s);
    const totalLength = lengths.reduce((a, b) => a + b, 0);

    if (totalLength === 0) return 0;

    const targetDist = progress * totalLength;
    let cumulative = 0;

    for (let i = 0; i < segments.length; i++) {
      if (cumulative + lengths[i] >= targetDist) {
        return this.sampleArcLut(luts[i], targetDist - cumulative).angle;
      }
      cumulative += lengths[i];
    }

    const lastLut = luts[luts.length - 1];
    return lastLut[lastLut.length - 1].angle;
  }
}

export default SlideRenderer;
