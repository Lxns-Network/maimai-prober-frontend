import { RenderContext, getGradientColors } from "./BaseRenderer";
import { NoteRenderer } from "./NoteRenderer";
import { SlideRenderer } from "./SlideRenderer";
import { HoldRenderer } from "./HoldRenderer";
import { TouchRenderer } from "./TouchRenderer";
import {
  Note,
  BpmEvent,
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

// tap+hold 同层、按时间分层（早的在上）的合并列表，按 timingMs 降序（晚的先画/在底）。
type LayeredNote = { kind: "tap"; note: TapNote } | { kind: "hold"; note: HoldStartNote };

interface PreparedRenderNotes {
  slides: SlideNote[];
  touches: (TouchNote | TouchHoldStartNote)[];
  holds: HoldStartNote[];
  taps: TapNote[];
  tapsAndHolds: LayeredNote[];
  hitEffectNotes: Note[];
  noteCompletionTimes: number[];
  breakCompletionTimes: number[];
  breakNoExCompletionTimes: number[];
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
    showNoteTotal: true,
    showBreakCount: true,
    showBreakIndex: false,
    rainbowBpm: false,
    ddrColorMode: false,
    ddrColorExtended: false,
    showFireworks: true,
    showHitEffect: true,
  };

  private bpm: number = 120;
  private fps: number = 0;
  private prevBpm: number = 120;
  private bpmChangeTime: number = 0;
  private bpmChangeType: "up" | "down" | null = null;
  private isPlaying: boolean = false;

  private beatDisplayInfo: {
    measure: number;
    beat: number;
    fraction: number;
    divisor: number;
  } | null = null;

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

  // simulCounts / breakIdx 是静态元数据，只依赖 chart 本身。
  // 用 notes 数组引用做缓存键——chart 切换时引用变化自然 invalidate。
  private preparedNotesRef: Note[] | null = null;
  private preparedRenderNotes: PreparedRenderNotes = {
    slides: [],
    touches: [],
    holds: [],
    taps: [],
    tapsAndHolds: [],
    hitEffectNotes: [],
    noteCompletionTimes: [],
    breakCompletionTimes: [],
    breakNoExCompletionTimes: [],
  };

  constructor(
    canvas: HTMLCanvasElement,
    initialBpm: number = 120,
    config: MainRendererConfig = {},
  ) {
    this.canvas = canvas;
    this.bpm = initialBpm;
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

  renderFrame(chart: Chart, currentBeats: number, beatsPerMeasure: number): void {
    const measure = Math.floor(currentBeats / beatsPerMeasure);
    const beatInMeasure = currentBeats - measure * beatsPerMeasure;
    const beat = Math.floor(beatInMeasure) + 1;
    const fraction = beatInMeasure - Math.floor(beatInMeasure);

    let divisor = 4;
    for (const event of chart.divisorEvents ?? []) {
      if (event.timing <= currentBeats) divisor = event.divisor;
      else break;
    }

    this.setBeatDisplayInfo(measure, beat, fraction, divisor);
    this.clear();
    this.renderJudgmentLine();
    this.renderFireworks(chart.notes, currentBeats, chart.bpmEvents);
    this.renderNotes(chart.notes, currentBeats, chart.bpmEvents);
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

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  setFps(fps: number): void {
    this.fps = fps;
  }

  setIsPlaying(isPlaying: boolean): void {
    this.isPlaying = isPlaying;
  }

  setBeatDisplayInfo(measure: number, beat: number, fraction: number, divisor: number): void {
    this.beatDisplayInfo = { measure, beat, fraction, divisor };
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

  setShowBpm(enabled: boolean): void {
    this.config.showBpm = enabled;
  }

  setShowNoteTotal(enabled: boolean): void {
    this.config.showNoteTotal = enabled;
  }

  setShowBreakCount(enabled: boolean): void {
    this.config.showBreakCount = enabled;
  }

  setShowBreakIndex(enabled: boolean): void {
    this.config.showBreakIndex = enabled;
  }

  setRainbowBpm(enabled: boolean): void {
    this.config.rainbowBpm = enabled;
  }

  setDdrColorMode(enabled: boolean): void {
    this.config.ddrColorMode = enabled;
    this.updateRenderersContext();
  }

  setDdrColorExtended(enabled: boolean): void {
    this.config.ddrColorExtended = enabled;
    this.updateRenderersContext();
  }

  setShowFireworks(enabled: boolean): void {
    this.config.showFireworks = enabled;
  }

  setShowHitEffect(enabled: boolean): void {
    this.config.showHitEffect = enabled;
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
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        this.ctx.fillRect(0, 0, s, s);
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
  renderFireworks(notes: Note[], currentBeat: number, bpmEvents: BpmEvent[] | null): void {
    if (!this.config.showFireworks) return;
    const currentTimeMs = this.beatsToMs(currentBeat, bpmEvents);
    const touches: (TouchNote | TouchHoldStartNote)[] = [];
    for (const note of notes) {
      if (isTouchNote(note) || isTouchHoldStartNote(note)) touches.push(note);
    }
    if (touches.length === 0) return;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, this.logicalSize / 2, 0, Math.PI * 2);
    this.ctx.clip();
    this.touchRenderer.renderTouchFireworks(touches, currentTimeMs);
    this.ctx.restore();
  }

  renderNotes(notes: Note[], currentBeat: number, bpmEvents: BpmEvent[] | null): void {
    const currentTimeMs = this.beatsToMs(currentBeat, bpmEvents);

    // 静态元数据：只在 chart 切换时算一次（省 ~0.4 ms CPU/帧 + ~100 KB GC 压力）
    if (this.preparedNotesRef !== notes) {
      this.calculateSimultaneousCounts(notes);
      this.assignBreakIndices(notes);
      this.preparedRenderNotes = this.prepareRenderNotes(notes);
      this.preparedNotesRef = notes;
    }

    if (this.config.showBpm) {
      this.renderBpmDisplay(currentBeat, bpmEvents);
    }

    if (this.config.showNoteTotal || this.config.showBreakCount) {
      this.renderNoteCounts(this.preparedRenderNotes, currentTimeMs);
    }

    this.ctx.save();

    const { slides, touches, holds, hitEffectNotes, tapsAndHolds } = this.preparedRenderNotes;

    for (const slide of slides) {
      this.slideRenderer.renderSlide(slide, currentBeat, currentTimeMs, "tracks");
    }

    for (const slide of slides) {
      this.slideRenderer.renderSlide(slide, currentBeat, currentTimeMs, "stars");
    }

    this.renderApproachIndicators(notes, holds, slides, currentBeat, currentTimeMs);

    this.renderSlideStarts(slides, currentBeat, currentTimeMs);

    // tap 与 hold 同层、按时间分层（早的在上）；列表在 prepareRenderNotes 预排序。
    this.renderTapsAndHolds(tapsAndHolds, notes, currentBeat, currentTimeMs);

    // touch 最上层，覆盖普通 note。
    this.renderTouchBorders(touches, currentTimeMs);

    for (const touch of touches) {
      this.touchRenderer.renderTouch(touch, currentBeat, currentTimeMs);
    }

    // 击打特效画在最上层，盖住所有 note。
    if (this.config.showHitEffect) {
      this.renderTapHitEffect(hitEffectNotes, currentTimeMs);
    }

    this.ctx.restore();
  }

  private calculateSimultaneousCounts(notes: Note[]): void {
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
        note.simultaneousNoteCount = isSimultaneous ? Math.max(2, tapCount) : tapCount;
        note.simultaneousSlideCount = slideCount;
        note.simultaneousNonTouchCount = nonTouchCount;

        if (isTouchNote(note) || isTouchHoldStartNote(note)) {
          note.simultaneousTouchCount = touchByPos.get(note.position as string) || 1;
        }
      }
    }
  }

  private assignBreakIndices(notes: Note[]): void {
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
      note.noExBreakIndex = index++;
    }
  }

  private prepareRenderNotes(notes: Note[]): PreparedRenderNotes {
    const slides: SlideNote[] = [];
    const touches: (TouchNote | TouchHoldStartNote)[] = [];
    const holds: HoldStartNote[] = [];
    const taps: TapNote[] = [];
    const hitEffectNotes: Note[] = [];
    const noteCompletionTimes: number[] = [];
    const breakCompletionTimes: number[] = [];
    const breakNoExCompletionTimes: number[] = [];

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

    for (const note of notes) {
      if (
        isTapNote(note) ||
        isHoldEndNote(note) ||
        (isSlideNote(note) && !note.isHeadless) ||
        isTouchNote(note) ||
        note.type === "touch-hold-end"
      ) {
        noteCompletionTimes.push(note.timingMs);
      }

      if (isSlideNote(note)) {
        const pathCount = note.allSlideSegments?.length ?? 1;

        for (let i = 0; i < pathCount; i++) {
          const pathDelayMs = note.allDelayMs?.[i] ?? note.delayMs ?? 0;
          const pathDurationMs = note.allDurationMs?.[i] ?? note.durationMs ?? 0;
          noteCompletionTimes.push(note.timingMs + pathDelayMs + pathDurationMs);
        }
      }

      const isBreak =
        note.type === "break" ||
        (isSlideNote(note) && note.isStartBreak) ||
        (isHoldStartNote(note) && note.isBreakHold);

      if (isBreak) {
        breakCompletionTimes.push(note.timingMs);

        if (!(note as TapNote).isEx) {
          breakNoExCompletionTimes.push(note.timingMs);
        }
      }

      if (isSlideNote(note) && note.allSlideBreaks) {
        for (let i = 0; i < note.allSlideBreaks.length; i++) {
          if (note.allSlideBreaks[i]) {
            const pathDelayMs = note.allDelayMs?.[i] ?? note.delayMs ?? 0;
            const pathDurationMs = note.allDurationMs?.[i] ?? note.durationMs ?? 0;
            breakCompletionTimes.push(note.timingMs + pathDelayMs + pathDurationMs);
          }
        }
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
    noteCompletionTimes.sort((a, b) => a - b);
    breakCompletionTimes.sort((a, b) => a - b);
    breakNoExCompletionTimes.sort((a, b) => a - b);

    // tap+hold 同层按 timingMs 降序（早到的后画/在上层，与 maimai noteSortOrder 一致）。在此
    // 预算一次（本函数被 notes 引用 memoize），渲染热路径直接迭代，省每帧的合并+排序+分配。
    const tapsAndHolds: LayeredNote[] = [
      ...taps.map((note) => ({ kind: "tap" as const, note })),
      ...holds.map((note) => ({ kind: "hold" as const, note })),
    ];
    tapsAndHolds.sort((a, b) => b.note.timingMs - a.note.timingMs);

    return {
      slides,
      touches,
      holds,
      taps,
      tapsAndHolds,
      hitEffectNotes,
      noteCompletionTimes,
      breakCompletionTimes,
      breakNoExCompletionTimes,
    };
  }

  private renderApproachIndicators(
    _allNotes: Note[],
    holds: HoldStartNote[],
    slides: SlideNote[],
    currentBeat: number,
    currentTimeMs: number,
  ): void {
    const byTiming = new Map<
      string,
      { note: Note; position: { x: number; y: number }; type: string }[]
    >();

    for (const hold of holds) {
      const pos = this.noteRenderer.calculateNotePosition(hold, currentBeat, currentTimeMs);
      if (!pos.visible) continue;

      const timeDiff = hold.timing - currentBeat;
      if (timeDiff > 0) {
        const isSimultaneous = (hold.simultaneousNoteCount ?? 0) >= 2;
        const color = hold.isBreakHold
          ? COLORS.BREAK_ORANGE
          : isSimultaneous
            ? COLORS.SIMULTANEOUS_GOLD
            : COLORS.TAP_PINK;
        this.noteRenderer.renderApproachArc(hold.position, pos.x, pos.y, color);

        const key = hold.timingMs.toFixed(3);
        if (!byTiming.has(key)) byTiming.set(key, []);
        byTiming.get(key)!.push({ note: hold, position: pos, type: "hold" });
      }
    }

    for (const slide of slides) {
      if (slide.isHeadless) continue;

      const pos = this.slideRenderer.calculateSlideStartPosition(slide, currentBeat, currentTimeMs);
      if (!pos.visible) continue;

      const timeDiff = slide.timing - currentBeat;
      if (timeDiff > 0) {
        const isSimultaneous = (slide.simultaneousNoteCount ?? 0) >= 2;
        const color = slide.isStartBreak
          ? COLORS.BREAK_ORANGE
          : isSimultaneous
            ? COLORS.SIMULTANEOUS_GOLD
            : COLORS.SLIDE_CYAN;
        this.noteRenderer.renderApproachArc(slide.position, pos.x, pos.y, color);

        const key = slide.timingMs.toFixed(3);
        if (!byTiming.has(key)) byTiming.set(key, []);
        byTiming.get(key)!.push({ note: slide, position: pos, type: "slide" });
      }
    }

    for (const [, group] of byTiming) {
      if (group.length >= 2) {
        const distance = Math.sqrt(
          Math.pow(group[0].position.x - this.centerX, 2) +
            Math.pow(group[0].position.y - this.centerY, 2),
        );

        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            this.noteRenderer.renderSimultaneousConnector(
              group[i].note.position as ButtonPosition,
              group[j].note.position as ButtonPosition,
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
    allNotes: Note[],
    currentBeat: number,
    currentTimeMs: number,
  ): void {
    const startPos = this.noteRenderer.calculateNotePosition(hold, currentBeat, currentTimeMs);
    if (!startPos.visible) return;

    const holdEnd = allNotes.find(
      (n) => isHoldEndNote(n) && n.position === hold.position && n.holdStartTiming === hold.timing,
    ) as HoldEndNote | undefined;

    if (!holdEnd) return;

    const endPos = this.noteRenderer.calculateNotePosition(holdEnd, currentBeat, currentTimeMs);
    const isSimultaneous = (hold.simultaneousNoteCount ?? 0) >= 2;

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
      currentTimeMs,
      hold.isBreakHold ?? false,
      isSimultaneous,
      this.exScale,
    );

    if (
      this.config.showBreakIndex &&
      hold.isBreakHold &&
      hold.noExBreakIndex &&
      !hold.isEx &&
      startPos.visible
    ) {
      this.noteRenderer.renderBreakIndex(
        startPos.x,
        startPos.y,
        startPos.scale,
        hold.noExBreakIndex,
      );
    }
  }

  private renderTouchBorders(
    touches: (TouchNote | TouchHoldStartNote)[],
    currentTimeMs: number,
  ): void {
    const approachTime = BASE_APPROACH_TIME_MS / this.config.hiSpeed;

    const visibleByPos = new Map<string, number>();
    for (const touch of touches) {
      if (touch.type === "touch-hold-start") continue;
      const timeDiff = touch.timingMs - currentTimeMs;
      if (timeDiff <= approachTime && timeDiff >= -50) {
        const pos = touch.position as string;
        visibleByPos.set(pos, (visibleByPos.get(pos) || 0) + 1);
      }
    }

    for (const touch of touches) {
      touch.visibleTouchCount = visibleByPos.get(touch.position) || 0;
    }

    for (const touch of touches) {
      const pos = this.touchRenderer.getTouchPosition(touch.position);
      const isSimultaneous = (touch.simultaneousNoteCount ?? 0) >= 2;
      this.touchRenderer.renderTouchBorder(touch, pos, isSimultaneous);
    }
  }

  private renderSlideStarts(slides: SlideNote[], currentBeat: number, currentTimeMs: number): void {
    for (const slide of slides) {
      if (slide.isHeadless) continue;

      const pos = this.slideRenderer.calculateSlideStartPosition(slide, currentBeat, currentTimeMs);
      if (!pos.visible) continue;

      const isSimultaneous = (slide.simultaneousNoteCount ?? 0) >= 2;

      if (slide.timing - currentBeat > 0) {
        const color = slide.isStartBreak
          ? COLORS.BREAK_ORANGE
          : isSimultaneous
            ? COLORS.SIMULTANEOUS_GOLD
            : COLORS.SLIDE_CYAN;
        this.noteRenderer.renderApproachArc(slide.position, pos.x, pos.y, color);
      }

      const color = this.getStarHeadColor(
        slide.timing,
        slide.isStartBreak ?? false,
        isSimultaneous,
      );

      const rotation = this.config.slideRotation
        ? this.slideRenderer["calculateStarRotation"](slide, currentTimeMs)
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
        this.renderSplitSlideStar(pos.x, pos.y, noteSize, color, rotation);
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

      if (this.config.showBreakIndex && slide.isStartBreak && slide.noExBreakIndex && !slide.isEx) {
        this.noteRenderer.renderBreakIndex(pos.x, pos.y, pos.scale, slide.noExBreakIndex);
      }
    }
  }

  private renderSplitSlideStar(
    x: number,
    y: number,
    size: number,
    color: string,
    rotation: number,
  ): void {
    this.ctx.save();

    if (rotation !== 0) {
      this.ctx.translate(x, y);
      this.ctx.rotate(rotation);
      this.ctx.translate(-x, -y);
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

  // 按 prepareRenderNotes 预排好的时间分层顺序（早到的 note 在上层）绘制 tap/hold。
  private renderTapsAndHolds(
    layered: LayeredNote[],
    allNotes: Note[],
    currentBeat: number,
    currentTimeMs: number,
  ): void {
    for (const item of layered) {
      if (item.kind === "tap") this.renderSingleTap(item.note, currentBeat, currentTimeMs);
      else this.renderSingleHold(item.note, allNotes, currentBeat, currentTimeMs);
    }
  }

  private renderSingleTap(tap: TapNote, currentBeat: number, currentTimeMs: number): void {
    const pos = this.noteRenderer.calculateNotePosition(tap, currentBeat, currentTimeMs);
    if (!pos.visible) return;

    const isSimultaneous = (tap.simultaneousNoteCount ?? 0) >= 2;
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

    if (this.config.showBreakIndex && tap.type === "break" && tap.noExBreakIndex && !tap.isEx) {
      this.noteRenderer.renderBreakIndex(pos.x, pos.y, pos.scale, tap.noExBreakIndex);
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

  private renderBpmDisplay(currentBeat: number, bpmEvents: BpmEvent[] | null): void {
    const currentBpm = this.getBpmAtTiming(currentBeat, bpmEvents);
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

    this.ctx.font = `bold ${fontSize}px sans-serif`;
    const bpmText = `BPM: ${Math.floor(currentBpm)}`;

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

    if (this.config.rainbowBpm && this.isRoundBpm(currentBpm)) {
      const bpmMetrics = this.ctx.measureText(bpmText);
      const hue = ((Date.now() / 1000) * RAINBOW_SPEED_DEG_PER_SEC) % 360;
      const gradient = this.ctx.createLinearGradient(padding, 0, padding + bpmMetrics.width, 0);

      for (let i = 0; i <= 6; i++) {
        const h = (hue + i * 51) % 360;
        gradient.addColorStop(i / 6, `hsl(${h}, 100%, 60%)`);
      }
      this.ctx.fillStyle = gradient;
    } else {
      this.ctx.fillStyle = bpmColor;
    }

    this.ctx.fillText(bpmText, padding, padding);

    let currentY = padding + fontSize + lineGap;

    if (this.beatDisplayInfo) {
      const { measure, beat, fraction, divisor } = this.beatDisplayInfo;

      this.ctx.font = `bold ${smallFontSize}px sans-serif`;
      this.ctx.fillStyle = "#94a3b8"; // slate-400

      const fractionStr = Math.floor(fraction * 100)
        .toString()
        .padStart(2, "0");
      const beatText = `${measure}:${beat}.${fractionStr} [1/${divisor}]`;
      this.ctx.fillText(beatText, padding, currentY);
      currentY += smallFontSize + lineGap * 2;
    }

    if (this.fps > 0) {
      this.ctx.font = `bold ${smallFontSize}px sans-serif`;
      const fpsColor = this.fps >= 55 ? "#22c55e" : this.fps >= 30 ? "#eab308" : "#ef4444";
      this.ctx.fillStyle = fpsColor;
      this.ctx.fillText(`FPS: ${this.fps}`, padding, currentY);
    }

    this.ctx.restore();
  }

  private isRoundBpm(bpm: number): boolean {
    const rounded = Math.floor(bpm);
    return rounded > 0 && 3600 % rounded === 0;
  }

  private renderNoteCounts(prepared: PreparedRenderNotes, currentTimeMs: number): void {
    const totalNotes = prepared.noteCompletionTimes.length;
    const completedNotes = this.countCompleted(prepared.noteCompletionTimes, currentTimeMs);
    const totalBreaks = prepared.breakCompletionTimes.length;
    const completedBreaks = this.countCompleted(prepared.breakCompletionTimes, currentTimeMs);
    const totalBreaksNoEx = prepared.breakNoExCompletionTimes.length;
    const completedBreaksNoEx = this.countCompleted(
      prepared.breakNoExCompletionTimes,
      currentTimeMs,
    );

    const fontSize = Math.round((22 * this.radius) / 300);
    const smallFontSize = Math.round((18 * this.radius) / 300);
    const padding = Math.round((20 * this.radius) / 300);
    const lineGap = Math.round((4 * this.radius) / 300);

    this.ctx.save();
    this.ctx.font = `bold ${fontSize}px sans-serif`;
    // 纯偏移阴影代替 shadowBlur
    this.ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
    this.ctx.shadowOffsetX = (2 * this.radius) / 300;
    this.ctx.shadowOffsetY = (2 * this.radius) / 300;

    if (this.config.showNoteTotal) {
      this.ctx.textAlign = "right";
      this.ctx.textBaseline = "top";
      this.ctx.fillStyle = COLORS.WHITE;
      this.ctx.fillText(
        `连击: ${completedNotes} / ${totalNotes}`,
        this.logicalSize - padding,
        padding,
      );
    }

    if (this.config.showBreakCount) {
      this.ctx.textAlign = "left";
      this.ctx.textBaseline = "bottom";
      this.ctx.font = `bold ${fontSize}px sans-serif`;
      this.ctx.fillStyle = COLORS.BREAK_ORANGE;
      this.ctx.fillText(
        `BREAK: ${completedBreaks} / ${totalBreaks}`,
        padding,
        this.logicalSize - padding,
      );

      this.ctx.textAlign = "right";
      this.ctx.font = `bold ${fontSize}px sans-serif`;
      this.ctx.fillStyle = "#FFA500";
      const bottomY = this.logicalSize - padding;
      this.ctx.fillText(
        `BREAK: ${completedBreaksNoEx} / ${totalBreaksNoEx}`,
        this.logicalSize - padding,
        bottomY,
      );
      this.ctx.font = `bold ${smallFontSize}px sans-serif`;
      this.ctx.fillText("无保护", this.logicalSize - padding, bottomY - fontSize - lineGap);
    }

    this.ctx.restore();
  }

  private countCompleted(sortedTimes: number[], currentTimeMs: number): number {
    let lo = 0;
    let hi = sortedTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sortedTimes[mid] <= currentTimeMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private beatsToMs(beats: number, bpmEvents: BpmEvent[] | null): number {
    if (!bpmEvents || bpmEvents.length === 0) {
      return (60000 * beats) / this.bpm;
    }

    let totalMs = 0;
    let lastBeat = 0;
    let currentBpm = bpmEvents[0].bpm;

    for (const event of bpmEvents) {
      if (event.timing >= beats) break;
      totalMs += (60000 * (event.timing - lastBeat)) / currentBpm;
      lastBeat = event.timing;
      currentBpm = event.bpm;
    }

    totalMs += (60000 * (beats - lastBeat)) / currentBpm;
    return totalMs;
  }

  private getBpmAtTiming(timing: number, bpmEvents: BpmEvent[] | null): number {
    if (!bpmEvents || bpmEvents.length === 0) {
      return this.bpm;
    }

    let currentBpm = bpmEvents[0].bpm;
    for (const event of bpmEvents) {
      if (event.timing > timing) break;
      currentBpm = event.bpm;
    }
    return currentBpm;
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
