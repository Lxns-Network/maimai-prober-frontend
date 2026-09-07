import { BaseRenderer, RenderContext } from "./BaseRenderer";
import {
  SlideNote,
  SlideSegment,
  Point2D,
  ButtonPosition,
  NoteRenderPosition,
  SlideArcLutPoint,
} from "../types";
import { NoteRenderer, INVISIBLE_NOTE_POSITION } from "./NoteRenderer";
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
import { getSlideTrackAppearance } from "../core/timing/slideAppearance";

export type SlideRenderMode = "tracks" | "stars";

interface SlidePathMetrics {
  radius: number;
  mirrorMode: string;
  segmentRanges: { start: number; end: number }[];
}

/**
 * 箭头的几何 Path2D 路径集合。
 * 绘制时需按阴影、本体、描边分层绘制，使后绘制箭头的本体覆盖前一箭头的描边。
 */
interface ArrowPaths {
  main: Path2D;
  /** 阴影几何路径（位移偏移已烘焙进顶点坐标） */
  shadow: Path2D;
  /** Break 音符双色效果所需的左半部分遮罩路径 */
  leftHalf: Path2D;
}
type ArrowPathSet = ArrowPaths[];

/** 每帧向双缓冲暂存画布最多绘制的轨迹条数，用于分摊单帧重建开销。 */
const TRACKS_PER_BUILD_STEP = 12;
/** 同一离屏层的最小重建间隔（谱面毫秒），为淡入期的连续变化兜底。 */
const TRACK_LAYER_REBUILD_INTERVAL_MS = 33;
/** 淡入期透明度逐帧连续变化，按此粒度离散分桶，以平衡渐入平滑度与离屏缓存重建开销。 */
const TRACK_FADE_BUCKET_MS = 25;
/** 相邻帧谱面时间前进超过此值即视为跳转，丢弃旧轨迹层以避免显示旧位置的轨迹。 */
const TRACK_TIME_JUMP_MS = 200;

interface StableTrackEntry {
  note: SlideNote;
  index: number;
  isSimultaneous: boolean;
}

interface TrackBuildJob {
  signature: string;
  entries: StableTrackEntry[];
  currentBeat: number;
  currentTimeMs: number;
  nextIndex: number;
  staging: HTMLCanvasElement;
}

/**
 * 滑条渲染器。
 * 负责滑条引导轨迹（包含直线、圆弧、Wi-Fi 扇形等）及滑动星头的计算与渲染，
 * 并通过双缓冲离屏图层复用稳定状态下的轨迹渲染结果。
 */
export class SlideRenderer extends BaseRenderer {
  private noteRenderer: NoteRenderer;
  private pathMetricsCache = new WeakMap<SlideSegment[], SlidePathMetrics>();
  private uniquePathIndexesCache = new WeakMap<SlideNote, number[]>();
  /** 箭头 Path2D 几何缓存（以画布半径与镜像模式为失效基准）。 */
  private arrowPathsCache = new WeakMap<
    SlideSegment,
    { basis: string; byKey: Map<string, ArrowPathSet> }
  >();
  /** 稳定状态轨迹的离屏前台画布（内容签名未变化时直接复用合成）。 */
  private trackLayer: HTMLCanvasElement | null = null;
  private trackLayerCtx: CanvasRenderingContext2D | null = null;
  private trackLayerSignature = "";
  private trackLayerBuiltAtMs = -Infinity;
  /** 上一次合成轨迹层的谱面时刻，用于识别 seek 跳变并作废缓存层。 */
  private lastTrackRenderTimeMs: number | null = null;
  /** 轨迹分帧构建使用的离屏暂存画布。 */
  private trackStaging: HTMLCanvasElement | null = null;
  private trackStagingCtx: CanvasRenderingContext2D | null = null;
  private trackBuildJob: TrackBuildJob | null = null;
  private visibleTrackEntries: StableTrackEntry[] = [];

  /**
   * 获取需要实际绘制的滑条路径索引列表。
   * 过滤分段几何与时序参数完全重叠的重复路径，同参路径仅保留首条以避免重复绘制。
   *
   * @param note 滑条音符数据。
   * @returns 去重后的路径索引列表。
   */
  private getRenderPathIndexes(note: SlideNote): number[] {
    const cached = this.uniquePathIndexesCache.get(note);
    if (cached) return cached;
    const paths = note.allSlideSegments!;
    const seen = new Set<string>();
    const result: number[] = [];
    for (let i = 0; i < paths.length; i++) {
      const segs = paths[i];
      if (!segs || segs.length === 0) continue;
      const key = [
        segs.map((s) => `${s.type}:${s.startPos}:${s.endPos}:${s.midPos ?? ""}`).join("+"),
        note.allDelayMs?.[i] ?? "",
        note.allDurationMs?.[i] ?? "",
        note.allSlideBreaks?.[i] ? 1 : 0,
      ].join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(i);
    }
    this.uniquePathIndexesCache.set(note, result);
    return result;
  }

  /**
   * 创建滑条渲染器实例。
   *
   * @param context 渲染上下文。
   * @param noteRenderer 音符渲染器，用于获取判定环坐标等。
   */
  constructor(context: RenderContext, noteRenderer: NoteRenderer) {
    super(context);
    this.noteRenderer = noteRenderer;
  }

  /**
   * 将单位圆盘坐标系下的模板引导点序列变换至当前画布坐标系。
   * 生成的点序列同时用于引导箭头排布与星头轨迹采样，确保两者严格沿同一曲线运动。
   *
   * @param segment 滑条段配置。
   * @returns 变换后的引导点序列（包含坐标与切向角），若形状未定义则返回 null。
   */
  private getBarChain(segment: SlideSegment): { x: number; y: number; angle: number }[] | null {
    const shape = detectSlideShape(segment.type, segment.startPos, segment.endPos, segment.midPos);
    if (!shape) return null;
    const bars = SLIDE_BARS[shape.shape];
    if (!bars) return null;

    const mode = this.context.config.mirrorMode;
    if (
      segment.cachedChain &&
      segment.cachedChainRadius === this.context.radius &&
      segment.cachedChainMirror === mode
    ) {
      return segment.cachedChain;
    }

    // 几何模板基准按按键 1 定义：非镜像时旋转 (startPos - 1) * π/4 对齐至起始按键；镜像时由于水平翻转使基准点对应至按键 8，需少偏移 45° 以校准角度。
    const startRotation = ((segment.startPos - (shape.mirror ? 0 : 1)) * Math.PI) / 4;
    const cosR = Math.cos(startRotation);
    const sinR = Math.sin(startRotation);
    const r = this.context.radius;
    const cx = this.context.centerX;
    const cy = this.context.centerY;
    const sx = mode === "horizontal" || mode === "rotate180" ? -1 : 1;
    const sy = mode === "vertical" || mode === "rotate180" ? -1 : 1;

    // 圆弧引导点吸附至 π/32 等间距网格与单位半径，消除浮点误差以确保旋转重合段完全贴合。
    const isCircle = shape.shape.startsWith("circle");
    const CIRCLE_BAR_R = 1.0;
    const GRID_PER_PI = 32;

    // 将直线引导点投影至首尾连线以消除横向偏离，同时保留沿走向的间距分布。
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
      // 水平镜像时切向角变换为 π - θ，叠加起始旋转角后再随视口镜像计算最终角度。
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
    const isCircleShape = shape.shape.startsWith("circle");
    // 对杯形与圆弧等大曲率折线重新根据折点角平分线平滑切向角，避免直接使用模板角度产生视觉折角。
    if ((isCup || isCircleShape) && chain.length >= 2) {
      this.applyGameArrowAngles(chain);
    }

    segment.cachedChain = chain;
    segment.cachedChainRadius = r;
    segment.cachedChainMirror = mode;
    return chain;
  }

  /**
   * 计算两个弧度角之间的最短有向角差（取值区间 (-π, π]）。
   *
   * @param a 起始角（弧度）。
   * @param b 目标角（弧度）。
   * @returns 有向夹角差值（弧度）。
   */
  private angleDelta(a: number, b: number): number {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /**
   * 沿最短圆周路径在两个角度之间进行线性插值。
   *
   * @param a 起始角（弧度）。
   * @param b 目标角（弧度）。
   * @param t 插值系数 [0, 1]。
   * @returns 插值后的角度（弧度）。
   */
  private lerpAngle(a: number, b: number, t: number): number {
    return a + this.angleDelta(a, b) * t;
  }

  /**
   * 平滑曲线上各引导点的切向角。
   * 首尾点采用相邻线段方向，中间节点采用相邻线段方向与前一节点方向的角平分插值。
   *
   * @param chain 待平滑的引导点序列（直接原地修改内部 angle 属性）。
   */
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

  /**
   * 计算滑条起始判定点在指定时间戳的渲染位置与缩放比例。
   *
   * 超出可见时间范围时返回不可见位置；登场前半段保持在判定线位置淡入，后半段按接近速度向按键方位展开。
   *
   * @param note 滑条音符数据。
   * @param _currentBeat 当前节拍（保留参数）。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @returns 渲染位置与可见性状态。
   */
  calculateSlideStartPosition(
    note: SlideNote,
    _currentBeat: number,
    currentTimeMs: number,
  ): NoteRenderPosition {
    const angle = this.getButtonAngle(note.position);
    const timeDiff = note.timingMs - currentTimeMs;
    const approachTime = this.getNoteApproachTimeMs(note);

    if (timeDiff > approachTime || timeDiff < -NOTE_VISIBILITY_AFTER_MS) {
      return INVISIBLE_NOTE_POSITION;
    }

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

  /**
   * 渲染单个滑条音符（引导轨迹或滑动星头）。
   *
   * 对于多分支滑条，先绘制覆盖面积较大的 Wi-Fi 扇形分支置于底层，再绘制常规分支，避免遮挡其他分段。
   *
   * @param note 滑条音符数据。
   * @param currentBeat 当前节拍。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @param mode 渲染模式（"tracks" 渲染引导轨迹，"stars" 渲染滑动星头）。
   * @param hasSimultaneousSlide 是否存在同押滑条。
   */
  renderSlide(
    note: SlideNote,
    currentBeat: number,
    currentTimeMs: number,
    mode: SlideRenderMode = "tracks",
    hasSimultaneousSlide: boolean,
  ): void {
    if (note.isSplitSlide && note.allSlideSegments) {
      const paths = note.allSlideSegments;
      const pathIndexes = this.getRenderPathIndexes(note);
      for (const i of pathIndexes) {
        const segs = paths[i];
        if (segs[0].type === "w") {
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
      for (const i of pathIndexes) {
        const segs = paths[i];
        if (segs[0].type !== "w") {
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

  /**
   * 渲染单条滑条路径（单段或多段拼接）。
   *
   * 在可见时间窗口内计算渐入透明度及滑动进度。绘制轨迹时按分段逆序绘制，
   * 确保靠前分段及其衔接箭头覆盖在后段之上。
   *
   * @param note 滑条音符数据。
   * @param _currentBeat 当前节拍（保留参数）。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @param segments 构成该路径的滑条分段列表。
   * @param pathIndex 该路径在音符所有路径中的索引。
   * @param mode 渲染模式（"tracks" 或 "stars"）。
   * @param hasSimultaneousSlide 是否为同押滑条。
   */
  private renderSlidePath(
    note: SlideNote,
    _currentBeat: number,
    currentTimeMs: number,
    segments: SlideSegment[],
    pathIndex: number = 0,
    mode: SlideRenderMode = "tracks",
    hasSimultaneousSlide: boolean,
  ): void {
    const durationMs = note.allDurationMs ? note.allDurationMs[pathIndex] : note.durationMs;
    const delayMs = note.allDelayMs
      ? note.allDelayMs[pathIndex]
      : (note.delayMs ?? 60000 / note.bpm);
    const slideStart = note.timingMs + delayMs;

    if (currentTimeMs > slideStart + durationMs) {
      return;
    }

    let progress = 0;
    if (currentTimeMs >= slideStart) {
      progress = durationMs > 0 ? Math.min(1, (currentTimeMs - slideStart) / durationMs) : 1;
    }

    const isSimultaneous = hasSimultaneousSlide || (note.isSplitSlide ?? false);
    if (mode === "stars") {
      if (currentTimeMs >= note.timingMs) {
        this.renderSlideStar(note, progress, segments, pathIndex, currentTimeMs, isSimultaneous);
      }
      return;
    }

    const ordinary = this.getTrackAppearance(note, currentTimeMs, false);
    const wifi = this.getTrackAppearance(note, currentTimeMs, true);
    if (ordinary.alpha === 0 && wifi.alpha === 0) return;

    const isBreak = note.allSlideBreaks?.[pathIndex] ?? false;
    const metrics = this.getSlidePathMetrics(segments);
    if (!metrics) return;

    this.withContext(() => {
      // 逆序绘制以确保靠前的分段置于顶层，使接合拐点处前段的衔接箭头能自然覆盖后段起点。
      for (let i = segments.length - 1; i >= 0; i--) {
        const segment = segments[i];
        const alpha = segment.type === "w" ? wifi.alpha : ordinary.alpha;
        if (alpha === 0) continue;
        this.context.ctx.globalAlpha = alpha;
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
          i < segments.length - 1, // 非末段的终点为接合拐点，需补充衔接箭头
        );
      }
    });
  }

  /**
   * 计算某条轨迹在当前时刻的透明度与淡入状态；Wi-Fi 与普通分段取值不同。
   * 出现时机由 config.slideDelay 决定，与星星的移动进度无关。
   */
  private getTrackAppearance(note: SlideNote, currentTimeMs: number, isWifi: boolean) {
    return getSlideTrackAppearance(
      {
        noteTimeMs: note.timingMs,
        approachTimeMs: this.getNoteApproachTimeMs(note),
        slideDelay: this.context.config.slideDelay,
      },
      currentTimeMs,
      isWifi,
    );
  }

  /**
   * 获取滑条路径各分段的几何弧长及归一化累计区间。
   * 结果按分段数组缓存，画布半径或镜像模式变更时自动失效。
   *
   * @param segments 滑条分段列表。
   * @returns 路径度量信息，总长度非正时返回 null。
   */
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

  /**
   * 渲染单段滑条引导轨迹。
   *
   * @param segment 滑条段配置。
   * @param isBreak 是否为 Break 属性。
   * @param progress 当前段的滑动完成进度 [0, 1]。
   * @param isSimultaneous 是否与其他音符双押。
   * @param normalBreakColor Break 是否使用常规配色。
   * @param isJunctionEnd 是否为多段拼接中的非末段终点（需补衔接箭头）。
   * @returns 渲染是否执行。
   */
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

      this.drawSegmentArrows(segment, progress, isJunctionEnd);
    });

    return true;
  }

  /**
   * 渲染 Wi-Fi 扇形滑条的展开箭头阵列。
   * 由多个对称 V 形六边形沿扩散轴排列组成，尖端朝向目标按键，双臂朝向起始按键张开。
   *
   * @param segment 滑条段配置。
   * @param progress 当前段滑动完成进度 [0, 1]。
   */
  private renderWifiBars(segment: SlideSegment, progress: number): void {
    const steps = SLIDE_AREA_STEP_MAP["wifi"];
    const N = steps[steps.length - 1];

    const hiddenCount = this.getHiddenCount(segment, progress);

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

  /**
   * 生成单个音符在当前时刻的轨迹缓存状态签名，用于判断离屏画布是否需要重建。
   * 与 renderSlidePath 共用同一套 progress→hiddenCount 推导，此处只取失效判据。
   * 淡入中的分段按 TRACK_FADE_BUCKET_MS 分桶，透明度稳定后才把实际 alpha 写进签名。
   *
   * @param note 滑条音符数据。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @returns key 为状态签名；hasVisibleTrack 为 false 时该音符当帧不绘制任何轨迹，调用方可整条跳过。
   */
  private trackStateKey(
    note: SlideNote,
    currentTimeMs: number,
  ): { key: string; hasVisibleTrack: boolean } {
    const ordinary = this.getTrackAppearance(note, currentTimeMs, false);
    const wifi = this.getTrackAppearance(note, currentTimeMs, true);
    if (ordinary.alpha === 0 && wifi.alpha === 0) {
      return { key: "", hasVisibleTrack: false };
    }

    const fadeBucket = `~${Math.floor(currentTimeMs / TRACK_FADE_BUCKET_MS)}`;
    const pathIndexes =
      note.isSplitSlide && note.allSlideSegments ? this.getRenderPathIndexes(note) : [0];
    let key = "";
    for (const i of pathIndexes) {
      const segments = note.allSlideSegments ? note.allSlideSegments[i] : note.slideSegments;
      if (!segments || segments.length === 0) continue;
      const durationMs = note.allDurationMs ? note.allDurationMs[i] : note.durationMs;
      const delayMs = note.allDelayMs ? note.allDelayMs[i] : (note.delayMs ?? 60000 / note.bpm);
      const slideStart = note.timingMs + delayMs;
      if (currentTimeMs > slideStart + durationMs) {
        key += "|x";
        continue;
      }
      let progress = 0;
      if (currentTimeMs >= slideStart) {
        progress = durationMs > 0 ? Math.min(1, (currentTimeMs - slideStart) / durationMs) : 1;
      }
      key += `|${i}`;
      const metrics = this.getSlidePathMetrics(segments);
      if (!metrics) continue;
      for (let s = 0; s < segments.length; s++) {
        const appearance = segments[s].type === "w" ? wifi : ordinary;
        key += appearance.isFading ? `:${fadeBucket}` : `:${appearance.alpha}`;
        if (appearance.alpha === 0) continue;
        const range = metrics.segmentRanges[s];
        let segmentProgress = 0;
        if (progress > range.start) {
          segmentProgress =
            progress >= range.end ? 1 : (progress - range.start) / (range.end - range.start);
        }
        key += `,${this.getHiddenCount(segments[s], segmentProgress)}`;
      }
    }
    return { key, hasVisibleTrack: true };
  }

  /** 丢弃在途重建并清空缓存层内容，重建完成前合成的是空层，不会画出上一张谱的轨迹。 */
  invalidateTrackLayer(): void {
    this.lastTrackRenderTimeMs = null;
    if (this.trackLayerSignature === "" && !this.trackBuildJob) return;
    this.trackLayerSignature = "";
    this.trackBuildJob = null;
    this.trackLayerBuiltAtMs = -Infinity;
    this.clearTrackLayer();
  }

  private clearTrackLayer(): void {
    if (!this.trackLayer || !this.trackLayerCtx) return;
    this.trackLayerCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.trackLayerCtx.clearRect(0, 0, this.trackLayer.width, this.trackLayer.height);
  }

  /**
   * 批量渲染处于稳定状态的滑条轨迹。
   *
   * 采用双缓冲离屏 Canvas 机制：当所有音符的状态签名均未变更时，直接复用前台离屏画布（仅一次 drawImage 合成）；
   * 签名变更时通过后台暂存画布分帧逐步构建，每帧最多 TRACKS_PER_BUILD_STEP 条并受
   * TRACK_LAYER_REBUILD_INTERVAL_MS 节流，构建期间继续显示上一版完整层，完成后交换显示。
   *
   * @param entries 待渲染的稳定滑条条目列表。
   * @param currentBeat 当前节拍。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @param requireCompleteLayer 为 true（暂停、定格、GIF 导出）时当帧同步构建完成，保证单帧场景不依赖后续帧。
   */
  renderStableTracks(
    entries: StableTrackEntry[],
    currentBeat: number,
    currentTimeMs: number,
    requireCompleteLayer: boolean,
  ): void {
    const mainCtx = this.context.ctx;
    const canvas = this.context.canvas;
    const frameDeltaMs = currentTimeMs - (this.lastTrackRenderTimeMs ?? currentTimeMs);
    if (frameDeltaMs < 0 || frameDeltaMs > TRACK_TIME_JUMP_MS) {
      this.invalidateTrackLayer();
    }
    this.lastTrackRenderTimeMs = currentTimeMs;
    if (entries.length === 0) {
      this.invalidateTrackLayer();
      return;
    }

    const { config } = this.context;
    let signature = `${canvas.width}x${canvas.height}|${this.context.radius}|${config.mirrorMode}|${config.normalColorBreakSlide ? 1 : 0}|${config.slideDelay}|${this.getApproachTimeMs()}`;
    const visible = this.visibleTrackEntries;
    visible.length = 0;
    for (const entry of entries) {
      const state = this.trackStateKey(entry.note, currentTimeMs);
      if (!state.hasVisibleTrack) continue;
      signature += `;${entry.index}:${entry.isSimultaneous ? 1 : 0}${state.key}`;
      visible.push(entry);
    }

    const job = this.trackBuildJob;
    const noFrontLayer = !this.trackLayer;
    if (signature === this.trackLayerSignature) {
      this.trackBuildJob = null;
    } else if (job && job.signature === signature) {
      // 无前台离屏层时同步执行直至首帧构建完成，避免画面出现空白闪烁。
      do {
        this.advanceTrackBuildJob(job);
      } while (this.trackBuildJob && (requireCompleteLayer || noFrontLayer));
    } else {
      const elapsedSinceBuildMs = Math.abs(currentTimeMs - this.trackLayerBuiltAtMs);
      if (
        requireCompleteLayer ||
        noFrontLayer ||
        elapsedSinceBuildMs >= TRACK_LAYER_REBUILD_INTERVAL_MS
      ) {
        this.trackBuildJob = {
          signature,
          entries: visible.slice(),
          currentBeat,
          currentTimeMs,
          nextIndex: 0,
          staging: this.acquireTrackStaging(canvas, mainCtx),
        };
        do {
          this.advanceTrackBuildJob(this.trackBuildJob);
        } while (this.trackBuildJob && (requireCompleteLayer || noFrontLayer));
      }
    }

    if (!this.trackLayer) return;
    mainCtx.save();
    mainCtx.setTransform(1, 0, 0, 1, 0, 0);
    mainCtx.drawImage(this.trackLayer, 0, 0);
    mainCtx.restore();
  }

  /**
   * 获取或初始化用于轨迹后台分帧构建的暂存画布。
   * 尺寸与主画布保持一致，并同步主画布的变换矩阵。
   *
   * @param canvas 主渲染画布。
   * @param mainCtx 主渲染上下文。
   * @returns 清空并对齐变换后的暂存画布。
   */
  private acquireTrackStaging(
    canvas: HTMLCanvasElement,
    mainCtx: CanvasRenderingContext2D,
  ): HTMLCanvasElement {
    if (
      !this.trackStaging ||
      this.trackStaging.width !== canvas.width ||
      this.trackStaging.height !== canvas.height
    ) {
      this.trackStaging = document.createElement("canvas");
      this.trackStaging.width = canvas.width;
      this.trackStaging.height = canvas.height;
      this.trackStagingCtx = this.trackStaging.getContext("2d");
    }
    const ctx = this.trackStagingCtx!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.trackStaging.width, this.trackStaging.height);
    ctx.setTransform(mainCtx.getTransform());
    return this.trackStaging;
  }

  /**
   * 推进轨迹分帧构建任务的执行进度。
   *
   * 单次调用最多渲染 TRACKS_PER_BUILD_STEP 条轨迹；当全部条目构建完成后，
   * 自动将后台暂存画布与前台显示画布交换，并更新缓存签名。
   *
   * @param job 当前正在执行的构建任务。
   */
  private advanceTrackBuildJob(job: TrackBuildJob): void {
    const mainCtx = this.context.ctx;
    this.context.ctx = this.trackStagingCtx!;
    try {
      const end = Math.min(job.entries.length, job.nextIndex + TRACKS_PER_BUILD_STEP);
      for (; job.nextIndex < end; job.nextIndex++) {
        const entry = job.entries[job.nextIndex];
        this.renderSlide(
          entry.note,
          job.currentBeat,
          job.currentTimeMs,
          "tracks",
          entry.isSimultaneous,
        );
      }
    } finally {
      this.context.ctx = mainCtx;
    }

    if (job.nextIndex >= job.entries.length) {
      const front = this.trackLayer;
      const frontCtx = this.trackLayerCtx;
      this.trackLayer = job.staging;
      this.trackLayerCtx = this.trackStagingCtx;
      this.trackStaging = front;
      this.trackStagingCtx = frontCtx;
      this.trackLayerSignature = job.signature;
      this.trackLayerBuiltAtMs = job.currentTimeMs;
      this.trackBuildJob = null;
    }
  }

  /**
   * 根据当前滑动进度计算该段已隐藏的引导箭头数量。
   * 按照分段步进映射表阶梯式增加隐藏数量，与滑动时序对齐。
   *
   * @param segment 滑条段配置。
   * @param progress 当前段滑动进度 [0, 1]。
   * @returns 需隐藏的箭头数量。
   */
  private getHiddenCount(segment: SlideSegment, progress: number): number {
    const shape = detectSlideShape(segment.type, segment.startPos, segment.endPos, segment.midPos);
    if (!shape) return 0;
    const steps = SLIDE_AREA_STEP_MAP[shape.shape];
    const hiddenCount =
      steps && steps.length >= 2
        ? steps[Math.min(steps.length - 1, Math.floor(progress * (steps.length - 1)))]
        : 0;
    return segment.type === "w" && progress > 0 ? hiddenCount + 1 : hiddenCount;
  }

  /**
   * 绘制单段滑条中的所有可见箭头。
   *
   * 按阴影、本体、Break 双色遮罩分层绘制，并对生成的 Path2D 路径进行分段缓存。
   *
   * @param segment 滑条段配置。
   * @param progress 当前段滑动进度 [0, 1]。
   * @param isJunctionEnd 是否为多段拼接拐点（需补衔接箭头）。
   */
  private drawSegmentArrows(segment: SlideSegment, progress: number, isJunctionEnd: boolean): void {
    const chain = this.getBarChain(segment);
    if (!chain) return;

    const basis = `${this.context.radius}|${this.context.config.mirrorMode}`;
    let cache = this.arrowPathsCache.get(segment);
    if (!cache || cache.basis !== basis) {
      cache = { basis, byKey: new Map() };
      this.arrowPathsCache.set(segment, cache);
    }

    const hiddenCount = this.getHiddenCount(segment, progress);
    const key = `${hiddenCount}|${isJunctionEnd ? 1 : 0}`;
    let paths = cache.byKey.get(key);
    if (!paths) {
      const bars = this.getVisibleBarsForSegment(segment, hiddenCount, isJunctionEnd);
      if (!bars || bars.length === 0) return;
      paths = this.buildArrowPaths(bars);
      cache.byKey.set(key, paths);
    }

    const ctx = this.context.ctx;
    const mainStroke = ctx.strokeStyle;
    const isBreak =
      typeof mainStroke === "string" &&
      mainStroke.toLowerCase() === COLORS.BREAK_ORANGE.toLowerCase();
    const leftColor = isBreak ? COLORS.SLIDE_SIMULTANEOUS : mainStroke;
    const rightColor = isBreak ? COLORS.SLIDE_ARROW_RIGHT : mainStroke;

    ctx.save();
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.lineWidth = this.getNoteStrokeWidth();

    const baseAlpha = ctx.globalAlpha;
    for (const arrow of paths) {
      ctx.globalAlpha = baseAlpha * 0.4;
      ctx.fillStyle = COLORS.BLACK;
      ctx.fill(arrow.shadow);
      ctx.globalAlpha = baseAlpha;

      ctx.fillStyle = rightColor;
      ctx.fill(arrow.main);

      if (isBreak) {
        ctx.fillStyle = leftColor;
        ctx.fill(arrow.leftHalf);
      }

      ctx.strokeStyle = COLORS.BLACK;
      ctx.stroke(arrow.main);
    }

    ctx.restore();
  }

  /**
   * 获取指定滑条段在当前进度下所有可见箭头的坐标与切向角序列。
   *
   * @param segment 滑条段配置。
   * @param hiddenCount 需跳过的已隐藏箭头数。
   * @param isJunctionEnd 是否需在拼接拐点外推补充衔接箭头。
   * @returns 可见箭头几何信息列表，无可见内容时返回 null。
   */
  private getVisibleBarsForSegment(
    segment: SlideSegment,
    hiddenCount: number,
    isJunctionEnd: boolean = false,
  ): { x: number; y: number; angle: number }[] | null {
    if (segment.type === "w") return null;
    const chain = this.getBarChain(segment);
    if (!chain) return null;

    const usePrecomputedAngle = segment.type !== "-";
    const result: { x: number; y: number; angle: number }[] = [];
    const last = chain.length - 1;

    // 拼接拐点补偿：独立滑条末端预留内缩间距，但连续拼接路径在拐点处若两端均内缩会产生明显视觉缺口。
    // 因此在非末段终点沿走向外推补充一个衔接箭头（置于首位作为最底层绘制）。
    if (isJunctionEnd && chain.length >= 2 && hiddenCount < chain.length) {
      const a = chain[last];
      const b = chain[last - 1];
      const jx = 2 * a.x - b.x;
      const jy = 2 * a.y - b.y;
      // 边界约束：若外推坐标超出判定圈半径则舍弃，防止紧贴按键的极端形状外推至判定圈外。
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
   * 对参数化曲线进行等步长采样，构建弧长查找表（LUT）。
   * 输出包含各采样点坐标、切线角及累计弧长；起点切向角使用 t->0 的出向角以保证方向连续性。
   *
   * @param pathFn 接收参数 t ∈ [0, 1] 并返回二维坐标的曲线方程。
   * @param samples 采样分段数量，默认 64。
   * @returns 弧长查找表采样点列表。
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
   * 获取指定滑条段的弧长查找表（缓存于分段对象中）。
   * 查表同时更新 cachedLength 以保持长度数据单一来源；画布半径或镜像模式变更时自动失效重算。
   *
   * @param segment 滑条段配置。
   * @returns 弧长查找表。
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
   * 根据累计弧长在查找表中二分查找并线性插值计算坐标与切向角。
   * 角度直接取区间入向角，避免在回转点进行角度插值产生抖动。
   *
   * @param lut 弧长查找表。
   * @param s 目标累计弧长。
   * @returns 插值后的坐标与切向角。
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

  /**
   * 计算两条相交线段在顶点处的内角平分线偏移点。
   * 用于生成具有恒定线宽的箭头折角顶点；两线段夹角退化或重合时返回 null。
   *
   * @param x1 第一条线段端点 X。
   * @param y1 第一条线段端点 Y。
   * @param x2 角顶点 X。
   * @param y2 角顶点 Y。
   * @param x3 第二条线段端点 X。
   * @param y3 第二条线段端点 Y。
   * @param width 沿角平分线法向的单侧线宽。
   * @returns 角平分线上的偏移点坐标，退化时返回 null。
   */
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

  /**
   * 根据箭头位置与角度序列构建对应的 Path2D 路径集合。
   * 包含本体多边形、反向偏移的投影多边形以及 Break 音符专用的左半部遮罩多边形。
   *
   * @param arrows 箭头中心坐标与朝向角度列表。
   * @returns 构建完成的箭头几何路径集合。
   */
  private buildArrowPaths(arrows: { x: number; y: number; angle: number }[]): ArrowPathSet {
    const arrowHeight = this.scaleByRadius(SLIDE_ARROW_HEIGHT_RATIO);
    const arrowWidth = this.scaleByRadius(SLIDE_ARROW_SPAN_RATIO);
    const lineWidth = this.scaleByRadius(SLIDE_ARROW_WIDTH_RATIO);
    const pad = this.scaleByRadius(SLIDE_ARROW_PADDING_RATIO);
    // 各箭头朝向不一，阴影沿其自身反向偏移并直接烘焙入顶点坐标
    const shadowOffset = this.scaleByRadius(5 / 300);

    const result: ArrowPathSet = [];

    for (const arrow of arrows) {
      const cos = Math.cos(arrow.angle);
      const sin = Math.sin(arrow.angle);
      // 沿走向向前偏移安全间距，避免首个箭头与起始判定圆重叠
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

      const main = new Path2D();
      main.moveTo(x2, y2);
      main.lineTo(x3, y3);
      main.lineTo(bx3, by3);
      main.lineTo(bx, by);
      main.lineTo(bx1, by1);
      main.lineTo(x1, y1);
      main.closePath();

      const shadow = new Path2D();
      const sx = -cos * shadowOffset;
      const sy = -sin * shadowOffset;
      shadow.moveTo(x2 + sx, y2 + sy);
      shadow.lineTo(x3 + sx, y3 + sy);
      shadow.lineTo(bx3 + sx, by3 + sy);
      shadow.lineTo(bx + sx, by + sy);
      shadow.lineTo(bx1 + sx, by1 + sy);
      shadow.lineTo(x1 + sx, y1 + sy);
      shadow.closePath();

      // Break 音符左半部采用覆盖绘制方式，避免相邻多边形拼接处因抗锯齿产生缝隙
      const leftHalf = new Path2D();
      leftHalf.moveTo(x2, y2);
      leftHalf.lineTo(bx, by);
      leftHalf.lineTo(bx3, by3);
      leftHalf.lineTo(x3, y3);
      leftHalf.closePath();

      result.push({ main, shadow, leftHalf });
    }

    return result;
  }

  /**
   * 批量绘制 Wi-Fi 扇形的 V 形展开箭头条带。
   * 采用六边形闭合路径填充，外缘正向与内缘反向闭合形成 V 形截面，避免描边端点的圆头瑕疵。
   *
   * @param chevrons 待绘制的 V 形几何参数列表。
   * @param fanAngle 扇形扩散中心轴角度（弧度）。
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

    // 将整组扇形合并为单一 Path2D，统一执行阴影偏移填充与本体填充
    const fanPath = new Path2D();
    for (const c of chevrons) {
      const a1x = c.x + cos * c.arm1Dx - sin * c.arm1Dy;
      const a1y = c.y + sin * c.arm1Dx + cos * c.arm1Dy;
      const a2x = c.x + cos * c.arm2Dx - sin * c.arm2Dy;
      const a2y = c.y + sin * c.arm2Dx + cos * c.arm2Dy;
      const shape = buildChevronPath(c.x, c.y, a1x, a1y, a2x, a2y, c.width);
      if (shape) fanPath.addPath(shape);
    }

    ctx.save();
    ctx.translate(-cos * shadowOffset, -sin * shadowOffset);
    ctx.globalAlpha = ctx.globalAlpha * 0.4;
    ctx.fillStyle = COLORS.BLACK;
    ctx.fill(fanPath);
    ctx.restore();

    ctx.fillStyle = mainStroke;
    ctx.fill(fanPath);

    ctx.restore();
  }

  /**
   * 渲染滑条的滑动星头（单颗常规星头）。
   *
   * 在滑行开始前处于起始按键位置并执行缩放淡入；滑行期间沿路径运动并根据配置旋转。
   *
   * @param note 滑条音符数据。
   * @param progress 滑动进度 [0, 1]。
   * @param segments 滑条分段列表。
   * @param pathIndex 当前分支路径索引。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @param isSimultaneous 是否与其他音符双押。
   */
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

  /**
   * 渲染 Wi-Fi 滑条的三星并排星头。
   *
   * 包含中心与两侧相邻按键方向共三颗星头，各自朝向目标扇区滑动。
   *
   * @param note 滑条音符数据。
   * @param progress 滑动进度 [0, 1]。
   * @param segments 滑条分段列表。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @param isSimultaneous 是否与其他音符双押。
   * @param pathIndex 分支路径索引。
   */
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
        // 每颗星头朝向各自扇区分支的目标方位
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

  /**
   * 绘制单颗五角星音符头部。
   * 包含外层描边黑底、中心镂空环面、白色描边轮廓以及中心圆点。
   *
   * @param x 中心 X 坐标。
   * @param y 中心 Y 坐标。
   * @param size 星头基准半径。
   * @param color 填充主色。
   * @param rotation 旋转角度（弧度）。
   * @param isEx 是否为 EX 音符（EX 音符外圈由发光环占据，省略外缘黑底）。
   */
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

      // 先绘制加宽的黑色描边底，后续的分段色块填充会覆盖其内侧半幅，使最终显露的外边缘黑边宽度接近基准描边。
      // EX 音符外沿已有专属发光环，因此跳过外轮廓黑底，仅保留内孔黑底。

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

      // 外缘与内孔采用反向缠绕路径，利用非零环绕规则形成镂空五角星环面
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

  /**
   * 渲染 EX 滑条星头的外层发光五角星光环。
   *
   * @param x 中心 X 坐标。
   * @param y 中心 Y 坐标。
   * @param size 基础星头尺寸。
   * @param isBreak 是否为 Break 属性。
   * @param isSimultaneous 是否与其他音符双押。
   * @param scaleFactor 外发光环的缩放倍率。
   */
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
    });
  }

  /**
   * 渲染双星（Split）形态 EX 星头的外层发光光环。
   * 由上下交错的两个发光星环叠加组成。
   *
   * @param x 中心 X 坐标。
   * @param y 中心 Y 坐标。
   * @param size 基础星头尺寸。
   * @param isBreak 是否为 Break 属性。
   * @param isSimultaneous 是否与其他音符双押。
   * @param scaleFactor 外发光环的缩放倍率。
   */
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

  /**
   * 计算星头在滑动与接近过程中的自转角度。
   * 旋转角速度正比于路径规整长度与滑动持续时长，且设有最大角速度上限；自转自音符登场起持续生效。
   *
   * @param note 滑条音符数据。
   * @param currentTimeMs 当前谱面播放时间戳（毫秒）。
   * @returns 当前时间戳对应的自转角（弧度，顺时针为负）。
   */
  calculateStarRotation(note: SlideNote, currentTimeMs: number): number {
    const durationMs = note.allDurationMs ? note.allDurationMs[0] : note.durationMs;
    const segments = note.allSlideSegments ? note.allSlideSegments[0] : note.slideSegments;

    if (!segments || segments.length === 0 || !durationMs || durationMs === 0) return 0;

    let totalLengthPixels = 0;
    for (const seg of segments) {
      totalLengthPixels += this.getSegmentLength(seg);
    }

    // 按基准按键环半径 480 进行尺寸归一化
    const gameRingRadius = 480;
    const normalizedLength = totalLengthPixels * (gameRingRadius / this.context.radius);

    const rotationSpeedDegPerMs = (normalizedLength / Math.PI / durationMs) * 15 * 0.06;
    const MAX_ROTATION_DEG_PER_MS = 1.08;
    const cappedRotationDegPerMs = Math.min(rotationSpeedDegPerMs, MAX_ROTATION_DEG_PER_MS);
    const rotationSpeedRadPerMs = -cappedRotationDegPerMs * (Math.PI / 180);

    const approachTime = this.getNoteApproachTimeMs(note);
    const visibilityStart = note.timingMs - approachTime;
    if (currentTimeMs < visibilityStart) return 0;

    const elapsedMs = currentTimeMs - visibilityStart;
    return rotationSpeedRadPerMs * elapsedMs;
  }

  /**
   * 获取滑条段在当前画布尺寸下的实际弧长（逻辑像素）。
   * 优先从缓存读取；未命中时由弧长查找表末点的累计弧长确定。
   *
   * @param segment 滑条段配置。
   * @returns 该段几何弧长（像素）。
   */
  getSegmentLength(segment: SlideSegment): number {
    if (
      segment.cachedLength !== undefined &&
      segment.cachedRadius === this.context.radius &&
      segment.cachedMirrorMode === this.context.config.mirrorMode
    ) {
      return segment.cachedLength;
    }
    const lut = this.getSegmentLut(segment);
    return lut[lut.length - 1].s;
  }

  /**
   * 获取单段滑条在归一化参数 t 处的二维坐标。
   *
   * 引导点链首尾补充按键圆心坐标作为端点，确保多段连续拼接时星头平滑过渡；
   * 异常或退化线段回退为首尾按键间的线性插值。
   *
   * @param segment 滑条段配置。
   * @param t 沿路径的归一化参数 [0, 1]。
   * @returns 采样点的二维坐标。
   */
  getPointOnSegment(segment: SlideSegment, t: number): Point2D {
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

    return {
      x: start.x + (end.x - start.x) * t,
      y: start.y + (end.y - start.y) * t,
    };
  }

  /**
   * 根据整条复合路径的总滑动进度，计算星头所在的二维坐标。
   *
   * 按各分段弧长比例映射至具体子段，并在该段的弧长查找表上插值定位。
   *
   * @param progress 复合路径的全局滑动进度 [0, 1]。
   * @param segments 复合路径的分段列表。
   * @returns 当前进度对应的二维坐标。
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

  /**
   * 根据整条复合路径的滑动进度，计算星头沿路径运动的切向角（朝向）。
   *
   * 沿包含首尾按键与中间引导点的折线链按累计弧长对相邻锚点切角进行角平分插值，
   * 保证星头朝向与运动位置使用完全一致的参数化曲线。
   *
   * @param progress 复合路径的全局滑动进度 [0, 1]。
   * @param segments 复合路径的分段列表。
   * @returns 切向角度（弧度）。
   */
  private getPathTangentAngle(progress: number, segments: SlideSegment[]): number {
    if (!segments || segments.length === 0) return 0;

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
