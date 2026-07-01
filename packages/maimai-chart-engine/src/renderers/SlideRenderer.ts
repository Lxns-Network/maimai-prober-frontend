import { BaseRenderer, RenderContext } from "./BaseRenderer";
import {
  SlideNote,
  SlideSegment,
  Point2D,
  ButtonPosition,
  NoteRenderPosition,
  SlideArcLutPoint,
  isSlidePathBreak,
} from "../types";
import { NoteRenderer } from "./NoteRenderer";
import {
  SLIDE_ARROW_WIDTH_RATIO,
  SLIDE_ARROW_HEIGHT_RATIO,
  SLIDE_ARROW_SPAN_RATIO,
  SLIDE_ARROW_PADDING_RATIO,
  SLIDE_WIFI_LINE_WIDTH_RATIO,
  SLIDE_WIFI_CORNER_FRACS,
  SLIDE_STAR_SIZE_RATIO,
  SLIDE_STAR_WAITING_MIN_SCALE,
  COLORS,
  APPROACH_START_SCALE,
  NOTE_VISIBILITY_AFTER_MS,
} from "../utils/constants";
import { detectSlideShape, SLIDE_AREA_STEP_MAP } from "../utils/slideAreaSteps";
import { SLIDE_BARS } from "../utils/slideBars";

export type SlideRenderMode = "tracks" | "stars";

interface SlidePathMetrics {
  radius: number;
  mirrorMode: string;
  segmentRanges: { start: number; end: number }[];
}

export class SlideRenderer extends BaseRenderer {
  private noteRenderer: NoteRenderer;
  private pathMetricsCache = new WeakMap<SlideSegment[], SlidePathMetrics>();

  constructor(context: RenderContext, noteRenderer: NoteRenderer) {
    super(context);
    this.noteRenderer = noteRenderer;
  }

  /**
   * 把 模板 bar 列表（unit-disc）变换到当前 canvas 坐标。返回的 polyline 同时
   * 喂给箭头渲染和 getPointOnSegment（星头），保证两者跟同一条曲线。
   */
  private getBarChain(segment: SlideSegment): { x: number; y: number; angle: number }[] | null {
    const shape = detectSlideShape(segment.type, segment.startPos, segment.endPos, segment.midPos);
    if (!shape) return null;
    const bars = SLIDE_BARS[shape.shape];
    if (!bars) return null;

    // chain 仅依赖 (segment, radius, mirrorMode)，每帧不变 → 缓存到 segment（按 radius/mirror 失效）。
    const mode = this.context.config.mirrorMode;
    if (
      segment.cachedChain &&
      segment.cachedChainRadius === this.context.radius &&
      segment.cachedChainMirror === mode
    ) {
      return segment.cachedChain;
    }

    // 模板按 startPos=1 设计：非镜像时旋 (startPos-1)·π/4 把 button 1 → startPos；
    // shape.mirror 先 x→-x 把 button 1 翻到 button 8，要多旋 45° 才能转回。
    const startRotation = ((segment.startPos - (shape.mirror ? 0 : 1)) * Math.PI) / 4;
    const cosR = Math.cos(startRotation);
    const sinR = Math.sin(startRotation);
    const r = this.context.radius;
    const cx = this.context.centerX;
    const cy = this.context.centerY;
    // 用户 mirror（h 翻 x / v 翻 y / rotate180 双翻），跟 mirrorPosition 配套。
    const sx = mode === "horizontal" || mode === "rotate180" ? -1 : 1;
    const sy = mode === "vertical" || mode === "rotate180" ? -1 : 1;

    // 圆弧 bar snap 到 π/32 等距 grid + 单位半径，让 π/4 倍数旋转后重合段对齐。
    const isCircle = shape.shape.startsWith("circle");
    const CIRCLE_BAR_R = 1.0;
    const GRID_PER_PI = 32;

    // 直线：bar 投影到首尾连线去掉源数据横向漂移（保留沿线间距）。
    const isLine = shape.shape.startsWith("line");
    const lfx = shape.mirror ? -bars[0].x : bars[0].x;
    const lfy = bars[0].y;
    const lineDx = (shape.mirror ? -bars[bars.length - 1].x : bars[bars.length - 1].x) - lfx;
    const lineDy = bars[bars.length - 1].y - lfy;
    const lineLen2 = lineDx * lineDx + lineDy * lineDy || 1;

    const chain = bars.map((bar) => {
      let bx = shape.mirror ? -bar.x : bar.x;
      let by = bar.y;
      if (isCircle) {
        const angle = Math.atan2(by, bx);
        const snapped = Math.round((angle * GRID_PER_PI) / Math.PI) * (Math.PI / GRID_PER_PI);
        bx = Math.cos(snapped) * CIRCLE_BAR_R;
        by = Math.sin(snapped) * CIRCLE_BAR_R;
      } else if (isLine) {
        const t = ((bx - lfx) * lineDx + (by - lfy) * lineDy) / lineLen2;
        bx = lfx + t * lineDx;
        by = lfy + t * lineDy;
      }
      // bar 烘焙旋转：模板 mirror（x→-x ⇒ π-θ）后旋 startRotation，再跟随 user mirror。
      const baked = (shape.mirror ? Math.PI - bar.r : bar.r) + startRotation;
      return {
        x: cx + sx * r * (bx * cosR - by * sinR),
        y: cy + sy * r * (bx * sinR + by * cosR),
        angle: Math.atan2(sy * Math.sin(baked), sx * Math.cos(baked)),
      };
    });

    const isCup =
      segment.type === "p" ||
      segment.type === "q" ||
      segment.type === "pp" ||
      segment.type === "qq";
    const isCircleShape = shape.shape.startsWith("circle"); // ^ / < / >
    // cup/circle 的箭头角按链坐标重算（角平分平滑）；其余形状用上面的 baked r。
    if ((isCup || isCircleShape) && chain.length >= 2) {
      this.applyGameArrowAngles(chain);
    }

    segment.cachedChain = chain;
    segment.cachedChainRadius = r;
    segment.cachedChainMirror = mode;
    return chain;
  }

  private angleDelta(a: number, b: number): number {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  private lerpAngle(a: number, b: number, t: number): number {
    return a + this.angleDelta(a, b) * t;
  }

  private applyGameArrowAngles(chain: { x: number; y: number; angle: number }[]): void {
    const n = chain.length;
    const seg = new Array<number>(n);
    for (let i = 0; i < n - 1; i++) {
      seg[i] = Math.atan2(chain[i + 1].y - chain[i].y, chain[i + 1].x - chain[i].x);
    }
    seg[n - 1] = seg[n - 2];
    chain[0].angle = seg[0];
    for (let l = 1; l < n - 1; l++) {
      chain[l].angle = this.lerpAngle(chain[l - 1].angle, seg[l], 0.5);
    }
    chain[n - 1].angle = seg[n - 1];
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
    hasSimultaneousSlide: boolean,
  ): void {
    if (note.isSplitSlide && note.allSlideSegments) {
      const paths = note.allSlideSegments;
      // wifi 路径（扇形大）先画垫底，再画其它路径，避免盖住同条滑条其它分段的箭头和星星。
      for (let i = 0; i < paths.length; i++) {
        const segs = paths[i];
        if (segs && segs.length > 0 && segs[0].type === "w") {
          this.renderSlidePath(
            note,
            currentBeat,
            currentTimeMs,
            segs,
            i,
            mode,
            hasSimultaneousSlide,
          );
        }
      }
      for (let i = 0; i < paths.length; i++) {
        const segs = paths[i];
        if (segs && segs.length > 0 && segs[0].type !== "w") {
          this.renderSlidePath(
            note,
            currentBeat,
            currentTimeMs,
            segs,
            i,
            mode,
            hasSimultaneousSlide,
          );
        }
      }
    } else if (note.slideSegments && note.slideSegments.length > 0) {
      this.renderSlidePath(
        note,
        currentBeat,
        currentTimeMs,
        note.slideSegments,
        0,
        mode,
        hasSimultaneousSlide,
      );
    }
  }

  private renderSlidePath(
    note: SlideNote,
    _currentBeat: number,
    currentTimeMs: number,
    segments: SlideSegment[],
    pathIndex: number = 0,
    mode: SlideRenderMode = "tracks",
    hasSimultaneousSlide: boolean,
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

      const isSimultaneous = hasSimultaneousSlide || (note.isSplitSlide ?? false);

      if (mode === "tracks") {
        const isBreak = isSlidePathBreak(note, pathIndex);
        const metrics = this.getSlidePathMetrics(segments);
        if (!metrics) return;

        // 反序绘制：先拼接的段（i 小）后画 = 在上层。拼接拐点处前段（含补的 junction 箭头）
        // 盖住后段起点，符合"先拼接的星星在上层"。
        for (let i = segments.length - 1; i >= 0; i--) {
          const segment = segments[i];
          const range = metrics.segmentRanges[i];

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
            i < segments.length - 1, // 非末段：末端是拼接拐点，需补 junction 箭头
          );
        }
      } else {
        if (currentTimeMs >= note.timingMs) {
          this.renderSlideStar(note, progress, segments, pathIndex, currentTimeMs, isSimultaneous);
        }
      }
    });
  }

  private getSlidePathMetrics(segments: SlideSegment[]): SlidePathMetrics | null {
    const radius = this.context.radius;
    const mirrorMode = this.context.config.mirrorMode;
    const cached = this.pathMetricsCache.get(segments);
    if (cached && cached.radius === radius && cached.mirrorMode === mirrorMode) {
      return cached;
    }

    const segmentLengths = new Array<number>(segments.length);
    let totalLength = 0;
    for (let i = 0; i < segments.length; i++) {
      const length = this.getSegmentLength(segments[i]);
      segmentLengths[i] = length;
      totalLength += length;
    }
    if (totalLength <= 0) return null;

    const segmentRanges = new Array<{ start: number; end: number }>(segments.length);
    let cumulative = 0;
    for (let i = 0; i < segments.length; i++) {
      const start = cumulative / totalLength;
      cumulative += segmentLengths[i];
      segmentRanges[i] = { start, end: cumulative / totalLength };
    }

    const metrics = {
      radius,
      mirrorMode,
      segmentRanges,
    };
    this.pathMetricsCache.set(segments, metrics);
    return metrics;
  }

  private renderSlideSegment(
    segment: SlideSegment,
    isBreak: boolean,
    progress: number = 0,
    isSimultaneous: boolean = false,
    normalBreakColor: boolean = false,
    isJunctionEnd: boolean = false,
  ): boolean {
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

      // 其他形状：模板 bar 位置 + drawSlideArrowsBatch（均匀箭头）。无 chain（非法/退化段）不画箭头。
      const bars = this.getVisibleBarsForSegment(segment, progress, isJunctionEnd);
      if (bars && bars.length > 0) {
        this.drawSlideArrowsBatch(bars);
      }
    });

    return true;
  }

  /**
   * Wifi 渲染：N 个对称 chevron，corner 朝 endPos、两臂朝 startPos 方向张开。
   */
  private renderWifiBars(segment: SlideSegment, progress: number): void {
    const steps = SLIDE_AREA_STEP_MAP["wifi"];
    const N = steps[steps.length - 1]; // 箭头总数 = 11

    let hiddenCount = 0;
    if (progress > 0 && steps.length >= 2) {
      const i = Math.min(steps.length - 1, Math.floor(progress * (steps.length - 1)));
      hiddenCount = steps[i] + 1;
    }

    const pivot = this.noteRenderer.getPositionOnRing(segment.startPos);
    const endPivot = this.noteRenderer.getPositionOnRing(segment.endPos);
    const axisLen = Math.hypot(endPivot.x - pivot.x, endPivot.y - pivot.y);
    if (axisLen === 0) return;
    const axisUx = (endPivot.x - pivot.x) / axisLen;
    const axisUy = (endPivot.y - pivot.y) / axisLen;
    const fanAngle = Math.atan2(axisUy, axisUx);

    const ARM_HALF_ANGLE = (67.4 * Math.PI) / 180;
    const cosA = Math.cos(ARM_HALF_ANGLE);
    const sinA = Math.sin(ARM_HALF_ANGLE);

    const dFirst = 0.075 * axisLen;
    const dLast = 0.975 * axisLen;
    const startExtra = this.scaleByRadius(0.075);

    const chevrons: {
      x: number;
      y: number;
      arm1Dx: number;
      arm1Dy: number;
      arm2Dx: number;
      arm2Dy: number;
      width: number;
    }[] = [];
    for (let i = N - 1; i >= hiddenCount; i--) {
      const t = i / (N - 1);
      const d = dFirst + (dLast - dFirst) * SLIDE_WIFI_CORNER_FRACS[i];
      const armLen = cosA * d + startExtra * (1 - t);
      const width = this.scaleByRadius(SLIDE_WIFI_LINE_WIDTH_RATIO * (0.7 + 0.3 * t));
      chevrons.push({
        x: pivot.x + axisUx * d,
        y: pivot.y + axisUy * d,
        arm1Dx: -armLen * cosA,
        arm1Dy: +armLen * sinA,
        arm2Dx: -armLen * cosA,
        arm2Dy: -armLen * sinA,
        width,
      });
    }
    if (chevrons.length === 0) return;
    this.drawWifiChevronsBatch(chevrons, fanAngle);
  }

  private getVisibleBarsForSegment(
    segment: SlideSegment,
    progress: number,
    isJunctionEnd: boolean = false,
  ): { x: number; y: number; angle: number }[] | null {
    if (segment.type === "w") return null;
    const chain = this.getBarChain(segment);
    if (!chain) return null;
    const shape = detectSlideShape(segment.type, segment.startPos, segment.endPos, segment.midPos)!;

    // chunky 隐藏：areaStep[i] = 累积隐藏数量，floor 对齐分段时序。
    const steps = SLIDE_AREA_STEP_MAP[shape.shape];
    const hiddenCount =
      steps && steps.length >= 2
        ? steps[Math.min(steps.length - 1, Math.floor(progress * (steps.length - 1)))]
        : 0;

    const usePrecomputedAngle = segment.type !== "-";
    const result: { x: number; y: number; angle: number }[] = [];
    const last = chain.length - 1;

    // 拼接拐点：非末段在 junction 处沿末端方向外推一格补一个箭头——standalone 末端内缩是为收尾
    // 留白，但拼接滑条继续穿过拐点，否则两段双重内缩在拐点留下大缺口。放数组首位 = 最底层
    // （离 star 最远）；段完成后不补。
    if (isJunctionEnd && chain.length >= 2 && hiddenCount < chain.length) {
      const a = chain[last];
      const b = chain[last - 1];
      const jx = 2 * a.x - b.x;
      const jy = 2 * a.y - b.y;
      // 越界守卫：外推点越过 button ring（到圆心距离 > radius）就不补——末端已贴近 button 的
      // 形状（如 line4）外推会跑到拐点外。radius 镜像不变，对任意 mirror mode 都成立。
      if (this.distanceToCenter(jx, jy) <= this.context.radius) {
        const angle = usePrecomputedAngle ? a.angle : Math.atan2(a.y - b.y, a.x - b.x);
        result.push({ x: jx, y: jy, angle });
      }
    }

    for (let i = last; i >= hiddenCount; i--) {
      let angle: number;
      if (usePrecomputedAngle) {
        angle = chain[i].angle;
      } else {
        const lo = Math.max(0, i - 1);
        const hi = Math.min(last, i + 1);
        angle = Math.atan2(chain[hi].y - chain[lo].y, chain[hi].x - chain[lo].x);
      }
      result.push({ x: chain[i].x, y: chain[i].y, angle });
    }
    return result;
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

  private getBisectorPoint(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    width: number,
  ): { bx: number; by: number } | null {
    const rLen = Math.hypot(x1 - x2, y1 - y2);
    const lLen = Math.hypot(x3 - x2, y3 - y2);
    if (rLen === 0 || lLen === 0) return null;
    const cosAngle = Math.max(
      -1,
      Math.min(1, ((x1 - x2) * (x3 - x2) + (y1 - y2) * (y3 - y2)) / (rLen * lLen)),
    );
    const sinHalf = Math.sqrt((1 - cosAngle) / 2);
    if (sinHalf <= 0.001) return null;

    const midX = (x1 + x3) / 2;
    const midY = (y1 + y3) / 2;
    const bLen = Math.hypot(midX - x2, midY - y2);
    const bux = (midX - x2) / bLen;
    const buy = (midY - y2) / bLen;
    const edgeLen = width / sinHalf;
    return { bx: x2 + bux * edgeLen, by: y2 + buy * edgeLen };
  }

  private drawSlideArrowsBatch(arrows: { x: number; y: number; angle: number }[]): void {
    if (arrows.length === 0) return;
    const ctx = this.context.ctx;
    const arrowHeight = this.scaleByRadius(SLIDE_ARROW_HEIGHT_RATIO);
    const arrowWidth = this.scaleByRadius(SLIDE_ARROW_SPAN_RATIO);
    const lineWidth = this.scaleByRadius(SLIDE_ARROW_WIDTH_RATIO);
    const pad = this.scaleByRadius(SLIDE_ARROW_PADDING_RATIO);
    const outlineWidth = this.getNoteStrokeWidth();
    const mainStroke = ctx.strokeStyle;
    const isBreak =
      typeof mainStroke === "string" &&
      mainStroke.toLowerCase() === COLORS.BREAK_ORANGE.toLowerCase();
    const leftColor = isBreak ? COLORS.SLIDE_SIMULTANEOUS : mainStroke;
    const rightColor = isBreak ? COLORS.SLIDE_ARROW_RIGHT : mainStroke;

    ctx.save();
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";

    // 阴影沿箭头反方向（轨迹后方）偏移；逐箭头先投影后本体，自交叉处后画的会压住先画的。
    const shadowOffset = this.scaleByRadius(5 / 300);

    for (const arrow of arrows) {
      const cos = Math.cos(arrow.angle);
      const sin = Math.sin(arrow.angle);
      // 沿走向前移 pad，使首颗不贴起始判定点
      const ax = arrow.x + cos * pad;
      const ay = arrow.y + sin * pad;

      const x1 = ax + cos * (-arrowWidth / 2) - sin * (-arrowHeight / 2);
      const y1 = ay + sin * (-arrowWidth / 2) + cos * (-arrowHeight / 2);
      const x2 = ax + cos * (arrowWidth / 2);
      const y2 = ay + sin * (arrowWidth / 2);
      const x3 = ax + cos * (-arrowWidth / 2) - sin * (arrowHeight / 2);
      const y3 = ay + sin * (-arrowWidth / 2) + cos * (arrowHeight / 2);

      const bp = this.getBisectorPoint(x1, y1, x2, y2, x3, y3, lineWidth);
      if (!bp) continue;
      const { bx, by } = bp;
      const bx3 = bx + x3 - x2;
      const by3 = by + y3 - y2;
      const bx1 = bx + x1 - x2;
      const by1 = by + y1 - y2;

      const arrowPath = new Path2D();
      arrowPath.moveTo(x2, y2);
      arrowPath.lineTo(x3, y3);
      arrowPath.lineTo(bx3, by3);
      arrowPath.lineTo(bx, by);
      arrowPath.lineTo(bx1, by1);
      arrowPath.lineTo(x1, y1);
      arrowPath.closePath();

      ctx.save();
      ctx.translate(-cos * shadowOffset, -sin * shadowOffset);
      ctx.globalAlpha = ctx.globalAlpha * 0.4;
      ctx.fillStyle = COLORS.BLACK;
      ctx.fill(arrowPath);
      ctx.restore();

      ctx.fillStyle = rightColor;
      ctx.fill(arrowPath);

      // break 时左半覆盖左色：两层不透明色叠加，抗锯齿接缝不可见
      if (isBreak) {
        const leftPath = new Path2D();
        leftPath.moveTo(x2, y2);
        leftPath.lineTo(bx, by);
        leftPath.lineTo(bx3, by3);
        leftPath.lineTo(x3, y3);
        leftPath.closePath();
        ctx.fillStyle = leftColor;
        ctx.fill(leftPath);
      }

      ctx.lineWidth = outlineWidth;
      ctx.strokeStyle = COLORS.BLACK;
      ctx.stroke(arrowPath);
    }

    ctx.restore();
  }

  /**
   * 画 chevron：单个六边形一笔填充，外三角正向 + 内三角反向构成 V 形环面，避免圆头线段感。
   * arm1/arm2 是 arm tip 相对 corner 的偏移，在调用方按 fanAngle 旋转。
   */
  private drawWifiChevronsBatch(
    chevrons: {
      x: number;
      y: number;
      arm1Dx: number;
      arm1Dy: number;
      arm2Dx: number;
      arm2Dy: number;
      width: number;
    }[],
    fanAngle: number,
  ): void {
    if (chevrons.length === 0) return;
    const ctx = this.context.ctx;
    const shadowOffset = this.scaleByRadius(5 / 300);
    const mainStroke = ctx.strokeStyle;
    const cos = Math.cos(fanAngle);
    const sin = Math.sin(fanAngle);

    const buildChevronPath = (
      cornerX: number,
      cornerY: number,
      arm1X: number,
      arm1Y: number,
      arm2X: number,
      arm2Y: number,
      width: number,
    ): Path2D | null => {
      const arm1Dx = arm1X - cornerX;
      const arm1Dy = arm1Y - cornerY;
      const arm2Dx = arm2X - cornerX;
      const arm2Dy = arm2Y - cornerY;
      const arm1Len = Math.hypot(arm1Dx, arm1Dy);
      const arm2Len = Math.hypot(arm2Dx, arm2Dy);
      if (arm1Len === 0 || arm2Len === 0) return null;

      const cosAngle = Math.max(
        -1,
        Math.min(1, (arm1Dx * arm2Dx + arm1Dy * arm2Dy) / (arm1Len * arm2Len)),
      );
      const sinHalf = Math.sqrt((1 - cosAngle) / 2);
      if (sinHalf <= 0.001) return null;

      const armAxisProjection = -((arm1Dx * cos + arm1Dy * sin) / arm1Len);
      if (armAxisProjection <= 0) return null;

      const outerDistance = arm1Len / armAxisProjection;
      const innerDistance = Math.max(0, outerDistance - width / sinHalf);
      const innerScale = innerDistance / outerDistance;
      const pivotX = cornerX - cos * outerDistance;
      const pivotY = cornerY - sin * outerDistance;
      const innerCornerX = pivotX + (cornerX - pivotX) * innerScale;
      const innerCornerY = pivotY + (cornerY - pivotY) * innerScale;
      const innerArm1X = pivotX + (arm1X - pivotX) * innerScale;
      const innerArm1Y = pivotY + (arm1Y - pivotY) * innerScale;
      const innerArm2X = pivotX + (arm2X - pivotX) * innerScale;
      const innerArm2Y = pivotY + (arm2Y - pivotY) * innerScale;

      const path = new Path2D();
      path.moveTo(arm1X, arm1Y);
      path.lineTo(cornerX, cornerY);
      path.lineTo(arm2X, arm2Y);
      path.lineTo(innerArm2X, innerArm2Y);
      path.lineTo(innerCornerX, innerCornerY);
      path.lineTo(innerArm1X, innerArm1Y);
      path.closePath();

      return path;
    };

    ctx.save();
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.globalAlpha = ctx.globalAlpha * 0.5;

    // 整片扇形拼成一个 Path2D，投影（整体偏移）和本体各填充一次。
    const fanPath = new Path2D();
    for (const c of chevrons) {
      const a1x = c.x + cos * c.arm1Dx - sin * c.arm1Dy;
      const a1y = c.y + sin * c.arm1Dx + cos * c.arm1Dy;
      const a2x = c.x + cos * c.arm2Dx - sin * c.arm2Dy;
      const a2y = c.y + sin * c.arm2Dx + cos * c.arm2Dy;
      const shape = buildChevronPath(c.x, c.y, a1x, a1y, a2x, a2y, c.width);
      if (shape) fanPath.addPath(shape);
    }

    // 投影：整体向后偏移
    ctx.save();
    ctx.translate(-cos * shadowOffset, -sin * shadowOffset);
    ctx.globalAlpha = ctx.globalAlpha * 0.4;
    ctx.fillStyle = COLORS.BLACK;
    ctx.fill(fanPath);
    ctx.restore();

    // 本体
    ctx.fillStyle = mainStroke;
    ctx.fill(fanPath);

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
    let starAlpha = 1;
    let starScale = 1;
    let rotation = 0;
    const isSliding = currentTimeMs >= slideStart;

    if (!isSliding) {
      if (note.headlessMode === "pop") return;

      starPos = this.noteRenderer.getPositionOnRing(segments[0].startPos);
      const elapsed = currentTimeMs - note.timingMs;
      const waitingProgress = Math.min(1, elapsed / delayMs);
      starAlpha = waitingProgress;
      starScale =
        SLIDE_STAR_WAITING_MIN_SCALE + (1 - SLIDE_STAR_WAITING_MIN_SCALE) * waitingProgress;

      if (this.context.config.slideRotation) {
        rotation = this.getPathTangentAngle(0, segments) + Math.PI / 2;
      }
    } else {
      starPos = this.getPointAlongPath(progress, segments);
      starAlpha = 1;
      starScale = 1;

      if (this.context.config.slideRotation) {
        rotation = this.getPathTangentAngle(progress, segments) + Math.PI / 2;
      }
    }

    if (!starPos) return;

    this.withContext(() => {
      this.context.ctx.globalAlpha = starAlpha;
      const size = this.context.radius * SLIDE_STAR_SIZE_RATIO * starScale;

      let color: string;
      const isBreak =
        isSlidePathBreak(note, pathIndex) && !this.context.config.normalColorBreakSlide;

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
        let starAlpha = 1;
        let starScale = 1;

        if (currentTimeMs < slideStart) {
          if (note.headlessMode === "pop") continue;

          starPos = start;
          const elapsed = currentTimeMs - note.timingMs;
          const waitingProgress = Math.min(1, elapsed / delayMs);
          starAlpha = waitingProgress;
          starScale =
            SLIDE_STAR_WAITING_MIN_SCALE + (1 - SLIDE_STAR_WAITING_MIN_SCALE) * waitingProgress;
        } else {
          starPos = {
            x: start.x + (end.x - start.x) * progress,
            y: start.y + (end.y - start.y) * progress,
          };
        }

        if (starPos) {
          this.context.ctx.globalAlpha = starAlpha;
          const size = this.context.radius * SLIDE_STAR_SIZE_RATIO * starScale;
          const isBreak =
            isSlidePathBreak(note, pathIndex) && !this.context.config.normalColorBreakSlide;

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
        this.stroke(COLORS.BLACK, strokeW * 3);
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
      this.stroke(COLORS.BLACK, strokeW * 3);

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
      this.stroke(COLORS.WHITE);

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
      this.stroke(COLORS.WHITE);

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

  calculateStarRotation(note: SlideNote, currentTimeMs: number): number {
    const durationMs = note.allDurationMs ? note.allDurationMs[0] : note.durationMs;
    const segments = note.allSlideSegments ? note.allSlideSegments[0] : note.slideSegments;

    if (!segments || segments.length === 0 || !durationMs || durationMs === 0) return 0;

    let totalLengthPixels = 0;
    for (const seg of segments) {
      totalLengthPixels += this.getSegmentLength(seg);
    }

    // 归一到按钮环半径 480 的标度。
    const gameRingRadius = 480;
    const normalizedLength = totalLengthPixels * (gameRingRadius / this.context.radius);

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
    // 长度取自 LUT（cachedLength 由 getSegmentLut 一并写入，单一来源避免漂移）。
    const lut = this.getSegmentLut(segment);
    return lut[lut.length - 1].s;
  }

  getPointOnSegment(segment: SlideSegment, t: number): Point2D {
    // 星头路径补上首尾 button（bar 端点不到 rim，否则多段拼接在按钮处瞬移）；箭头仍用纯 bars。
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

    // 无 chain 段只可能是退化/非法输入（相邻直线、对位 v、非对位 thunder）——取起终直线兜底
    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
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

    // 星头朝向：沿 [起按钮, …bars, 终按钮] 折线按弧长 LerpAngle 相邻锚点箭头角（与位置同参数化）。
    let total = 0;
    const zs: number[] = [];
    const angles: number[] = [];
    for (const seg of segments) {
      const chain = this.getBarChain(seg);
      if (!chain || chain.length === 0) continue;
      const start = this.noteRenderer.getPositionOnRing(seg.startPos);
      const end = this.noteRenderer.getPositionOnRing(seg.endPos);
      const last = chain.length - 1;
      const poly: { x: number; y: number; angle: number }[] = [
        { x: start.x, y: start.y, angle: chain[0].angle },
        ...chain,
        { x: end.x, y: end.y, angle: chain[last].angle },
      ];
      let prev: { x: number; y: number } | null = null;
      for (const p of poly) {
        if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y);
        zs.push(total);
        angles.push(p.angle);
        prev = p;
      }
    }
    if (angles.length === 0) return 0;
    if (angles.length === 1) return angles[0];

    const target = Math.max(0, Math.min(1, progress)) * total;
    for (let i = 0; i < zs.length - 1; i++) {
      if (zs[i] <= target && target <= zs[i + 1]) {
        const span = zs[i + 1] - zs[i];
        return this.lerpAngle(angles[i], angles[i + 1], span > 0 ? (target - zs[i]) / span : 0);
      }
    }
    return angles[angles.length - 1];
  }
}

export default SlideRenderer;
