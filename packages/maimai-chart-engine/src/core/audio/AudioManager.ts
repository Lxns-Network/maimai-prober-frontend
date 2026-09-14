import { Note, SlideNote, AudioConfig } from "../../types";
import { ANSWER_SOUND_BASE_OFFSET_MS } from "../../utils/constants";
import { getAudioContextOutputTime } from "./audioClock";

/** 默认的音频前瞻调度时间窗口（毫秒）。 */
const SCHEDULE_LOOKAHEAD_MS = 1500;
/** 待播源上限，达到即停止本帧调度由后续帧续上，等效自适应收缩前瞻。 */
const MAX_PENDING_SOURCES = 96;
/** 判定为密集音符段的相邻事件最大时间间隔（毫秒）。事件间隔小于该值视为密集段。 */
const DENSE_GAP_MS = 40;
/** 密集段中单个音效截断保留的最小尾音时长（毫秒）。 */
const MIN_TICK_TAIL_MS = 30;
/** 触发合并的最少连续密集事件数。达到该数量时离线烘焙成单个 AudioBuffer，整段只挂一个 source。 */
const MIN_RUN_EVENTS = 16;
/** 单声部音效被后继同层音切断时的释音时长（毫秒）。长音效硬切会爆音。 */
const MONOPHONIC_RELEASE_MS = 8;

/** 打击音素材统一带前置静音（由 ANSWER_SOUND_BASE_OFFSET_MS 抵消），截断计时须跳过该段。 */
const SOUND_LEAD_MS = -ANSWER_SOUND_BASE_OFFSET_MS;

const ANSWER_SOUND_PATH = "/assets/maimai/chart/answer.wav";
const TAP_SOUND_PATH = "/assets/maimai/chart/tap.wav";
const TOUCH_SOUND_PATH = "/assets/maimai/chart/touch.wav";
const BREAK_SOUND_PATH = "/assets/maimai/chart/break.wav";
const SLIDE_SOUND_PATH = "/assets/maimai/chart/slide.wav";
const CHEER_SOUND_PATH = "/assets/maimai/chart/cheer.wav";
const EX_SOUND_PATH = "/assets/maimai/chart/ex.wav";
const FIREWORK_SOUND_PATH = "/assets/maimai/chart/firework.wav";
const BREAK_SLIDE_SOUND_PATH = "/assets/maimai/chart/break_slide.wav";
const BREAK_SLIDE_CHEER_SOUND_PATH = "/assets/maimai/chart/break_slide_cheer.wav";
const TOUCH_HOLD_SOUND_PATH = "/assets/maimai/chart/touch_hold.wav";

/** 打击音调度器的配置选项。 */
export interface AudioManagerConfig {
  /** 关联的 AudioContext 上下文。 */
  audioContext: AudioContext;
  /** 音频图中的目标输出节点。 */
  outputNode: AudioNode;
  /** 正解音层初始音量（0 ~ 1）。 */
  initialVolume?: number;
  /** 初始发声时间偏移量（毫秒）。 */
  initialTimingOffset?: number;
}

interface ScheduledSourceEntry {
  source: AudioBufferSourceNode;
  startTime: number;
  /** 烘焙段与持续音在重排时必须停止，否则会与恢复的音源重叠。 */
  stopOnClear?: boolean;
}

/** 判定音层的一次发声：音频缓冲区与其最长播放时长（毫秒），Infinity 表示播完整段。 */
interface LayerVoice {
  buffer: AudioBuffer;
  maxDurationMs: number;
  /** 被截断时补的释音时长（毫秒），0 表示直接停止。 */
  releaseMs: number;
}

/** 预先合并烘焙的密集音频段。 */
interface DenseRun {
  key: string;
  startMs: number;
  endMs: number;
  buffer: AudioBuffer;
  layer: "answer" | "judge";
}

/** 预处理产出的单音事件与密集音频段集合。 */
interface PreprocessedEvents {
  epoch: number;
  singles: PreparedAudioEvent[];
  runs: DenseRun[];
  touchHolds: PreparedAudioEvent[];
}

/** 经过时刻聚合预处理后的打击音事件。 */
export interface PreparedAudioEvent {
  /** 事件在时间轴上的绝对时刻（毫秒）。 */
  timeMs: number;
  /** 事件唯一标识键。 */
  key: string;
  /** 是否包含基础打击音（如常规音符或滑键头部）。 */
  hasBaseSound: boolean;
  /** 是否包含 Tap 系判定音。 */
  hasTapJudgeSound: boolean;
  /** 是否包含 Break 判定音；Break 系音符以该音替代 Tap 判定音。 */
  hasBreakJudgeSound: boolean;
  /** 是否包含 EX 音符判定音；非 Break 的 EX 音符以该音替代 Tap 判定音。 */
  hasExJudgeSound: boolean;
  /** 是否包含滑条起滑音效。 */
  hasSlideSound: boolean;
  /** 是否包含 Break 滑条起滑音效（与普通滑条音叠加）。 */
  hasBreakSlideSound: boolean;
  /** 是否包含 Break 滑条完成时刻的欢呼音效。 */
  hasBreakSlideCheerSound: boolean;
  /** 是否包含触摸类音符打击音。 */
  hasTouchSound: boolean;
  /** 是否包含烟花触摸判定音（替代普通触摸判定音）。 */
  hasFireworkSound: boolean;
  /** 是否包含 Touch Hold 按住期间的持续音。 */
  hasTouchHoldSound: boolean;
  /** 是否包含 Hold 音符结束打击音。 */
  hasHoldEndSound: boolean;
  /** 是否包含 Touch Hold 音符结束打击音。 */
  hasTouchHoldEndSound: boolean;
  /** 是否包含 Touch Hold 结束时刻的烟花判定音（替代结束触摸判定音）。 */
  hasTouchHoldEndFireworkSound: boolean;
  /** Touch Hold 持续音时长（毫秒）；同刻多个 Touch Hold 取最长，无持续音时为 0。 */
  touchHoldDurationMs: number;
  /** 距下一个 Break 判定音事件的时长（毫秒），无后继事件时为 Infinity。 */
  breakGapMs: number;
  /** 距下一个滑条起滑音事件的时长（毫秒），无后继事件时为 Infinity。 */
  slideGapMs: number;
  /** 距下一个 EX 判定音事件的时长（毫秒），无后继事件时为 Infinity。 */
  exGapMs: number;
  /** 距下一个烟花判定音事件的时长（毫秒），无后继事件时为 Infinity。 */
  fireworkGapMs: number;
  /** 距下一个 Break 滑条起滑音事件的时长（毫秒），无后继事件时为 Infinity。 */
  breakSlideGapMs: number;
  /** 距下一个 Break 滑条欢呼音事件的时长（毫秒），无后继事件时为 Infinity。 */
  breakSlideCheerGapMs: number;
  /** 距下一个 Touch Hold 持续音事件的时长（毫秒），无后继事件时为 Infinity。 */
  touchHoldGapMs: number;
}

/** 取滑条各路径的起滑延迟、滑行时长与 Break 标记；延迟未标注时按一拍计。 */
function slidePathsOf(
  note: SlideNote,
): readonly { delayMs: number; durationMs: number; isBreak: boolean }[] {
  const fallbackDelay = note.delayMs ?? 60000 / note.bpm;
  const count = Math.max(note.allDelayMs?.length ?? 0, note.allSlideBreaks?.length ?? 0, 1);
  const paths = [];
  for (let i = 0; i < count; i++) {
    paths.push({
      delayMs: note.allDelayMs?.[i] ?? fallbackDelay,
      durationMs: note.allDurationMs?.[i] ?? note.durationMs,
      isBreak: note.allSlideBreaks?.[i] ?? false,
    });
  }
  return paths;
}

/**
 * 将音符列表按触发时刻聚合预处理为打击音事件列表。
 *
 * 同一时刻（毫秒）的音符会被合并为单个事件并聚合其发声类型标记。
 * 返回按时间戳升序排序的事件数组；若输入为 null 或空数组则返回空数组。
 */
export function prepareAudioEvents(notes: readonly Note[] | null): PreparedAudioEvent[] {
  if (!notes || notes.length === 0) return [];

  const eventsByKey = new Map<string, PreparedAudioEvent>();
  const eventAt = (timeMs: number): PreparedAudioEvent => {
    const key = timeMs.toFixed(3);
    let event = eventsByKey.get(key);
    if (!event) {
      event = {
        timeMs,
        key,
        hasBaseSound: false,
        hasTapJudgeSound: false,
        hasBreakJudgeSound: false,
        hasExJudgeSound: false,
        hasSlideSound: false,
        hasBreakSlideSound: false,
        hasBreakSlideCheerSound: false,
        hasTouchSound: false,
        hasFireworkSound: false,
        hasTouchHoldSound: false,
        hasHoldEndSound: false,
        hasTouchHoldEndSound: false,
        hasTouchHoldEndFireworkSound: false,
        touchHoldDurationMs: 0,
        breakGapMs: Infinity,
        slideGapMs: Infinity,
        exGapMs: Infinity,
        fireworkGapMs: Infinity,
        breakSlideGapMs: Infinity,
        breakSlideCheerGapMs: Infinity,
        touchHoldGapMs: Infinity,
      };
      eventsByKey.set(key, event);
    }
    return event;
  };

  // Break > EX > Tap：Break 音符的 EX 属性不改变其判定音。
  const markHeadJudge = (event: PreparedAudioEvent, isBreak: boolean, isEx: boolean): void => {
    if (isBreak) event.hasBreakJudgeSound = true;
    else if (isEx) event.hasExJudgeSound = true;
    else event.hasTapJudgeSound = true;
  };

  for (const note of notes) {
    const event = eventAt(note.timingMs);

    switch (note.type) {
      case "slide":
        if (!note.isHeadless) {
          event.hasBaseSound = true;
          markHeadJudge(event, !!note.isStartBreak, !!note.isEx);
        }
        for (const path of slidePathsOf(note)) {
          const launch = eventAt(note.timingMs + path.delayMs);
          launch.hasSlideSound = true;
          if (path.isBreak) {
            launch.hasBreakSlideSound = true;
            const arrive = eventAt(note.timingMs + path.delayMs + path.durationMs);
            arrive.hasBreakSlideCheerSound = true;
          }
        }
        break;
      case "break":
        event.hasBaseSound = true;
        event.hasBreakJudgeSound = true;
        break;
      case "tap":
      case "simultaneous":
        event.hasBaseSound = true;
        markHeadJudge(event, false, !!note.isEx);
        break;
      case "hold-start":
      case "hold-start-simultaneous":
        event.hasBaseSound = true;
        markHeadJudge(event, !!note.isBreakHold, !!note.isEx);
        break;
      case "touch":
        if (note.hasFirework) event.hasFireworkSound = true;
        else event.hasTouchSound = true;
        break;
      case "touch-hold-start":
        event.hasTouchSound = true;
        event.hasTouchHoldSound = true;
        event.touchHoldDurationMs = Math.max(event.touchHoldDurationMs, note.durationMs);
        break;
      case "hold-end":
      case "hold-end-simultaneous":
        event.hasHoldEndSound = true;
        break;
      case "touch-hold-end":
        if (note.hasFirework) event.hasTouchHoldEndFireworkSound = true;
        else event.hasTouchHoldEndSound = true;
        break;
    }
  }

  const events = [...eventsByKey.values()].sort((a, b) => a.timeMs - b.timeMs);

  // 单声部音效层各自独占一个播放器，后一声会切断前一声；反向扫描记录各自的存活时长。
  let nextBreakMs = Infinity;
  let nextSlideMs = Infinity;
  let nextExMs = Infinity;
  let nextFireworkMs = Infinity;
  let nextBreakSlideMs = Infinity;
  let nextBreakSlideCheerMs = Infinity;
  let nextTouchHoldMs = Infinity;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    event.breakGapMs = nextBreakMs - event.timeMs;
    event.slideGapMs = nextSlideMs - event.timeMs;
    event.exGapMs = nextExMs - event.timeMs;
    event.fireworkGapMs = nextFireworkMs - event.timeMs;
    event.breakSlideGapMs = nextBreakSlideMs - event.timeMs;
    event.breakSlideCheerGapMs = nextBreakSlideCheerMs - event.timeMs;
    event.touchHoldGapMs = nextTouchHoldMs - event.timeMs;
    if (event.hasBreakJudgeSound) nextBreakMs = event.timeMs;
    if (event.hasSlideSound) nextSlideMs = event.timeMs;
    if (event.hasExJudgeSound) nextExMs = event.timeMs;
    if (event.hasFireworkSound || event.hasTouchHoldEndFireworkSound) nextFireworkMs = event.timeMs;
    if (event.hasBreakSlideSound) nextBreakSlideMs = event.timeMs;
    if (event.hasBreakSlideCheerSound) nextBreakSlideCheerMs = event.timeMs;
    if (event.hasTouchHoldSound) nextTouchHoldMs = event.timeMs;
  }

  return events;
}

/**
 * 打击音调度器：仅负责正解音与判定音层的加载、预处理与按谱面时刻调度播放。
 * 不持有音乐播放，也不管理 React 生命周期——音乐播放与输出时钟归 usePreviewAudio 独占。
 */
export class AudioManager {
  private audioContext: AudioContext;
  private outputNode: AudioNode;
  private answerBuffer: AudioBuffer | null = null;
  private tapBuffer: AudioBuffer | null = null;
  private touchBuffer: AudioBuffer | null = null;
  private breakBuffer: AudioBuffer | null = null;
  private slideBuffer: AudioBuffer | null = null;
  private cheerBuffer: AudioBuffer | null = null;
  private exBuffer: AudioBuffer | null = null;
  private fireworkBuffer: AudioBuffer | null = null;
  private breakSlideBuffer: AudioBuffer | null = null;
  private breakSlideCheerBuffer: AudioBuffer | null = null;
  private touchHoldBuffer: AudioBuffer | null = null;
  private touchHoldLoopStartSec = 0;
  private initialized = false;

  private enabled = false;
  private holdEndSoundEnabled = true;
  private touchSoundEnabled = true;
  private volume = 0.5;
  private timingOffsetMs = ANSWER_SOUND_BASE_OFFSET_MS;

  private handledEvents = new Set<string>();
  private scheduledSources = new Set<ScheduledSourceEntry>();
  private preprocessedCache = new WeakMap<readonly PreparedAudioEvent[], PreprocessedEvents>();
  /** 音效开关变化时自增，使预处理密集段烘焙缓存随之失效。 */
  private toggleEpoch = 0;

  private lastScheduledTimeMs = -Infinity;

  /** 正解音层增益节点，音量调整即时生效。 */
  private answerGainNode: GainNode;
  /** 判定音层增益节点，固定满增益。 */
  private judgeGainNode: GainNode;

  constructor(config: AudioManagerConfig) {
    this.audioContext = config.audioContext;
    this.outputNode = config.outputNode;
    this.volume = config.initialVolume ?? 0.5;
    this.timingOffsetMs = config.initialTimingOffset ?? ANSWER_SOUND_BASE_OFFSET_MS;
    this.answerGainNode = this.audioContext.createGain();
    this.answerGainNode.gain.value = this.volume;
    this.answerGainNode.connect(this.outputNode);
    this.judgeGainNode = this.audioContext.createGain();
    this.judgeGainNode.gain.value = 1;
    this.judgeGainNode.connect(this.outputNode);
  }

  /**
   * 异步加载并解码打击音音频资源。
   *
   * 成功后将实例置为已初始化状态；若已初始化则直接返回。
   * 加载或解码失败时会在控制台记录错误，不会向外部调用方抛出异常。
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const [
        answer,
        tap,
        touch,
        breakSound,
        slide,
        cheer,
        ex,
        firework,
        breakSlide,
        breakSlideCheer,
        touchHold,
      ] = await Promise.all([
        this.loadBuffer(ANSWER_SOUND_PATH),
        this.loadBuffer(TAP_SOUND_PATH),
        this.loadBuffer(TOUCH_SOUND_PATH),
        this.loadBuffer(BREAK_SOUND_PATH),
        this.loadBuffer(SLIDE_SOUND_PATH),
        this.loadBuffer(CHEER_SOUND_PATH),
        this.loadBuffer(EX_SOUND_PATH),
        this.loadBuffer(FIREWORK_SOUND_PATH),
        this.loadBuffer(BREAK_SLIDE_SOUND_PATH),
        this.loadBuffer(BREAK_SLIDE_CHEER_SOUND_PATH),
        this.loadBuffer(TOUCH_HOLD_SOUND_PATH),
      ]);
      this.answerBuffer = answer;
      this.tapBuffer = tap;
      this.touchBuffer = touch;
      this.breakBuffer = breakSound;
      this.slideBuffer = slide;
      this.cheerBuffer = cheer;
      this.exBuffer = ex;
      this.fireworkBuffer = firework;
      this.breakSlideBuffer = breakSlide;
      this.breakSlideCheerBuffer = breakSlideCheer;
      this.touchHoldBuffer = touchHold;
      const leadFrames = Math.round((SOUND_LEAD_MS / 1000) * touchHold.sampleRate);
      const fadeFrames = Math.min(
        Math.round((MONOPHONIC_RELEASE_MS / 1000) * touchHold.sampleRate),
        Math.floor((touchHold.length - leadFrames) / 2),
      );
      // 循环尾部与开头的有效采样交叉淡化；回环跳过前置静音及已经混入尾部的采样。
      for (let channel = 0; channel < touchHold.numberOfChannels; channel++) {
        const samples = touchHold.getChannelData(channel);
        for (let i = 0; i < fadeFrames; i++) {
          const gain = (i + 1) / fadeFrames;
          const tail = samples.length - fadeFrames + i;
          samples[tail] = samples[tail] * (1 - gain) + samples[leadFrames + i] * gain;
        }
      }
      this.touchHoldLoopStartSec = (leadFrames + fadeFrames) / touchHold.sampleRate;

      this.initialized = true;
    } catch (error) {
      console.error("AudioManager: Failed to initialize", error);
    }
  }

  private async loadBuffer(path: string): Promise<AudioBuffer> {
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    return await this.audioContext.decodeAudioData(arrayBuffer);
  }

  /**
   * 释放调度器占用的内部资源并重置状态。
   *
   * 立即停止所有已调度或正在播放的声音节点并清空事件缓存。不会关闭外部传入的 AudioContext。
   */
  dispose(): void {
    this.clearScheduledSources(true);
    this.answerBuffer = null;
    this.tapBuffer = null;
    this.touchBuffer = null;
    this.breakBuffer = null;
    this.slideBuffer = null;
    this.cheerBuffer = null;
    this.exBuffer = null;
    this.fireworkBuffer = null;
    this.breakSlideBuffer = null;
    this.breakSlideCheerBuffer = null;
    this.touchHoldBuffer = null;
    this.initialized = false;
    this.handledEvents.clear();
  }

  /**
   * 在指定的 AudioContext 时间点经由指定输出节点播放单个音频缓冲区。
   *
   * @param when 计划播放的 AudioContext 时间戳（秒）；若为 0 或非正数则立即播放。
   * @param stopAfterMs 可选的播放截断时长（毫秒）；大于 0 时在经过该时长后强制停止。
   */
  private playBufferAt(
    buffer: AudioBuffer,
    destination: AudioNode,
    when: number,
    stopAfterMs: number = 0,
    releaseMs: number = 0,
  ): void {
    if (!this.enabled) return;

    try {
      const source = this.audioContext.createBufferSource();
      const entry: ScheduledSourceEntry = {
        source,
        startTime: when > 0 ? when : this.audioContext.currentTime,
      };

      source.buffer = buffer;

      const stopDelaySec = (SOUND_LEAD_MS + stopAfterMs) / 1000;
      const truncated = stopAfterMs > 0 && stopDelaySec < buffer.duration;
      const releaseSec = truncated ? releaseMs / 1000 : 0;
      let releaseNode: GainNode | null = null;
      if (releaseSec > 0) {
        releaseNode = this.audioContext.createGain();
        const stopTime = entry.startTime + stopDelaySec;
        releaseNode.gain.setValueAtTime(1, Math.max(entry.startTime, stopTime - releaseSec));
        releaseNode.gain.linearRampToValueAtTime(0, stopTime);
        releaseNode.connect(destination);
      }

      source.connect(releaseNode ?? destination);
      this.scheduledSources.add(entry);
      source.start(when);
      if (stopAfterMs > 0) {
        source.stop(entry.startTime + stopDelaySec);
      }

      source.onended = () => {
        this.scheduledSources.delete(entry);

        try {
          source.disconnect();
          releaseNode?.disconnect();
        } catch {
          // 节点若已处于断开状态，Web Audio API 会抛出异常，此处静默忽略
        }
      };
    } catch (error) {
      console.error("AudioManager: Playback error", error);
    }
  }

  /**
   * 获取或计算指定事件列表的预处理集合（单音事件与密集音频段）。
   *
   * 内部使用 WeakMap 缓存；touch/holdEnd 开关变更时缓存自动失效。
   */
  private getPreprocessed(events: readonly PreparedAudioEvent[]): PreprocessedEvents {
    const cached = this.preprocessedCache.get(events);
    if (cached && cached.epoch === this.toggleEpoch) return cached;

    const singles: PreparedAudioEvent[] = [];
    const runs: DenseRun[] = [];
    let i = 0;
    while (i < events.length) {
      let j = i;
      while (j + 1 < events.length && events[j + 1].timeMs - events[j].timeMs <= DENSE_GAP_MS) j++;
      if (j - i + 1 >= MIN_RUN_EVENTS) {
        const answerRun = this.bakeLayerRun("answer", events, i, j);
        if (answerRun) runs.push(answerRun);
        const judgeRun = this.bakeLayerRun("judge", events, i, j);
        if (judgeRun) runs.push(judgeRun);
      } else {
        for (let k = i; k <= j; k++) singles.push(events[k]);
      }
      i = j + 1;
    }

    const touchHolds = events.filter(
      (event) => event.hasTouchHoldSound && event.touchHoldDurationMs > 0,
    );
    const result: PreprocessedEvents = { epoch: this.toggleEpoch, singles, runs, touchHolds };
    this.preprocessedCache.set(events, result);
    return result;
  }

  private layerVoicesOf(layer: "answer" | "judge", event: PreparedAudioEvent): LayerVoice[] {
    if (layer === "answer") {
      if (!this.shouldPlaySound(event)) return [];
      return [{ buffer: this.answerBuffer!, maxDurationMs: Infinity, releaseMs: 0 }];
    }
    const voices: LayerVoice[] = [];
    const mono = (buffer: AudioBuffer | null, maxDurationMs: number): void => {
      if (buffer) voices.push({ buffer, maxDurationMs, releaseMs: MONOPHONIC_RELEASE_MS });
    };

    // 同层多个触发源（如 Tap 头部与 Hold 松手）同刻合并为一次发声，不做叠加。
    const playTap = event.hasTapJudgeSound || (this.holdEndSoundEnabled && event.hasHoldEndSound);
    if (this.tapBuffer && playTap) {
      voices.push({ buffer: this.tapBuffer, maxDurationMs: Infinity, releaseMs: 0 });
    }
    if (event.hasExJudgeSound) mono(this.exBuffer, event.exGapMs);
    if (event.hasBreakJudgeSound) {
      // Break 判定音附带欢呼声；两者为相互独立的单声部，均随下一个 Break 切断。
      mono(this.breakBuffer, event.breakGapMs);
      mono(this.cheerBuffer, event.breakGapMs);
    }
    if (this.touchSoundEnabled) {
      const playTouch =
        event.hasTouchSound || (this.holdEndSoundEnabled && event.hasTouchHoldEndSound);
      if (this.touchBuffer && playTouch) {
        voices.push({ buffer: this.touchBuffer, maxDurationMs: Infinity, releaseMs: 0 });
      }
      const playFirework =
        event.hasFireworkSound || (this.holdEndSoundEnabled && event.hasTouchHoldEndFireworkSound);
      if (playFirework) mono(this.fireworkBuffer, event.fireworkGapMs);
    }
    if (event.hasSlideSound) mono(this.slideBuffer, event.slideGapMs);
    if (event.hasBreakSlideSound) mono(this.breakSlideBuffer, event.breakSlideGapMs);
    if (event.hasBreakSlideCheerSound) {
      mono(this.breakSlideCheerBuffer, event.breakSlideCheerGapMs);
    }
    return voices;
  }

  /** 单个发声在缓冲区内实际可用的采样数，受其最长播放时长约束。 */
  private voiceLength(voice: LayerVoice, sampleRate: number): number {
    if (!Number.isFinite(voice.maxDurationMs)) return voice.buffer.length;
    const limit = Math.round(((SOUND_LEAD_MS + voice.maxDurationMs) / 1000) * sampleRate);
    return Math.min(voice.buffer.length, Math.max(1, limit));
  }

  /** 将指定索引区间内属于某一输出层的密集音符离线合并烘焙为单个音频缓冲区；该层无发声事件时返回 null。 */
  private bakeLayerRun(
    layer: "answer" | "judge",
    events: readonly PreparedAudioEvent[],
    from: number,
    to: number,
  ): DenseRun | null {
    const startMs = events[from].timeMs;
    const endMs = events[to].timeMs;
    const sampleRate = this.audioContext.sampleRate;

    let maxTail = 0;
    for (let k = from; k <= to; k++) {
      for (const voice of this.layerVoicesOf(layer, events[k])) {
        maxTail = Math.max(maxTail, this.voiceLength(voice, sampleRate));
      }
    }
    if (maxTail === 0) return null;

    const length = Math.ceil(((endMs - startMs) / 1000) * sampleRate) + maxTail;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const out = buffer.getChannelData(0);

    for (let k = from; k <= to; k++) {
      const event = events[k];
      const offset = Math.round(((event.timeMs - startMs) / 1000) * sampleRate);
      for (const voice of this.layerVoicesOf(layer, event)) {
        const tick = voice.buffer.getChannelData(0);
        const limit = Math.min(this.voiceLength(voice, sampleRate), length - offset);
        const release =
          limit < tick.length
            ? Math.min(limit, Math.round((voice.releaseMs / 1000) * sampleRate))
            : 0;
        const fadeFrom = limit - release;
        for (let s = 0; s < limit; s++) {
          const gain = s < fadeFrom ? 1 : (limit - s) / release;
          out[offset + s] += tick[s] * gain;
        }
      }
    }

    return { key: `run:${layer}:${startMs}:${to - from + 1}`, startMs, endMs, buffer, layer };
  }

  /**
   * 播放预烘焙的密集音频段。
   *
   * @param run 密集音频段数据。
   * @param when 计划播放的 AudioContext 时间戳（秒）；若为 0 或非正数则立即播放。
   * @param offsetSec 从音频缓冲区的指定秒数偏移处起播。
   * @param playbackRate 播放速率倍率。
   */
  private playRunAt(run: DenseRun, when: number, offsetSec: number, playbackRate: number): void {
    if (!this.enabled) return;

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = run.buffer;
      source.playbackRate.value = playbackRate;
      const entry: ScheduledSourceEntry = {
        source,
        startTime: when > 0 ? when : this.audioContext.currentTime,
        stopOnClear: true,
      };

      source.connect(run.layer === "answer" ? this.answerGainNode : this.judgeGainNode);
      this.scheduledSources.add(entry);
      source.start(when, offsetSec);

      source.onended = () => {
        this.scheduledSources.delete(entry);

        try {
          source.disconnect();
        } catch {
          // 节点若已处于断开状态，Web Audio API 会抛出异常，此处静默忽略
        }
      };
    } catch (error) {
      console.error("AudioManager: Run playback error", error);
    }
  }

  /** 根据当前音效开关配置判断指定事件是否需要发出正解音。 */
  private shouldPlaySound(event: PreparedAudioEvent): boolean {
    return (
      event.hasBaseSound ||
      (this.touchSoundEnabled && (event.hasTouchSound || event.hasFireworkSound)) ||
      (this.holdEndSoundEnabled && event.hasHoldEndSound) ||
      (this.touchSoundEnabled &&
        this.holdEndSoundEnabled &&
        (event.hasTouchHoldEndSound || event.hasTouchHoldEndFireworkSound))
    );
  }

  private scheduleTouchHolds(
    events: readonly PreparedAudioEvent[],
    currentTimeMs: number,
    playbackSpeed: number,
    lookAheadMs: number,
    outputTime: number,
  ): void {
    const buffer = this.touchHoldBuffer;
    if (!this.touchSoundEnabled || !buffer) return;

    const adjustedCurrentTime = currentTimeMs - this.timingOffsetMs;
    const now = this.audioContext.currentTime;
    // 按可听时刻查找：下一段在前置静音期间，前一段仍可能发声。
    const startIndex = Math.max(
      0,
      this.lowerBoundEvents(events, adjustedCurrentTime - SOUND_LEAD_MS) - 1,
    );
    for (let i = startIndex; i < events.length; i++) {
      const event = events[i];
      if (event.timeMs > adjustedCurrentTime + lookAheadMs) break;
      if (this.scheduledSources.size >= MAX_PENDING_SOURCES) break;
      const key = `touch-hold:${event.key}`;
      if (this.handledEvents.has(key)) continue;

      const durationMs = Math.min(event.touchHoldDurationMs, event.touchHoldGapMs);
      const audibleStart =
        outputTime + (event.timeMs - adjustedCurrentTime + SOUND_LEAD_MS) / 1000 / playbackSpeed;
      const stopTime = audibleStart + durationMs / 1000 / playbackSpeed;
      if (stopTime <= now) continue;

      const startTime = audibleStart - SOUND_LEAD_MS / 1000;
      const when = Math.max(now, startTime);
      let offsetSec = when - startTime;
      if (offsetSec >= buffer.duration) {
        offsetSec =
          this.touchHoldLoopStartSec +
          ((offsetSec - buffer.duration) % (buffer.duration - this.touchHoldLoopStartSec));
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = this.touchHoldLoopStartSec;
      source.loopEnd = buffer.duration;
      const gain = this.audioContext.createGain();
      const releaseSec = MONOPHONIC_RELEASE_MS / 1000;
      const attackEnd = Math.min(when + releaseSec, (when + stopTime) / 2);
      gain.gain.setValueAtTime(0, when);
      gain.gain.linearRampToValueAtTime(1, attackEnd);
      gain.gain.setValueAtTime(1, Math.max(attackEnd, stopTime - releaseSec));
      gain.gain.linearRampToValueAtTime(0, stopTime);
      source.connect(gain);
      gain.connect(this.judgeGainNode);
      const entry: ScheduledSourceEntry = { source, startTime: when, stopOnClear: true };
      source.onended = () => {
        this.scheduledSources.delete(entry);
        source.disconnect();
        gain.disconnect();
      };
      source.start(when, offsetSec);
      source.stop(stopTime);
      this.scheduledSources.add(entry);
      this.handledEvents.add(key);
    }
  }

  /**
   * 执行单次音频调度，将时间窗口内待播放的打击音节点排期至 AudioContext。
   *
   * 调用约束与行为：
   * - `events` 必须按 `timeMs` 升序排列（内部依赖二分查找筛选时间窗口）。
   * - 应在播放期间由外部时钟或渲染帧循环定期调用。
   * - 若未启用或尚未完成初始化，调用将被静默忽略。
   *
   * @param events 预处理后的打击音事件列表（必须按 timeMs 升序排列）。
   * @param currentTimeMs 当前播放头位置（毫秒）。
   * @param playbackSpeed 播放速度倍率，必须大于 0，默认为 1。
   * @param lookAheadMs 调度前瞻窗口大小（毫秒），默认为 1500。
   * @param precomputedOutputTime 可选的预计算物理输出端 AudioContext 时间戳（秒），用于减少时钟重复计算。
   */
  schedule(
    events: readonly PreparedAudioEvent[],
    currentTimeMs: number,
    playbackSpeed: number = 1,
    lookAheadMs: number = SCHEDULE_LOOKAHEAD_MS,
    precomputedOutputTime?: number,
  ): void {
    if (!this.enabled || events.length === 0 || !this.answerBuffer) return;

    const normalizedPlaybackSpeed = Math.max(playbackSpeed, 0.001);

    const adjustedCurrentTime = currentTimeMs - this.timingOffsetMs;
    const adjustedLastTime = this.lastScheduledTimeMs - this.timingOffsetMs;
    const adjustedLookAheadTime = adjustedCurrentTime + lookAheadMs;
    const currentContextTime = this.audioContext.currentTime;
    const outputTime = precomputedOutputTime ?? getAudioContextOutputTime(this.audioContext);

    const { singles, runs, touchHolds } = this.getPreprocessed(events);
    this.scheduleTouchHolds(
      touchHolds,
      currentTimeMs,
      normalizedPlaybackSpeed,
      lookAheadMs,
      outputTime,
    );

    for (const run of runs) {
      if (run.endMs + 500 <= adjustedCurrentTime || run.startMs > adjustedLookAheadTime) continue;
      if (this.handledEvents.has(run.key)) continue;
      this.handledEvents.add(run.key);

      const startedMs = adjustedCurrentTime - run.startMs;
      if (startedMs >= 0) {
        this.playRunAt(run, 0, startedMs / 1000, normalizedPlaybackSpeed);
      } else {
        const when = Math.max(
          currentContextTime,
          outputTime + -startedMs / 1000 / normalizedPlaybackSpeed,
        );
        this.playRunAt(run, when, 0, normalizedPlaybackSpeed);
      }
    }

    const startIndex = this.lowerBoundEvents(singles, adjustedLastTime);
    for (let i = startIndex; i < singles.length; i++) {
      if (this.scheduledSources.size >= MAX_PENDING_SOURCES) break;

      const event = singles[i];
      const noteTime = event.timeMs;
      if (noteTime > adjustedLookAheadTime) break;

      if (this.handledEvents.has(event.key)) continue;

      const playAnswer = this.shouldPlaySound(event);
      const judgeVoices = this.layerVoicesOf("judge", event);
      if (!playAnswer && judgeVoices.length === 0) continue;

      const gapMs = i + 1 < singles.length ? singles[i + 1].timeMs - noteTime : Infinity;
      const denseLimitMs = gapMs < DENSE_GAP_MS ? Math.max(gapMs * 3, MIN_TICK_TAIL_MS) : Infinity;
      const answerStopMs = this.toStopAfterMs(denseLimitMs, normalizedPlaybackSpeed);

      const emit = (when: number) => {
        if (playAnswer) {
          this.playBufferAt(this.answerBuffer!, this.answerGainNode, when, answerStopMs);
        }
        for (const voice of judgeVoices) {
          const stopAfterMs = this.toStopAfterMs(voice.maxDurationMs, normalizedPlaybackSpeed);
          this.playBufferAt(voice.buffer, this.judgeGainNode, when, stopAfterMs, voice.releaseMs);
        }
      };

      if (noteTime <= adjustedCurrentTime) {
        this.handledEvents.add(event.key);
        if (noteTime > adjustedLastTime) emit(0);
        continue;
      }

      this.handledEvents.add(event.key);
      // 前置静音以 1 倍速播放，先把目标可听时刻（含静音时长）按倍速换算，再回退固定的静音墙钟时长。
      const delayMs = noteTime - adjustedCurrentTime + SOUND_LEAD_MS;
      const when = Math.max(
        currentContextTime,
        outputTime + delayMs / 1000 / normalizedPlaybackSpeed - SOUND_LEAD_MS / 1000,
      );
      emit(when);
    }

    this.lastScheduledTimeMs = currentTimeMs;
  }

  /** 将谱面时长上限换算为播放时长；无上限时返回 0，表示由 playBufferAt 播完整段。 */
  private toStopAfterMs(limitMs: number, playbackSpeed: number): number {
    return Number.isFinite(limitMs) ? limitMs / playbackSpeed : 0;
  }

  /**
   * 二分查找首个时间戳不小于指定时刻的事件索引。
   *
   * @param events 按时间升序排序的事件列表。
   * @param timeMs 目标时间戳（毫秒）。
   * @returns 首个满足 `timeMs >= 指定时刻` 的事件索引；若全部小于目标时刻则返回列表长度。
   */
  private lowerBoundEvents(events: readonly PreparedAudioEvent[], timeMs: number): number {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      // 维护左闭右开区间 [lo, hi) 不变量，查找满足 events[i].timeMs >= timeMs 的首个边界
      if (events[mid].timeMs < timeMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * 重置调度状态，用于播放跳转（Seek）或停止时清理排期队列。
   *
   * @param currentTimeMs 重置后的起始调度时间戳（毫秒）；若未传入则置为 -Infinity。
   * @param stopStartedSources 是否强制停止已起播的单次音效，默认为 false；密集段与持续音始终停止，由下次调度恢复。
   */
  reset(currentTimeMs?: number, stopStartedSources: boolean = false): void {
    this.clearScheduledSources(stopStartedSources);
    this.handledEvents.clear();
    this.lastScheduledTimeMs = currentTimeMs ?? -Infinity;
  }

  /**
   * 设置打击音功能是否启用。
   *
   * 关闭时将立即停止并清理所有已调度与正在播放的声音节点。
   */
  setEnabled(enabled: boolean): void {
    if (!enabled) {
      this.clearScheduledSources(true);
    }
    this.enabled = enabled;
  }

  /** 获取当前打击音功能是否启用。 */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** 开关变更会使烘焙段失效，并可能关闭持续音；清除排期后按新配置恢复。 */
  private invalidatePreparedSources(): void {
    for (const entry of this.scheduledSources) {
      if (!entry.stopOnClear) continue;
      try {
        entry.source.stop();
      } catch {
        // 节点若已处于停止状态，Web Audio API 会抛出异常，此处静默忽略
      }
      this.scheduledSources.delete(entry);
    }
    for (const key of this.handledEvents) {
      if (key.startsWith("run:") || key.startsWith("touch-hold:")) this.handledEvents.delete(key);
    }
  }

  /**
   * 设置 Hold 结束打击音是否启用。
   *
   * 状态变更时会使预处理缓存失效，并中断密集段与持续音，由下次调度按新配置恢复。
   */
  setHoldEndSoundEnabled(enabled: boolean): void {
    if (enabled !== this.holdEndSoundEnabled) {
      this.toggleEpoch++;
      this.invalidatePreparedSources();
    }
    this.holdEndSoundEnabled = enabled;
  }

  /** 获取 Hold 结束打击音是否启用。 */
  isHoldEndSoundEnabled(): boolean {
    return this.holdEndSoundEnabled;
  }

  /**
   * 设置触摸音符打击音是否启用。
   *
   * 状态变更时会使预处理缓存失效，并中断密集段与持续音，由下次调度按新配置恢复。
   */
  setTouchSoundEnabled(enabled: boolean): void {
    if (enabled !== this.touchSoundEnabled) {
      this.toggleEpoch++;
      this.invalidatePreparedSources();
    }
    this.touchSoundEnabled = enabled;
  }

  /** 获取触摸音符打击音是否启用。 */
  isTouchSoundEnabled(): boolean {
    return this.touchSoundEnabled;
  }

  /**
   * 设置正解音层音量，不影响判定音层。
   *
   * 数值会被限制在 [0, 1] 区间内，即时生效于当前及后续播放的声音。
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.answerGainNode.gain.value = this.volume;
  }

  /** 获取当前正解音层音量（0 ~ 1）。 */
  getVolume(): number {
    return this.volume;
  }

  /**
   * 设置打击音播放的时间偏移量。
   *
   * 正值使打击音相对谱面时刻提前发声，负值使发声延后。
   */
  setTimingOffset(offsetMs: number): void {
    this.timingOffsetMs = offsetMs;
  }

  /** 获取当前打击音发声时间偏移量（毫秒）。 */
  getTimingOffset(): number {
    return this.timingOffsetMs;
  }

  /** 获取当前打击音调度器的各项配置快照。 */
  getConfig(): AudioConfig {
    return {
      enabled: this.enabled,
      holdEndSoundEnabled: this.holdEndSoundEnabled,
      touchSoundEnabled: this.touchSoundEnabled,
      volume: this.volume,
      timingOffsetMs: this.timingOffsetMs,
    };
  }

  /** 获取调度器是否已完成音频资源初始化。 */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 清理已排期的音频节点。
   *
   * @param stopStartedSources 是否同时强制停止已开始播放的节点；为 false 时仅清理尚未起播的节点（stopOnClear 标记的节点无论该参数均会被强制停止）。
   */
  private clearScheduledSources(stopStartedSources: boolean = false): void {
    const now = this.audioContext.currentTime;

    for (const entry of this.scheduledSources) {
      if (!stopStartedSources && !entry.stopOnClear && entry.startTime <= now) {
        continue;
      }

      try {
        entry.source.stop();
      } catch {
        // 节点若已处于停止状态，Web Audio API 会抛出异常，此处静默忽略
      }

      try {
        entry.source.disconnect();
      } catch {
        // 节点若已处于断开状态，Web Audio API 会抛出异常，此处静默忽略
      }

      this.scheduledSources.delete(entry);
    }
  }
}
