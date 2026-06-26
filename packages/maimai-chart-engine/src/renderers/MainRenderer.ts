import { RenderContext, getGradientColors } from "./BaseRenderer";
import { NoteRenderer } from "./NoteRenderer";
import { SlideRenderer } from "./SlideRenderer";
import { HoldRenderer } from "./HoldRenderer";
import { TouchRenderer } from "./TouchRenderer";
import { TimingTimeline } from "../core/timing/TimingTimeline";
import {
  Note,
  Chart,
  RendererConfig,
  SlideNote,
  HoldStartNote,
  HoldEndNote,
  TapNote,
  TouchNote,
  TouchHoldStartNote,
  ButtonPosition,
  isTapNote,
  isSlideNote,
  isHoldStartNote,
  isHoldEndNote,
  isTouchNote,
  isTouchHoldStartNote,
  isButtonNote,
} from "../types";
import {
  BASE_APPROACH_TIME_MS,
  HI_SPEED_DEFAULT,
  HI_SPEED_CONVERSION_FACTOR,
  BUTTON_MARKER_RATIO,
  JUDGMENT_LINE_WIDTH_RATIO,
  COLORS,
  RAINBOW_SPEED_DEG_PER_SEC,
  NOTE_HIT_EFFECT_DURATION_MS,
} from "../utils/constants";

const MAX_DPR = 2;
const FULLSCREEN_MIN_DPR = 1;
const STAR_TAP_ROTATION_SPEED_RAD_PER_MS = (2 * Math.PI) / 1000;

export interface MainRendererConfig {
  sensorImagePath?: string;
}

// tap / hold / slide 星星头同层、按时间分层（早的在上）的合并列表，按 timingMs 降序（晚的先画/在底）。
type LayeredNote =
  | { kind: "tap"; note: TapNote }
  | { kind: "hold"; note: HoldStartNote }
  | { kind: "slideStart"; note: SlideNote };

type ApproachIndicatorNote =
  | { kind: "hold"; note: HoldStartNote }
  | { kind: "slide"; note: SlideNote };

interface ApproachIndicatorGroup {
  notes: ApproachIndicatorNote[];
}

interface VisibleApproachIndicator {
  note: HoldStartNote | SlideNote;
  position: { x: number; y: number };
}

interface PreparedRenderNotes {
  slides: SlideNote[];
  touches: (TouchNote | TouchHoldStartNote)[];
  fireworkTouches: (TouchNote | TouchHoldStartNote)[];
  holds: HoldStartNote[];
  holdEndMap: Map<string, HoldEndNote>;
  noteMeta: WeakMap<Note, RenderNoteMeta>;
  approachGroups: ApproachIndicatorGroup[];
  layeredHeads: LayeredNote[];
  hitEffectNotes: Note[];
}

interface RenderNoteMeta {
  simultaneousNoteCount: number;
  simultaneousSlideCount: number;
  simultaneousNonTouchCount: number;
  simultaneousTouchCount: number;
  noExBreakIndex?: number;
}

const EMPTY_RENDER_NOTE_META: RenderNoteMeta = {
  simultaneousNoteCount: 0,
  simultaneousSlideCount: 0,
  simultaneousNonTouchCount: 0,
  simultaneousTouchCount: 0,
};

interface RenderFrameTiming {
  currentBeat: number;
  currentTimeMs: number;
  currentBpm: number;
  divisor: number;
}

export class MainRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private centerX: number = 0;
  private centerY: number = 0;
  private radius: number = 0;
  private logicalSize: number = 0;
  private fullscreenMaxPixels: number = 2_500_000;

  private config: RendererConfig = {
    hiSpeed: HI_SPEED_DEFAULT * HI_SPEED_CONVERSION_FACTOR,
    alwaysKeepHiSpeed: false,
    playbackSpeed: 1.0,
    mirrorMode: "none",
    highlightExNotes: false,
    normalColorBreakSlide: false,
    pinkSlideStart: false,
    slideRotation: false,
    judgmentLineDesign: "simple",
    showBpm: true,
    showBreakIndex: false,
    rainbowBpm: false,
    ddrColorMode: false,
    ddrColorExtended: false,
    showFireworks: true,
    showHitEffect: true,
    videoBrightness: "dark",
  };

  private fps: number = 0;
  private prevBpm: number = 120;
  private bpmChangeTime: number = 0;
  private bpmChangeType: "up" | "down" | null = null;
  private isPlaying: boolean = false;

  private noteRenderer!: NoteRenderer;
  private slideRenderer!: SlideRenderer;
  private holdRenderer!: HoldRenderer;
  private touchRenderer!: TouchRenderer;

  private sensorImage: HTMLImageElement | null = null;
  private sensorImagePath: string;

  private backgroundVideo: HTMLVideoElement | null = null;
  private backgroundVideoCache: HTMLCanvasElement | null = null;
  private backgroundVideoCacheReady = false;
  private backgroundVideoSrc = "";
  private timingTimelineChart: Chart | null = null;
  private timingTimeline: TimingTimeline | null = null;

  // simulCounts / breakIdx 是静态元数据，只依赖 chart 本身。
  // 用 notes 数组引用做缓存键——chart 切换时引用变化自然 invalidate。
  private preparedNotesRef: Note[] | null = null;
  private preparedRenderNotes: PreparedRenderNotes = {
    slides: [],
    touches: [],
    fireworkTouches: [],
    holds: [],
    holdEndMap: new Map(),
    noteMeta: new WeakMap(),
    approachGroups: [],
    layeredHeads: [],
    hitEffectNotes: [],
  };
  private visibleTouchCountByPos = new Map<string, number>();
  private visibleApproachIndicators: VisibleApproachIndicator[] = [];

  constructor(canvas: HTMLCanvasElement, config: MainRendererConfig = {}) {
    this.canvas = canvas;
    this.sensorImagePath = config.sensorImagePath ?? "/assets/maimai/chart/sensor.webp";

    // alpha: false 让浏览器知道 canvas 不透明（CSS 已经把 background 设成 #000），
    // 合成时走 RGB 路径而不是 RGBA，省一次 alpha blend pass。
    // 144Hz 高刷显示器下这是 MDN 推荐的 canvas 优化中最直接的一个。
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Failed to get 2D canvas context");
    }
    this.ctx = context;

    this.resize();

    this.initRenderers();

    this.loadAssets();
  }

  private initRenderers(): void {
    const context = this.createRenderContext();

    this.noteRenderer = new NoteRenderer(context);
    this.slideRenderer = new SlideRenderer(context, this.noteRenderer);
    this.holdRenderer = new HoldRenderer(context);
    this.touchRenderer = new TouchRenderer(context);
  }

  private createRenderContext(): RenderContext {
    return {
      canvas: this.canvas,
      ctx: this.ctx,
      centerX: this.centerX,
      centerY: this.centerY,
      radius: this.radius,
      hiSpeed: this.config.hiSpeed,
      baseApproachTimeMs: BASE_APPROACH_TIME_MS,
      config: this.config,
    };
  }

  private updateRenderersContext(): void {
    const context = this.createRenderContext();
    this.noteRenderer.updateContext(context);
    this.slideRenderer.updateContext(context);
    this.holdRenderer.updateContext(context);
    this.touchRenderer.updateContext(context);
  }

  private loadAssets(): void {
    this.sensorImage = new Image();
    this.sensorImage.src = this.sensorImagePath;
  }

  resize(isFullscreen: boolean = false): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    this.canvas.style.width = "";
    this.canvas.style.height = "";

    const rect = parent.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    if (size <= 0) return;
    // 144Hz 显示器的 vsync 预算只有 6.9ms，按完整 DPR=2/3 渲染时浏览器
    // composite canvas backing store 的成本会顶满预算导致掉帧；不过手机屏幕通常
    // 物理面积小，按 DPR=2 渲染仍可接受，上限 2 在 DPR=3 设备节省 ~56% 像素。
    const rawDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const fullscreenBudgetDpr = Math.sqrt(this.fullscreenMaxPixels / (size * size));
    const dpr = isFullscreen
      ? Math.min(rawDpr, Math.max(FULLSCREEN_MIN_DPR, fullscreenBudgetDpr))
      : rawDpr;
    const backingSize = Math.round(size * dpr);
    const effectiveDpr = backingSize / size;

    this.applySize(size, effectiveDpr);
  }

  resizeToSize(size: number): void {
    this.applySize(size, 1);
  }

  private applySize(logicalSize: number, dpr: number): void {
    this.logicalSize = logicalSize;

    this.canvas.width = Math.round(logicalSize * dpr);
    this.canvas.height = Math.round(logicalSize * dpr);

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.centerX = logicalSize / 2;
    this.centerY = logicalSize / 2;
    this.radius = logicalSize * 0.45;

    if (this.noteRenderer) {
      this.updateRenderersContext();
    }
  }

  renderFrame(chart: Chart, currentBeats: number): void {
    const prepared = this.getPreparedRenderNotes(chart.notes);
    const timingTimeline = this.getTimingTimeline(chart);
    const timing: RenderFrameTiming = {
      currentBeat: currentBeats,
      currentTimeMs: timingTimeline.msFromBeat(currentBeats),
      currentBpm: timingTimeline.bpmAtBeat(currentBeats),
      divisor: timingTimeline.divisorAtBeat(currentBeats),
    };

    this.clear();
    this.renderJudgmentLine();
    this.renderFireworks(prepared.fireworkTouches, timing);
    this.renderNotes(prepared, timing);
  }

  setHiSpeed(hiSpeed: number): void {
    if (hiSpeed >= 3 && hiSpeed <= 9) {
      this.config.hiSpeed = hiSpeed * HI_SPEED_CONVERSION_FACTOR;
      this.updateRenderersContext();
    }
  }

  setAlwaysKeepHiSpeed(alwaysKeepHiSpeed: boolean): void {
    this.config.alwaysKeepHiSpeed = alwaysKeepHiSpeed;
    this.updateRenderersContext();
  }

  setPlaybackSpeed(playbackSpeed: number): void {
    if (playbackSpeed >= 0.1 && playbackSpeed <= 1.0) {
      this.config.playbackSpeed = playbackSpeed;
      this.updateRenderersContext();
    }
  }

  setFps(fps: number): void {
    this.fps = fps;
  }

  setIsPlaying(isPlaying: boolean): void {
    this.isPlaying = isPlaying;
  }

  setHighlightExNotes(enabled: boolean): void {
    this.config.highlightExNotes = enabled;
    this.updateRenderersContext();
  }

  setNormalColorBreakSlide(enabled: boolean): void {
    this.config.normalColorBreakSlide = enabled;
    this.updateRenderersContext();
  }

  setPinkSlideStart(enabled: boolean): void {
    this.config.pinkSlideStart = enabled;
    this.updateRenderersContext();
  }

  setSlideRotation(enabled: boolean): void {
    this.config.slideRotation = enabled;
    this.updateRenderersContext();
  }

  setMirrorMode(mode: "none" | "horizontal" | "vertical" | "rotate180"): void {
    this.config.mirrorMode = mode;
    this.updateRenderersContext();
  }

  setJudgmentLineDesign(design: "simple" | "noLine" | "blind" | "sensor"): void {
    this.config.judgmentLineDesign = design;
    this.updateRenderersContext();
  }

  setShowFireworks(enabled: boolean): void {
    this.config.showFireworks = enabled;
  }

  setShowHitEffect(enabled: boolean): void {
    this.config.showHitEffect = enabled;
  }

  setVideoBrightness(brightness: "dark" | "normal" | "bright"): void {
    this.config.videoBrightness = brightness;
  }

  setFullscreenMaxPixels(maxPixels: number): void {
    this.fullscreenMaxPixels = maxPixels;
  }

  setBackgroundVideo(video: HTMLVideoElement | null): void {
    if (video && video.src !== this.backgroundVideoSrc) {
      this.backgroundVideoSrc = video.src;
      this.backgroundVideoCacheReady = false;
    }
    this.backgroundVideo = video;
  }

  private cacheBackgroundVideoFrame(video: HTMLVideoElement): void {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w === 0 || h === 0) return;
    let cache = this.backgroundVideoCache;
    if (!cache) {
      cache = document.createElement("canvas");
      this.backgroundVideoCache = cache;
    }
    if (cache.width !== w || cache.height !== h) {
      cache.width = w;
      cache.height = h;
    }
    const cctx = cache.getContext("2d");
    if (!cctx) return;
    cctx.drawImage(video, 0, 0, w, h);
    this.backgroundVideoCacheReady = true;
  }

  // fillRect 保证导出的背景不透明。
  // clearRect 依赖 alpha:false，移动端 Safari 不可靠，会导致导出图透明。
  clear(): void {
    const s = this.logicalSize;
    const video = this.backgroundVideo;
    if (video && video.videoWidth > 0) {
      let source: CanvasImageSource | null = null;
      if (video.readyState >= 2) {
        this.cacheBackgroundVideoFrame(video);
        source = video;
      } else if (this.backgroundVideoCacheReady) {
        source = this.backgroundVideoCache;
      }
      if (source) {
        this.ctx.fillStyle = COLORS.BLACK;
        this.ctx.fillRect(0, 0, s, s);
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(this.centerX, this.centerY, s / 2, 0, Math.PI * 2);
        this.ctx.clip();
        const scale = Math.min(s / video.videoWidth, s / video.videoHeight);
        const dw = video.videoWidth * scale;
        const dh = video.videoHeight * scale;
        this.ctx.drawImage(source, (s - dw) / 2, (s - dh) / 2, dw, dh);
        const dimAlpha =
          this.config.videoBrightness === "dark"
            ? 0.6
            : this.config.videoBrightness === "normal"
              ? 0.3
              : 0;
        if (dimAlpha > 0) {
          this.ctx.fillStyle = `rgba(0, 0, 0, ${dimAlpha})`;
          this.ctx.fillRect(0, 0, s, s);
        }
        this.ctx.restore();
        return;
      }
    }
    this.ctx.fillStyle = COLORS.BLACK;
    this.ctx.fillRect(0, 0, s, s);
  }

  renderJudgmentLine(): void {
    if (this.config.judgmentLineDesign === "blind") {
      return;
    }

    this.ctx.save();

    if (
      this.config.judgmentLineDesign === "sensor" &&
      this.sensorImage &&
      this.sensorImage.complete
    ) {
      const imgSize = this.logicalSize - 10;
      const imgX = this.centerX - imgSize / 2;
      const imgY = this.centerY - imgSize / 2 + 8;
      this.ctx.drawImage(this.sensorImage, imgX, imgY, imgSize, imgSize);
    }

    if (
      this.config.judgmentLineDesign === "simple" ||
      this.config.judgmentLineDesign === "sensor"
    ) {
      this.ctx.beginPath();
      this.ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = COLORS.WHITE;
      this.ctx.lineWidth = JUDGMENT_LINE_WIDTH_RATIO * this.radius;
      this.ctx.stroke();
    }

    const markerSize = BUTTON_MARKER_RATIO * this.radius;
    for (let pos = 1; pos <= 8; pos++) {
      const buttonPos = this.noteRenderer.getPositionOnRing(pos as ButtonPosition);
      this.ctx.beginPath();
      this.ctx.arc(buttonPos.x, buttonPos.y, markerSize, 0, Math.PI * 2);
      this.ctx.fillStyle = COLORS.WHITE;
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  /** 火花特效：判定线之上、note 之下渲染，canvas 内切圆裁切。 */
  private renderFireworks(
    touches: readonly (TouchNote | TouchHoldStartNote)[],
    timing: RenderFrameTiming,
  ): void {
    if (!this.config.showFireworks) return;
    if (touches.length === 0) return;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, this.logicalSize / 2, 0, Math.PI * 2);
    this.ctx.clip();
    this.touchRenderer.renderTouchFireworks(touches, timing.currentTimeMs);
    this.ctx.restore();
  }

  private renderNotes(prepared: PreparedRenderNotes, timing: RenderFrameTiming): void {
    if (this.config.showBpm) {
      this.renderBpmDisplay(timing.currentBpm, timing.currentBeat, timing.divisor);
    }

    this.ctx.save();

    const { slides, touches, approachGroups, hitEffectNotes, layeredHeads, holdEndMap, noteMeta } =
      prepared;

    for (const slide of slides) {
      this.slideRenderer.renderSlide(
        slide,
        timing.currentBeat,
        timing.currentTimeMs,
        "tracks",
        this.getNoteMeta(noteMeta, slide).simultaneousSlideCount >= 2,
      );
    }

    for (const slide of slides) {
      this.slideRenderer.renderSlide(
        slide,
        timing.currentBeat,
        timing.currentTimeMs,
        "stars",
        this.getNoteMeta(noteMeta, slide).simultaneousSlideCount >= 2,
      );
    }

    this.renderApproachIndicators(approachGroups, noteMeta, timing);

    // tap / hold / slide 星星头同层、按时间分层（早的在上）；列表在 prepareRenderNotes 预排序。
    this.renderLayeredHeads(layeredHeads, holdEndMap, noteMeta, timing);

    // touch 最上层，覆盖普通 note。
    this.renderTouchBorders(touches, noteMeta, timing.currentTimeMs);

    for (const touch of touches) {
      this.touchRenderer.renderTouch(
        touch,
        timing.currentBeat,
        timing.currentTimeMs,
        this.getNoteMeta(noteMeta, touch).simultaneousNoteCount >= 2,
      );
    }

    // 击打特效画在最上层，盖住所有 note。
    if (this.config.showHitEffect) {
      this.renderTapHitEffect(hitEffectNotes, timing.currentTimeMs);
    }

    this.ctx.restore();
  }

  private getPreparedRenderNotes(notes: Note[]): PreparedRenderNotes {
    if (this.preparedNotesRef !== notes) {
      this.preparedRenderNotes = this.prepareRenderNotes(notes);
      this.preparedNotesRef = notes;
    }

    return this.preparedRenderNotes;
  }

  private calculateSimultaneousCounts(
    notes: Note[],
    noteMeta: WeakMap<Note, RenderNoteMeta>,
  ): void {
    const byTiming = new Map<string, Note[]>();

    for (const note of notes) {
      if (isHoldEndNote(note) || note.hasDelayMarker) continue;

      const key = note.timingMs.toFixed(3);
      if (!byTiming.has(key)) {
        byTiming.set(key, []);
      }
      byTiming.get(key)!.push(note);
    }

    for (const [, group] of byTiming) {
      const tapCount = group.filter((n) => !isTapNote(n) || n.type !== "break").length;
      const breakCount = group.filter(
        (n) =>
          n.type === "break" ||
          (isSlideNote(n) && n.isStartBreak) ||
          (isHoldStartNote(n) && n.isBreakHold),
      ).length;
      const slideCount = group.filter((n) => isSlideNote(n)).length;
      const nonTouchCount = group.filter(
        (n) => !isTouchNote(n) && !isTouchHoldStartNote(n) && n.type !== "break",
      ).length;

      const touchByPos = new Map<string, number>();
      for (const note of group) {
        if (isTouchNote(note) || isTouchHoldStartNote(note)) {
          const pos = note.position as string;
          touchByPos.set(pos, (touchByPos.get(pos) || 0) + 1);
        }
      }

      for (const note of group) {
        const isSimultaneous = tapCount >= 2 || (breakCount >= 1 && tapCount >= 1);
        const meta = this.getOrCreateNoteMeta(noteMeta, note);
        meta.simultaneousNoteCount = isSimultaneous ? Math.max(2, tapCount) : tapCount;
        meta.simultaneousSlideCount = slideCount;
        meta.simultaneousNonTouchCount = nonTouchCount;

        if (isTouchNote(note) || isTouchHoldStartNote(note)) {
          meta.simultaneousTouchCount = touchByPos.get(note.position as string) || 1;
        }
      }
    }
  }

  private assignBreakIndices(notes: Note[], noteMeta: WeakMap<Note, RenderNoteMeta>): void {
    const breakNotes = notes
      .filter(
        (n) =>
          (n.type === "break" ||
            (isSlideNote(n) && n.isStartBreak) ||
            (isHoldStartNote(n) && n.isBreakHold)) &&
          !(n as TapNote).isEx,
      )
      .sort((a, b) => a.timingMs - b.timingMs);

    let index = 1;
    for (const note of breakNotes) {
      this.getOrCreateNoteMeta(noteMeta, note).noExBreakIndex = index++;
    }
  }

  private getNoteMeta(noteMeta: WeakMap<Note, RenderNoteMeta>, note: Note): RenderNoteMeta {
    return noteMeta.get(note) ?? EMPTY_RENDER_NOTE_META;
  }

  private getOrCreateNoteMeta(noteMeta: WeakMap<Note, RenderNoteMeta>, note: Note): RenderNoteMeta {
    let meta = noteMeta.get(note);
    if (!meta) {
      meta = {
        simultaneousNoteCount: 0,
        simultaneousSlideCount: 0,
        simultaneousNonTouchCount: 0,
        simultaneousTouchCount: 0,
      };
      noteMeta.set(note, meta);
    }
    return meta;
  }

  private prepareRenderNotes(notes: Note[]): PreparedRenderNotes {
    const slides: SlideNote[] = [];
    const touches: (TouchNote | TouchHoldStartNote)[] = [];
    const fireworkTouches: (TouchNote | TouchHoldStartNote)[] = [];
    const holds: HoldStartNote[] = [];
    const taps: TapNote[] = [];
    const holdEndMap = new Map<string, HoldEndNote>();
    const noteMeta = new WeakMap<Note, RenderNoteMeta>();
    const hitEffectNotes: Note[] = [];

    for (let i = notes.length - 1; i >= 0; i--) {
      const note = notes[i];

      if (isSlideNote(note)) {
        slides.push(note);
      } else if (isTouchNote(note) || isTouchHoldStartNote(note)) {
        touches.push(note);
      } else if (isHoldStartNote(note)) {
        holds.push(note);
      } else if (isTapNote(note) && !isHoldEndNote(note)) {
        taps.push(note);
      }
    }

    this.calculateSimultaneousCounts(notes, noteMeta);
    this.assignBreakIndices(notes, noteMeta);

    for (const note of notes) {
      if (isHoldEndNote(note)) {
        holdEndMap.set(this.getHoldEndKey(note.position, note.holdStartTiming), note);
      }

      if ((isTouchNote(note) || isTouchHoldStartNote(note)) && note.hasFirework) {
        fireworkTouches.push(note);
      }

      if (
        isButtonNote(note) &&
        !isTouchNote(note) &&
        !isTouchHoldStartNote(note) &&
        !isHoldStartNote(note) &&
        !(isSlideNote(note) && note.isHeadless)
      ) {
        hitEffectNotes.push(note);
      }
    }

    hitEffectNotes.sort((a, b) => a.timingMs - b.timingMs);

    // tap / hold / slide 星星头同层按 timingMs 降序（早到的后画/在上层，与 maimai noteSortOrder 一致）。
    // 在此预算一次（本函数被 notes 引用 memoize），渲染热路径直接迭代，省每帧的合并+排序+分配。
    const layeredHeads: LayeredNote[] = [
      ...taps.map((note) => ({ kind: "tap" as const, note })),
      ...holds.map((note) => ({ kind: "hold" as const, note })),
      ...slides
        .filter((note) => !note.isHeadless)
        .map((note) => ({ kind: "slideStart" as const, note })),
    ];
    layeredHeads.sort((a, b) => b.note.timingMs - a.note.timingMs);
    const approachGroups = this.prepareApproachGroups(holds, slides);

    return {
      slides,
      touches,
      fireworkTouches,
      holds,
      holdEndMap,
      noteMeta,
      approachGroups,
      layeredHeads,
      hitEffectNotes,
    };
  }

  private prepareApproachGroups(
    holds: readonly HoldStartNote[],
    slides: readonly SlideNote[],
  ): ApproachIndicatorGroup[] {
    const byTiming = new Map<string, ApproachIndicatorNote[]>();
    for (const hold of holds) {
      const key = hold.timingMs.toFixed(3);
      const group = byTiming.get(key);
      if (group) group.push({ kind: "hold", note: hold });
      else byTiming.set(key, [{ kind: "hold", note: hold }]);
    }

    for (const slide of slides) {
      if (slide.isHeadless) continue;
      const key = slide.timingMs.toFixed(3);
      const group = byTiming.get(key);
      if (group) group.push({ kind: "slide", note: slide });
      else byTiming.set(key, [{ kind: "slide", note: slide }]);
    }

    const groups: ApproachIndicatorGroup[] = [];
    for (const notes of byTiming.values()) {
      groups.push({ notes });
    }
    return groups;
  }

  private renderApproachIndicators(
    groups: readonly ApproachIndicatorGroup[],
    noteMeta: WeakMap<Note, RenderNoteMeta>,
    timing: RenderFrameTiming,
  ): void {
    const visible = this.visibleApproachIndicators;

    for (const group of groups) {
      visible.length = 0;

      for (const item of group.notes) {
        let note: HoldStartNote | SlideNote;
        let pos: { x: number; y: number; visible: boolean };
        let color: string;

        if (item.kind === "hold") {
          note = item.note;
          pos = this.noteRenderer.calculateNotePosition(
            note,
            timing.currentBeat,
            timing.currentTimeMs,
          );
          const isSimultaneous = this.getNoteMeta(noteMeta, note).simultaneousNoteCount >= 2;
          color = note.isBreakHold
            ? COLORS.BREAK_ORANGE
            : isSimultaneous
              ? COLORS.SIMULTANEOUS_GOLD
              : COLORS.TAP_PINK;
        } else {
          note = item.note;
          pos = this.slideRenderer.calculateSlideStartPosition(
            note,
            timing.currentBeat,
            timing.currentTimeMs,
          );
          const isSimultaneous = this.getNoteMeta(noteMeta, note).simultaneousNoteCount >= 2;
          color = note.isStartBreak
            ? COLORS.BREAK_ORANGE
            : isSimultaneous
              ? COLORS.SIMULTANEOUS_GOLD
              : COLORS.SLIDE_CYAN;
        }
        if (!pos.visible) continue;

        const timeDiff = note.timing - timing.currentBeat;
        if (timeDiff <= 0) continue;

        this.noteRenderer.renderApproachArc(note.position, pos.x, pos.y, color);
        visible.push({ note, position: pos });
      }

      if (visible.length >= 2) {
        const distance = Math.sqrt(
          Math.pow(visible[0].position.x - this.centerX, 2) +
            Math.pow(visible[0].position.y - this.centerY, 2),
        );

        for (let i = 0; i < visible.length; i++) {
          for (let j = i + 1; j < visible.length; j++) {
            this.noteRenderer.renderSimultaneousConnector(
              visible[i].note.position as ButtonPosition,
              visible[j].note.position as ButtonPosition,
              distance,
              COLORS.SIMULTANEOUS_GOLD,
            );
          }
        }
      }
    }
  }

  private renderSingleHold(
    hold: HoldStartNote,
    holdEndMap: ReadonlyMap<string, HoldEndNote>,
    noteMeta: WeakMap<Note, RenderNoteMeta>,
    timing: RenderFrameTiming,
  ): void {
    const startPos = this.noteRenderer.calculateNotePosition(
      hold,
      timing.currentBeat,
      timing.currentTimeMs,
    );
    if (!startPos.visible) return;

    const holdEnd = holdEndMap.get(this.getHoldEndKey(hold.position, hold.timing));
    if (!holdEnd) return;

    const endPos = this.noteRenderer.calculateNotePosition(
      holdEnd,
      timing.currentBeat,
      timing.currentTimeMs,
    );
    const meta = this.getNoteMeta(noteMeta, hold);
    const isSimultaneous = meta.simultaneousNoteCount >= 2;

    const ddrColor = this.config.ddrColorMode ? this.getDdrColor(hold.timing) : null;
    const color = getGradientColors(ddrColor, hold.isBreakHold ?? false, isSimultaneous);

    this.holdRenderer.renderHold(
      startPos,
      endPos,
      hold.position,
      color,
      hold.isEx,
      hold,
      holdEnd,
      timing.currentTimeMs,
      hold.isBreakHold ?? false,
      isSimultaneous,
      this.exScale,
    );

    if (
      this.config.showBreakIndex &&
      hold.isBreakHold &&
      meta.noExBreakIndex &&
      !hold.isEx &&
      startPos.visible
    ) {
      this.noteRenderer.renderBreakIndex(
        startPos.x,
        startPos.y,
        startPos.scale,
        meta.noExBreakIndex,
      );
    }
  }

  private renderTouchBorders(
    touches: (TouchNote | TouchHoldStartNote)[],
    noteMeta: WeakMap<Note, RenderNoteMeta>,
    currentTimeMs: number,
  ): void {
    const approachTime = BASE_APPROACH_TIME_MS / this.config.hiSpeed;

    const visibleByPos = this.visibleTouchCountByPos;
    visibleByPos.clear();
    for (const touch of touches) {
      if (touch.type === "touch-hold-start") continue;
      const timeDiff = touch.timingMs - currentTimeMs;
      if (timeDiff <= approachTime && timeDiff >= -50) {
        const pos = touch.position as string;
        visibleByPos.set(pos, (visibleByPos.get(pos) || 0) + 1);
      }
    }

    for (const touch of touches) {
      const pos = this.touchRenderer.getTouchPosition(touch.position);
      const isSimultaneous = this.getNoteMeta(noteMeta, touch).simultaneousNoteCount >= 2;
      this.touchRenderer.renderTouchBorder(
        pos,
        isSimultaneous,
        visibleByPos.get(touch.position) || 0,
      );
    }
  }

  private renderSingleSlideStart(
    slide: SlideNote,
    noteMeta: WeakMap<Note, RenderNoteMeta>,
    currentBeat: number,
    currentTimeMs: number,
  ): void {
    const pos = this.slideRenderer.calculateSlideStartPosition(slide, currentBeat, currentTimeMs);
    if (!pos.visible) return;

    const meta = this.getNoteMeta(noteMeta, slide);
    const isSimultaneous = meta.simultaneousNoteCount >= 2;
    // 接近圈由 renderApproachIndicators 统一画（在底层），这里只画星星头。
    const color = this.getStarHeadColor(slide.timing, slide.isStartBreak ?? false, isSimultaneous);

    const rotation = this.config.slideRotation
      ? this.slideRenderer.calculateStarRotation(slide, currentTimeMs)
      : 0;

    if (slide.isSplitSlide) {
      const noteSize = this.getStarNoteSize(pos.scale);
      if (slide.isEx) {
        this.slideRenderer.renderExSplitStarRing(
          pos.x,
          pos.y,
          noteSize,
          slide.isStartBreak ?? false,
          isSimultaneous,
          this.exScale,
        );
      }
      this.renderSplitSlideStar(pos.x, pos.y, noteSize, color, rotation, slide.isEx ?? false);
    } else {
      this.renderStarHead(
        pos.x,
        pos.y,
        pos.scale,
        color,
        rotation,
        slide.isEx ?? false,
        slide.isStartBreak ?? false,
        isSimultaneous,
      );
    }

    if (this.config.showBreakIndex && slide.isStartBreak && meta.noExBreakIndex && !slide.isEx) {
      this.noteRenderer.renderBreakIndex(pos.x, pos.y, pos.scale, meta.noExBreakIndex);
    }
  }

  private renderSplitSlideStar(
    x: number,
    y: number,
    size: number,
    color: string,
    rotation: number,
    isEx: boolean,
  ): void {
    this.ctx.save();

    if (rotation !== 0) {
      this.ctx.translate(x, y);
      this.ctx.rotate(rotation);
      this.ctx.translate(-x, -y);
    }

    // 黑色描边（同 drawStar 的 strokeW*3 黑边）画最底层；EX 时外圈让给 EX 环，跳过
    if (!isEx) {
      this.ctx.strokeStyle = COLORS.BLACK;
      this.ctx.lineWidth = ((2 * this.radius) / 300) * 3;
      for (const baseAngle of [-Math.PI / 2, Math.PI / 2]) {
        this.ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const angle = (i * Math.PI) / 5 + baseAngle;
          const r = i % 2 === 0 ? size : size * 0.5;
          const px = x + Math.cos(angle) * r;
          const py = y + Math.sin(angle) * r;
          if (i === 0) this.ctx.moveTo(px, py);
          else this.ctx.lineTo(px, py);
        }
        this.ctx.closePath();
        this.ctx.stroke();
      }
    }

    const drawStarHalf = (baseAngle: number) => {
      const outerR = size;
      const innerR = size * 0.5;
      const outerHoleR = outerR * 0.55;
      const innerHoleR = innerR * 0.55;

      this.ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 + baseAngle;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();

      for (let i = 9; i >= 0; i--) {
        const angle = (i * Math.PI) / 5 + baseAngle;
        const r = i % 2 === 0 ? outerHoleR : innerHoleR;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 9) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();
    };

    drawStarHalf(-Math.PI / 2);
    drawStarHalf(Math.PI / 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();

    this.ctx.strokeStyle = COLORS.WHITE;
    this.ctx.lineWidth = (2 * this.radius) / 300;

    this.ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 - Math.PI / 2;
      const r = i % 2 === 0 ? size : size * 0.5;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.closePath();
    this.ctx.stroke();

    this.ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 + Math.PI / 2;
      const r = i % 2 === 0 ? size : size * 0.5;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.closePath();
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(x, y, size * 0.15, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();

    this.ctx.restore();
  }

  private renderStarHead(
    x: number,
    y: number,
    scale: number,
    color: string,
    rotation: number,
    isEx: boolean,
    isBreak: boolean,
    isSimultaneous: boolean,
  ): void {
    const noteSize = this.getStarNoteSize(scale);

    if (isEx) {
      this.slideRenderer.renderExStarRing(x, y, noteSize, isBreak, isSimultaneous, this.exScale);
    }

    this.slideRenderer.drawStar(x, y, noteSize, color, rotation, isEx);
  }

  private get exScale(): number {
    return this.config.highlightExNotes ? 1.2 : 1;
  }

  private getStarNoteSize(scale: number): number {
    return (this.radius / 12.5) * scale * 1.15 * 1.25;
  }

  private getStarHeadColor(timing: number, isBreak: boolean, isSimultaneous: boolean): string {
    if (this.config.ddrColorMode) {
      const ddrColor = this.getDdrColor(timing);
      if (ddrColor) return ddrColor;
    }

    if (isBreak) return COLORS.BREAK_ORANGE;
    if (isSimultaneous) return COLORS.SLIDE_SIMULTANEOUS;
    if (this.config.pinkSlideStart) return COLORS.SLIDE_PINK;
    return COLORS.SLIDE_CYAN;
  }

  // 按 prepareRenderNotes 预排好的时间分层顺序（早到的 note 在上层）渲染 tap/hold/slideStart 星星头。
  private renderLayeredHeads(
    layered: LayeredNote[],
    holdEndMap: ReadonlyMap<string, HoldEndNote>,
    noteMeta: WeakMap<Note, RenderNoteMeta>,
    timing: RenderFrameTiming,
  ): void {
    for (const item of layered) {
      if (item.kind === "tap")
        this.renderSingleTap(item.note, noteMeta, timing.currentBeat, timing.currentTimeMs);
      else if (item.kind === "hold") this.renderSingleHold(item.note, holdEndMap, noteMeta, timing);
      else
        this.renderSingleSlideStart(item.note, noteMeta, timing.currentBeat, timing.currentTimeMs);
    }
  }

  private renderSingleTap(
    tap: TapNote,
    noteMeta: WeakMap<Note, RenderNoteMeta>,
    currentBeat: number,
    currentTimeMs: number,
  ): void {
    const pos = this.noteRenderer.calculateNotePosition(tap, currentBeat, currentTimeMs);
    if (!pos.visible) return;

    const meta = this.getNoteMeta(noteMeta, tap);
    const isSimultaneous = meta.simultaneousNoteCount >= 2;
    const timeDiff = tap.timing - currentBeat;

    if (timeDiff > 0) {
      this.noteRenderer.renderApproachArc(
        tap.position,
        pos.x,
        pos.y,
        this.getTapApproachColor(tap, isSimultaneous),
      );
    }

    if (tap.isStar) {
      this.renderStarTapNote(tap, pos.x, pos.y, pos.scale, isSimultaneous, currentTimeMs);
    } else {
      this.noteRenderer.renderTapNote(
        pos.x,
        pos.y,
        pos.scale,
        tap.position,
        tap.type === "break",
        isSimultaneous,
        tap.isEx ?? false,
        tap.timing,
        this.exScale,
      );
    }

    if (this.config.showBreakIndex && tap.type === "break" && meta.noExBreakIndex && !tap.isEx) {
      this.noteRenderer.renderBreakIndex(pos.x, pos.y, pos.scale, meta.noExBreakIndex);
    }
  }

  private getTapApproachColor(tap: TapNote, isSimultaneous: boolean): string {
    if (tap.type === "break") return COLORS.BREAK_ORANGE;
    if (isSimultaneous) return COLORS.SIMULTANEOUS_GOLD;
    if (tap.isStar) return COLORS.SLIDE_CYAN;
    return COLORS.TAP_PINK;
  }

  private renderStarTapNote(
    tap: TapNote,
    x: number,
    y: number,
    scale: number,
    isSimultaneous: boolean,
    currentTimeMs: number,
  ): void {
    const rotation = tap.isSpinningStar ? -currentTimeMs * STAR_TAP_ROTATION_SPEED_RAD_PER_MS : 0;

    this.renderStarHead(
      x,
      y,
      scale,
      this.getStarHeadColor(tap.timing, tap.type === "break", isSimultaneous),
      rotation,
      tap.isEx ?? false,
      tap.type === "break",
      isSimultaneous,
    );
  }

  private renderTapHitEffect(notes: Note[], currentTimeMs: number): void {
    // hitEffectNotes 按 timingMs 升序，二分定位窗口下界（currentTimeMs - DURATION），之后线性扫。
    const windowStartMs = currentTimeMs - NOTE_HIT_EFFECT_DURATION_MS;
    let lo = 0;
    let hi = notes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (notes[mid].timingMs < windowStartMs) lo = mid + 1;
      else hi = mid;
    }

    // 同 position 后到的 note 已命中时让前面的特效退场。
    const lastHitTimingByPos = new Map<ButtonPosition, number>();
    for (let i = lo; i < notes.length; i++) {
      const n = notes[i];
      if (n.timingMs > currentTimeMs) break;
      const cur = lastHitTimingByPos.get(n.position as ButtonPosition);
      if (cur === undefined || n.timingMs > cur) {
        lastHitTimingByPos.set(n.position as ButtonPosition, n.timingMs);
      }
    }

    for (let i = lo; i < notes.length; i++) {
      const note = notes[i];
      if (note.timingMs > currentTimeMs) break;
      const latest = lastHitTimingByPos.get(note.position as ButtonPosition);
      if (latest !== undefined && latest > note.timingMs) continue;

      const pos = this.noteRenderer.calculateHitEffectPosition(note, currentTimeMs);
      if (!(0 <= pos.progress && pos.progress <= 1)) continue;

      this.noteRenderer.renderTapHitEffect(
        pos.x,
        pos.y,
        note.position as ButtonPosition,
        COLORS.HIT_EFFECT_GOLD,
        pos.progress,
        note.type === "break" || (isTapNote(note) && note.isStar) ? "star" : "hexagon",
      );
    }
  }

  private renderBpmDisplay(currentBpm: number, currentBeat: number, divisor: number): void {
    const lastBpm = this.prevBpm;

    if (!this.isPlaying) {
      this.prevBpm = currentBpm;
      this.bpmChangeType = null;
      this.bpmChangeTime = 0;
    } else if (currentBpm !== lastBpm) {
      this.bpmChangeTime = Date.now();
      this.bpmChangeType = currentBpm > lastBpm ? "up" : "down";
      this.prevBpm = currentBpm;
    }

    const fontSize = Math.round((22 * this.radius) / 300);
    const smallFontSize = Math.round((16 * this.radius) / 300);
    const padding = Math.round((20 * this.radius) / 300);
    const lineGap = Math.round((4 * this.radius) / 300);

    this.ctx.save();
    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "top";
    // 纯偏移阴影代替 shadowBlur：避免 GPU 高斯模糊 pass
    this.ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
    this.ctx.shadowOffsetX = (2 * this.radius) / 300;
    this.ctx.shadowOffsetY = (2 * this.radius) / 300;

    const bpmLabel = "BPM:";
    const bpmValue = String(Math.floor(currentBpm));

    let bpmColor: string | CanvasGradient = COLORS.WHITE;
    const timeSinceChange = Date.now() - this.bpmChangeTime;
    const INSTANT_DURATION = 50;
    const FADE_DURATION = 500;

    if (this.isPlaying && timeSinceChange < FADE_DURATION && this.bpmChangeType) {
      if (this.bpmChangeType === "up") {
        const red = Math.round(255);
        const fadeProgress = Math.max(
          0,
          (timeSinceChange - INSTANT_DURATION) / (FADE_DURATION - INSTANT_DURATION),
        );
        const green = Math.round(255 * fadeProgress);
        const blue = Math.round(255 * fadeProgress);
        bpmColor = `rgb(${red}, ${green}, ${blue})`;
      } else if (this.bpmChangeType === "down") {
        const green = Math.round(255);
        const fadeProgress = Math.max(
          0,
          (timeSinceChange - INSTANT_DURATION) / (FADE_DURATION - INSTANT_DURATION),
        );
        const red = Math.round(255 * fadeProgress);
        const blue = Math.round(255 * fadeProgress);
        bpmColor = `rgb(${red}, ${green}, ${blue})`;
      }
    }

    const drawHudMetric = ({
      label,
      value,
      x,
      y,
      align,
    }: {
      label: string;
      value: string;
      x: number;
      y: number;
      align: "left" | "right";
    }) => {
      const gap = Math.round((4 * this.radius) / 300);
      const font = `bold ${fontSize}px monospace`;

      this.ctx.font = font;
      const labelWidth = this.ctx.measureText(label).width;
      const valueWidth = this.ctx.measureText(value).width;
      const groupWidth = labelWidth + gap + valueWidth;
      const startX = align === "right" ? x - groupWidth : x;

      this.ctx.fillStyle = getHudFillStyle(startX, groupWidth);
      this.ctx.textAlign = "left";
      this.ctx.fillText(label, startX, y);
      this.ctx.fillText(value, startX + labelWidth + gap, y);
    };

    const getHudFillStyle = (x: number, width: number): string | CanvasGradient => {
      if (!this.config.rainbowBpm || !this.isRoundBpm(currentBpm)) {
        return bpmColor;
      }

      const hue = ((Date.now() / 1000) * RAINBOW_SPEED_DEG_PER_SEC) % 360;
      const gradient = this.ctx.createLinearGradient(x, 0, x + width, 0);

      for (let i = 0; i <= 6; i++) {
        const h = (hue + i * 51) % 360;
        gradient.addColorStop(i / 6, `hsl(${h}, 100%, 60%)`);
      }

      return gradient;
    };

    drawHudMetric({
      label: bpmLabel,
      value: bpmValue,
      x: padding,
      y: padding,
      align: "left",
    });

    // 位置信息：当前拍数 + 分音
    this.ctx.font = `bold ${smallFontSize}px sans-serif`;
    this.ctx.fillStyle = "#94a3b8";
    this.ctx.textAlign = "left";
    this.ctx.fillText(
      `${currentBeat.toFixed(2)} [1/${divisor}]`,
      padding,
      padding + fontSize + lineGap,
    );

    if (this.fps > 0) {
      this.ctx.font = `bold ${smallFontSize}px sans-serif`;
      const fpsColor = this.fps >= 55 ? "#22c55e" : this.fps >= 30 ? "#eab308" : "#ef4444";
      this.ctx.fillStyle = fpsColor;
      this.ctx.textAlign = "right";
      this.ctx.fillText(`FPS: ${this.fps}`, this.logicalSize - padding, padding);
    }

    this.ctx.restore();
  }

  private isRoundBpm(bpm: number): boolean {
    const rounded = Math.floor(bpm);
    return rounded > 0 && 3600 % rounded === 0;
  }

  private getHoldEndKey(position: ButtonPosition, holdStartTiming: number): string {
    return `${position}:${holdStartTiming}`;
  }

  private getTimingTimeline(chart: Chart): TimingTimeline {
    if (this.timingTimelineChart !== chart) {
      this.timingTimeline = TimingTimeline.fromChart(chart);
      this.timingTimelineChart = chart;
    }
    return this.timingTimeline!;
  }

  private getDdrColor(timing: number): string | null {
    if (!this.config.ddrColorMode) return null;

    const epsilon = 0.001;
    const frac = Math.abs(timing % 1);

    if (frac < epsilon || frac > 1 - epsilon) return COLORS.DDR_RED;
    if (Math.abs(timing % 0.5) < epsilon) return COLORS.DDR_BLUE;
    if (Math.abs(timing % 0.25) < epsilon) return COLORS.DDR_YELLOW;

    if (this.config.ddrColorExtended) {
      if (Math.abs(timing % 0.125) < epsilon) return COLORS.DDR_ORANGE;
      if (Math.abs(timing % (1 / 6)) < epsilon) return COLORS.DDR_CYAN;
    }

    return COLORS.DDR_GREEN;
  }
}

export default MainRenderer;
