import { RenderContext } from './BaseRenderer';
import { NoteRenderer } from './NoteRenderer';
import { SlideRenderer } from './SlideRenderer';
import { HoldRenderer } from './HoldRenderer';
import { TouchRenderer } from './TouchRenderer';
import {
  Note,
  BpmEvent,
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
} from '../types';
import {
  BASE_APPROACH_TIME_MS,
  HI_SPEED_DEFAULT,
  HI_SPEED_CONVERSION_FACTOR,
  BUTTON_MARKER_RATIO,
  JUDGMENT_LINE_WIDTH_RATIO,
  COLORS,
  RAINBOW_SPEED_DEG_PER_SEC,
} from '../utils/constants';

export class MainRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private centerX: number = 0;
  private centerY: number = 0;
  private radius: number = 0;
  private logicalSize: number = 0;

  private config: RendererConfig = {
    hiSpeed: HI_SPEED_DEFAULT * HI_SPEED_CONVERSION_FACTOR,
    mirrorMode: 'none',
    highlightExNotes: false,
    normalColorBreakSlide: false,
    pinkSlideStart: false,
    slideRotation: false,
    judgmentLineDesign: 'simple',
    showBpm: true,
    showNoteTotal: true,
    showBreakCount: true,
    showBreakIndex: false,
    rainbowBpm: false,
    ddrColorMode: false,
    ddrColorExtended: false,
  };

  private bpm: number = 120;
  private fps: number = 0;
  private prevBpm: number = 120;
  private bpmChangeTime: number = 0;
  private bpmChangeType: 'up' | 'down' | null = null;
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

  constructor(canvas: HTMLCanvasElement, initialBpm: number = 120) {
    this.canvas = canvas;
    this.bpm = initialBpm;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get 2D canvas context');
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
    this.holdRenderer = new HoldRenderer(context, this.noteRenderer);
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
    this.sensorImage.src = '/assets/maimai/chart/sensor.webp';
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;

    this.canvas.style.width = '';
    this.canvas.style.height = '';

    const rect = parent.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    const dpr = window.devicePixelRatio || 1;

    this.logicalSize = size;

    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.centerX = size / 2;
    this.centerY = size / 2;
    this.radius = size * 0.45;

    if (this.noteRenderer) {
      this.updateRenderersContext();
    }
  }

  setHiSpeed(hiSpeed: number): void {
    if (hiSpeed >= 3 && hiSpeed <= 9) {
      this.config.hiSpeed = hiSpeed * HI_SPEED_CONVERSION_FACTOR;
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

  setMirrorMode(mode: 'none' | 'horizontal' | 'vertical' | 'rotate180'): void {
    this.config.mirrorMode = mode;
    this.updateRenderersContext();
  }

  setJudgmentLineDesign(design: 'simple' | 'noLine' | 'blind' | 'sensor'): void {
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

  clear(): void {
    if (this.config.judgmentLineDesign === 'sensor') {
      this.ctx.fillStyle = '#000000';
      this.ctx.fillRect(0, 0, this.logicalSize, this.logicalSize);
    } else {
      this.ctx.clearRect(0, 0, this.logicalSize, this.logicalSize);
    }
  }

  renderJudgmentLine(): void {
    if (this.config.judgmentLineDesign === 'blind') {
      return;
    }

    this.ctx.save();

    if (this.config.judgmentLineDesign === 'sensor' && 
        this.sensorImage && 
        this.sensorImage.complete) {
      const imgSize = this.logicalSize - 10;
      const imgX = this.centerX - imgSize / 2;
      const imgY = this.centerY - imgSize / 2 + 8;
      this.ctx.drawImage(this.sensorImage, imgX, imgY, imgSize, imgSize);
    }

    if (this.config.judgmentLineDesign === 'simple' || 
        this.config.judgmentLineDesign === 'sensor') {
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

  renderNotes(notes: Note[], currentBeat: number, bpmEvents: BpmEvent[] | null): void {
    const currentTimeMs = this.beatsToMs(currentBeat, bpmEvents);

    this.calculateSimultaneousCounts(notes);

    this.assignBreakIndices(notes);

    if (this.config.showBpm) {
      this.renderBpmDisplay(currentBeat, bpmEvents);
    }

    if (this.config.showNoteTotal || this.config.showBreakCount) {
      this.renderNoteCounts(notes, currentTimeMs);
    }

    this.ctx.save();

    const slides: SlideNote[] = [];
    const touches: (TouchNote | TouchHoldStartNote)[] = [];
    const holds: HoldStartNote[] = [];
    const taps: TapNote[] = [];

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

    for (const slide of slides) {
      this.slideRenderer.renderSlide(slide, currentBeat, currentTimeMs, false);
    }

    for (const slide of slides) {
      this.slideRenderer.renderSlide(slide, currentBeat, currentTimeMs, true);
    }

    this.renderApproachIndicators(notes, holds, slides, currentBeat, currentTimeMs);

    this.renderHoldNotes(holds, notes, currentBeat, currentTimeMs);

    this.renderTouchBorders(touches, currentTimeMs);

    for (const touch of touches) {
      this.touchRenderer.renderTouch(touch, currentBeat, currentTimeMs);
    }

    this.renderSlideStarts(slides, currentBeat, currentTimeMs);

    this.renderTapNotes(taps, currentBeat, currentTimeMs);

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
      const tapCount = group.filter(n => !isTapNote(n) || n.type !== 'break').length;
      const breakCount = group.filter(n => 
        n.type === 'break' || 
        (isSlideNote(n) && n.isStartBreak) ||
        (isHoldStartNote(n) && n.isBreakHold)
      ).length;
      const slideCount = group.filter(n => isSlideNote(n)).length;
      const nonTouchCount = group.filter(n => 
        !isTouchNote(n) && 
        !isTouchHoldStartNote(n) &&
        n.type !== 'break'
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
      .filter(n => 
        (n.type === 'break' || 
         (isSlideNote(n) && n.isStartBreak) ||
         (isHoldStartNote(n) && n.isBreakHold)) &&
        !(n as TapNote).isEx
      )
      .sort((a, b) => a.timingMs - b.timingMs);

    let index = 1;
    for (const note of breakNotes) {
      note.noExBreakIndex = index++;
    }
  }

  private renderApproachIndicators(
    _allNotes: Note[],
    holds: HoldStartNote[],
    slides: SlideNote[],
    currentBeat: number,
    currentTimeMs: number
  ): void {
    const byTiming = new Map<string, { note: Note; position: { x: number; y: number }; type: string }[]>();

    for (const hold of holds) {
      const pos = this.noteRenderer.calculateNotePosition(hold, currentBeat, currentTimeMs);
      if (!pos.visible) continue;

      const timeDiff = hold.timing - currentBeat;
      if (timeDiff > 0) {
        const isSimultaneous = (hold.simultaneousNoteCount ?? 0) >= 2;
        const color = hold.isBreakHold ? COLORS.BREAK_ORANGE : 
                      isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TAP_PINK;
        this.noteRenderer.renderApproachArc(hold.position, pos.x, pos.y, color);

        const key = hold.timingMs.toFixed(3);
        if (!byTiming.has(key)) byTiming.set(key, []);
        byTiming.get(key)!.push({ note: hold, position: pos, type: 'hold' });
      }
    }

    for (const slide of slides) {
      const pos = this.slideRenderer.calculateSlideStartPosition(slide, currentBeat, currentTimeMs);
      if (!pos.visible) continue;

      const timeDiff = slide.timing - currentBeat;
      if (timeDiff > 0) {
        const isSimultaneous = (slide.simultaneousNoteCount ?? 0) >= 2;
        const color = slide.isStartBreak ? COLORS.BREAK_ORANGE :
                      isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.SLIDE_CYAN;
        this.noteRenderer.renderApproachArc(slide.position, pos.x, pos.y, color);

        const key = slide.timingMs.toFixed(3);
        if (!byTiming.has(key)) byTiming.set(key, []);
        byTiming.get(key)!.push({ note: slide, position: pos, type: 'slide' });
      }
    }

    for (const [, group] of byTiming) {
      if (group.length >= 2) {
        const distance = Math.sqrt(
          Math.pow(group[0].position.x - this.centerX, 2) +
          Math.pow(group[0].position.y - this.centerY, 2)
        );

        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            this.noteRenderer.renderSimultaneousConnector(
              group[i].note.position as ButtonPosition,
              group[j].note.position as ButtonPosition,
              distance,
              COLORS.SIMULTANEOUS_GOLD
            );
          }
        }
      }
    }
  }

  private renderHoldNotes(
    holds: HoldStartNote[],
    allNotes: Note[],
    currentBeat: number,
    currentTimeMs: number
  ): void {
    for (const hold of holds) {
      const startPos = this.noteRenderer.calculateNotePosition(hold, currentBeat, currentTimeMs);
      if (!startPos.visible) continue;

      const holdEnd = allNotes.find(n =>
        isHoldEndNote(n) &&
        n.position === hold.position &&
        n.holdStartTiming === hold.timing
      ) as HoldEndNote | undefined;

      if (!holdEnd) continue;

      const endPos = this.noteRenderer.calculateNotePosition(holdEnd, currentBeat, currentTimeMs);
      const isSimultaneous = (hold.simultaneousNoteCount ?? 0) >= 2;

      const ddrColor = this.config.ddrColorMode ? this.getDdrColor(hold.timing) : null;
      const color = ddrColor ?? (
        hold.isBreakHold ? COLORS.BREAK_ORANGE :
        isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TAP_PINK
      );

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
        this.config.highlightExNotes ? 1.2 : 1
      );

      if (this.config.showBreakIndex && hold.isBreakHold && hold.noExBreakIndex && !hold.isEx && startPos.visible) {
        this.noteRenderer.renderBreakIndex(startPos.x, startPos.y, startPos.scale, hold.noExBreakIndex);
      }
    }
  }

  private renderTouchBorders(
    touches: (TouchNote | TouchHoldStartNote)[],
    currentTimeMs: number
  ): void {
    const approachTime = BASE_APPROACH_TIME_MS / this.config.hiSpeed;

    const visibleByPos = new Map<string, number>();
    for (const touch of touches) {
      if (touch.type === 'touch-hold-start') continue;
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

  private renderSlideStarts(
    slides: SlideNote[],
    currentBeat: number,
    currentTimeMs: number
  ): void {
    for (const slide of slides) {
      const pos = this.slideRenderer.calculateSlideStartPosition(slide, currentBeat, currentTimeMs);
      if (!pos.visible) continue;

      const isSimultaneous = (slide.simultaneousNoteCount ?? 0) >= 2;
      const noteSize = this.radius / 12.5 * pos.scale * 1.15 * 1.25;

      if (slide.timing - currentBeat > 0) {
        const color = slide.isStartBreak ? COLORS.BREAK_ORANGE :
                      isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.SLIDE_CYAN;
        this.noteRenderer.renderApproachArc(slide.position, pos.x, pos.y, color);
      }

      if (slide.isEx) {
        const scale = this.config.highlightExNotes ? 1.2 : 1;
        if (slide.isSplitSlide) {
          this.slideRenderer.renderExSplitStarRing(
            pos.x, pos.y, noteSize, 
            slide.isStartBreak ?? false, isSimultaneous, scale
          );
        } else {
          this.slideRenderer.renderExStarRing(
            pos.x, pos.y, noteSize, 
            slide.isStartBreak ?? false, isSimultaneous, scale
          );
        }
      }

      const ddrColor = this.config.ddrColorMode ? this.getDdrColor(slide.timing) : null;
      const color = ddrColor ?? (
        slide.isStartBreak ? COLORS.BREAK_ORANGE :
        isSimultaneous ? COLORS.SLIDE_SIMULTANEOUS :
        this.config.pinkSlideStart ? COLORS.SLIDE_PINK : COLORS.SLIDE_CYAN
      );

      const rotation = this.config.slideRotation 
        ? this.slideRenderer['calculateStarRotation'](slide, currentTimeMs)
        : 0;

      if (slide.isSplitSlide) {
        this.renderSplitSlideStar(pos.x, pos.y, noteSize, color, rotation);
      } else {
        this.slideRenderer.drawStar(pos.x, pos.y, noteSize, color, rotation);
      }

      if (this.config.showBreakIndex && slide.isStartBreak && slide.noExBreakIndex && !slide.isEx) {
        this.noteRenderer.renderBreakIndex(pos.x, pos.y, pos.scale, slide.noExBreakIndex);
      }
    }
  }

  private renderSplitSlideStar(x: number, y: number, size: number, color: string, rotation: number): void {
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
        const angle = (i * Math.PI / 5) + baseAngle;
        const r = i % 2 === 0 ? outerR : innerR;
        const px = x + Math.cos(angle) * r;
        const py = y + Math.sin(angle) * r;
        if (i === 0) this.ctx.moveTo(px, py);
        else this.ctx.lineTo(px, py);
      }
      this.ctx.closePath();

      for (let i = 9; i >= 0; i--) {
        const angle = (i * Math.PI / 5) + baseAngle;
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
    this.ctx.lineWidth = 2 * this.radius / 300;

    this.ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI / 5) - Math.PI / 2;  
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
      const angle = (i * Math.PI / 5) + Math.PI / 2;
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

  private renderTapNotes(
    taps: TapNote[],
    currentBeat: number,
    currentTimeMs: number
  ): void {
    for (const tap of taps) {
      const pos = this.noteRenderer.calculateNotePosition(tap, currentBeat, currentTimeMs);
      if (!pos.visible) continue;

      const isSimultaneous = (tap.simultaneousNoteCount ?? 0) >= 2;
      const timeDiff = tap.timing - currentBeat;

      if (timeDiff > 0) {
        const color = tap.type === 'break' ? COLORS.BREAK_ORANGE :
                      isSimultaneous ? COLORS.SIMULTANEOUS_GOLD : COLORS.TAP_PINK;
        this.noteRenderer.renderApproachArc(tap.position, pos.x, pos.y, color);
      }

      this.noteRenderer.renderTapNote(
        pos.x,
        pos.y,
        pos.scale,
        tap.type === 'break',
        isSimultaneous,
        tap.isEx ?? false,
        tap.timing,
        this.config.highlightExNotes ? 1.2 : 1
      );

      if (this.config.showBreakIndex && tap.type === 'break' && tap.noExBreakIndex && !tap.isEx) {
        this.noteRenderer.renderBreakIndex(pos.x, pos.y, pos.scale, tap.noExBreakIndex);
      }
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
      this.bpmChangeType = currentBpm > lastBpm ? 'up' : 'down';
      this.prevBpm = currentBpm;
    }

    const fontSize = Math.round(22 * this.radius / 300);
    const smallFontSize = Math.round(16 * this.radius / 300);
    const padding = Math.round(20 * this.radius / 300);
    const lineGap = Math.round(4 * this.radius / 300);

    this.ctx.save();
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    this.ctx.shadowBlur = 4 * this.radius / 300;
    this.ctx.shadowOffsetX = 2 * this.radius / 300;
    this.ctx.shadowOffsetY = 2 * this.radius / 300;

    this.ctx.font = `bold ${fontSize}px sans-serif`;
    const bpmText = `BPM: ${Math.floor(currentBpm)}`;

    let bpmColor: string | CanvasGradient = COLORS.WHITE;
    const timeSinceChange = Date.now() - this.bpmChangeTime;
    const INSTANT_DURATION = 50;
    const FADE_DURATION = 500;

    if (this.isPlaying && timeSinceChange < FADE_DURATION && this.bpmChangeType) {
      if (this.bpmChangeType === 'up') {
        const red = Math.round(255);
        const fadeProgress = Math.max(0, (timeSinceChange - INSTANT_DURATION) / (FADE_DURATION - INSTANT_DURATION));
        const green = Math.round(255 * fadeProgress);
        const blue = Math.round(255 * fadeProgress);
        bpmColor = `rgb(${red}, ${green}, ${blue})`;
      } else if (this.bpmChangeType === 'down') {
        const green = Math.round(255);
        const fadeProgress = Math.max(0, (timeSinceChange - INSTANT_DURATION) / (FADE_DURATION - INSTANT_DURATION));
        const red = Math.round(255 * fadeProgress);
        const blue = Math.round(255 * fadeProgress);
        bpmColor = `rgb(${red}, ${green}, ${blue})`;
      }
    }

    if (this.config.rainbowBpm && this.isRoundBpm(currentBpm)) {
      const bpmMetrics = this.ctx.measureText(bpmText);
      const hue = (Date.now() / 1000 * RAINBOW_SPEED_DEG_PER_SEC) % 360;
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
      this.ctx.fillStyle = '#94a3b8'; // slate-400
      
      const fractionStr = Math.floor(fraction * 100).toString().padStart(2, '0');
      const beatText = `${measure}:${beat}.${fractionStr} [1/${divisor}]`;
      this.ctx.fillText(beatText, padding, currentY);
      currentY += smallFontSize + lineGap * 2;
    }

    if (this.fps > 0) {
      this.ctx.font = `bold ${smallFontSize}px sans-serif`;
      const fpsColor = this.fps >= 55 ? '#22c55e' : this.fps >= 30 ? '#eab308' : '#ef4444';
      this.ctx.fillStyle = fpsColor;
      this.ctx.fillText(`FPS: ${this.fps}`, padding, currentY);
    }

    this.ctx.restore();
  }

  private isRoundBpm(bpm: number): boolean {
    const rounded = Math.floor(bpm);
    return rounded > 0 && 3600 % rounded === 0;
  }

  private renderNoteCounts(notes: Note[], currentTimeMs: number): void {
    let totalNotes = 0;
    let completedNotes = 0;
    let totalBreaks = 0;
    let completedBreaks = 0;
    let totalBreaksNoEx = 0;
    let completedBreaksNoEx = 0;

    for (const note of notes) {
      const isCompleted = note.timingMs <= currentTimeMs;

      if (isTapNote(note) || 
          (isHoldEndNote(note)) ||
          isSlideNote(note) ||
          isTouchNote(note) ||
          (note.type === 'touch-hold-end')) {
        totalNotes++;
        if (isCompleted) completedNotes++;
      }

      if (isSlideNote(note)) {
        const pathCount = note.allSlideSegments?.length ?? 1;
        totalNotes += pathCount;
        
        for (let i = 0; i < pathCount; i++) {
          const pathDelayMs = note.allDelayMs?.[i] ?? note.delayMs ?? 0;
          const pathDurationMs = note.allDurationMs?.[i] ?? note.durationMs ?? 0;
          if (currentTimeMs >= note.timingMs + pathDelayMs + pathDurationMs) {
            completedNotes++;
          }
        }
      }

      const isBreak = note.type === 'break' || 
                      (isSlideNote(note) && note.isStartBreak) ||
                      (isHoldStartNote(note) && note.isBreakHold);
      
      if (isBreak) {
        totalBreaks++;
        if (isCompleted) completedBreaks++;
        
        if (!(note as TapNote).isEx) {
          totalBreaksNoEx++;
          if (isCompleted) completedBreaksNoEx++;
        }
      }

      if (isSlideNote(note) && note.allSlideBreaks) {
        for (let i = 0; i < note.allSlideBreaks.length; i++) {
          if (note.allSlideBreaks[i]) {
            totalBreaks++;
            const pathDelayMs = note.allDelayMs?.[i] ?? note.delayMs ?? 0;
            const pathDurationMs = note.allDurationMs?.[i] ?? note.durationMs ?? 0;
            if (currentTimeMs >= note.timingMs + pathDelayMs + pathDurationMs) {
              completedBreaks++;
            }
          }
        }
      }
    }

    const fontSize = Math.round(22 * this.radius / 300);
    const smallFontSize = Math.round(18 * this.radius / 300);
    const padding = Math.round(20 * this.radius / 300);
    const lineGap = Math.round(4 * this.radius / 300);

    this.ctx.save();
    this.ctx.font = `bold ${fontSize}px sans-serif`;
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    this.ctx.shadowBlur = 4 * this.radius / 300;
    this.ctx.shadowOffsetX = 2 * this.radius / 300;
    this.ctx.shadowOffsetY = 2 * this.radius / 300;

    if (this.config.showNoteTotal) {
      this.ctx.textAlign = 'right';
      this.ctx.textBaseline = 'top';
      this.ctx.fillStyle = COLORS.WHITE;
      this.ctx.fillText(`连击: ${completedNotes} / ${totalNotes}`, this.logicalSize - padding, padding);
    }

    if (this.config.showBreakCount) {
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'bottom';
      this.ctx.font = `bold ${fontSize}px sans-serif`;
      this.ctx.fillStyle = COLORS.BREAK_ORANGE;
      this.ctx.fillText(`BREAK: ${completedBreaks} / ${totalBreaks}`, padding, this.logicalSize - padding);

      this.ctx.textAlign = 'right';
      this.ctx.font = `bold ${fontSize}px sans-serif`;
      this.ctx.fillStyle = '#FFA500';
      const bottomY = this.logicalSize - padding;
      this.ctx.fillText(`BREAK: ${completedBreaksNoEx} / ${totalBreaksNoEx}`, this.logicalSize - padding, bottomY);
      this.ctx.font = `bold ${smallFontSize}px sans-serif`;
      this.ctx.fillText('无保护', this.logicalSize - padding, bottomY - fontSize - lineGap);
    }

    this.ctx.restore();
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
      if (Math.abs(timing % (1/6)) < epsilon) return COLORS.DDR_CYAN;
    }

    return COLORS.DDR_GREEN;
  }
}

export default MainRenderer;
