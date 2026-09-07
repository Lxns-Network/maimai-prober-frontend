import { Note, AudioConfig } from "../../types";
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

/** 打击音调度器的配置选项。 */
export interface AudioManagerConfig {
  /** 关联的 AudioContext 上下文。 */
  audioContext: AudioContext;
  /** 音频图中的目标输出节点。 */
  outputNode: AudioNode;
  /** 打击音音频文件资源路径。 */
  answerSoundPath?: string;
  /** 初始音量大小（0 ~ 1）。 */
  initialVolume?: number;
  /** 初始发声时间偏移量（毫秒）。 */
  initialTimingOffset?: number;
}

interface ScheduledSourceEntry {
  source: AudioBufferSourceNode;
  startTime: number;
  /** 任何清理调度队列操作均强制停止播放（烘焙段跨度长，残留会与重排后的段重叠）。 */
  stopOnClear?: boolean;
}

/** 预先合并烘焙的密集音频段。 */
interface DenseRun {
  key: string;
  startMs: number;
  endMs: number;
  buffer: AudioBuffer;
}

/** 预处理产出的单音事件与密集音频段集合。 */
interface PreprocessedEvents {
  epoch: number;
  singles: PreparedAudioEvent[];
  runs: DenseRun[];
}

/** 经过时刻聚合预处理后的打击音事件。 */
export interface PreparedAudioEvent {
  /** 事件在时间轴上的绝对时刻（毫秒）。 */
  timeMs: number;
  /** 事件唯一标识键。 */
  key: string;
  /** 是否包含基础打击音（如常规音符或滑键头部）。 */
  hasBaseSound: boolean;
  /** 是否包含触摸类音符打击音。 */
  hasTouchSound: boolean;
  /** 是否包含 Hold 音符结束打击音。 */
  hasHoldEndSound: boolean;
  /** 是否包含 Touch Hold 音符结束打击音。 */
  hasTouchHoldEndSound: boolean;
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
  for (const note of notes) {
    const key = note.timingMs.toFixed(3);
    let event = eventsByKey.get(key);
    if (!event) {
      event = {
        timeMs: note.timingMs,
        key,
        hasBaseSound: false,
        hasTouchSound: false,
        hasHoldEndSound: false,
        hasTouchHoldEndSound: false,
      };
      eventsByKey.set(key, event);
    }

    switch (note.type) {
      case "slide":
        event.hasBaseSound ||= !note.isHeadless;
        break;
      case "tap":
      case "break":
      case "simultaneous":
      case "hold-start":
      case "hold-start-simultaneous":
        event.hasBaseSound = true;
        break;
      case "touch":
      case "touch-hold-start":
        event.hasTouchSound = true;
        break;
      case "hold-end":
      case "hold-end-simultaneous":
        event.hasHoldEndSound = true;
        break;
      case "touch-hold-end":
        event.hasTouchHoldEndSound = true;
        break;
    }
  }

  return [...eventsByKey.values()].sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * 正解音（打击音）调度器：仅负责 answer 音频的加载、预处理与按谱面时刻调度播放。
 * 不持有音乐播放，也不管理 React 生命周期——音乐播放与输出时钟归 usePreviewAudio 独占。
 */
export class AudioManager {
  private audioContext: AudioContext;
  private outputNode: AudioNode;
  private answerBuffer: AudioBuffer | null = null;
  private initialized = false;

  private enabled = false;
  private holdEndSoundEnabled = true;
  private touchSoundEnabled = true;
  private volume = 0.5;
  private timingOffsetMs = ANSWER_SOUND_BASE_OFFSET_MS;

  private handledEvents = new Set<string>();
  private scheduledSources = new Set<ScheduledSourceEntry>();
  private preprocessedCache = new WeakMap<readonly PreparedAudioEvent[], PreprocessedEvents>();
  /** 音效开关版本号；touch/holdEnd 开关变化时自增，使预处理密集段烘焙缓存随之失效。 */
  private toggleEpoch = 0;

  private lastScheduledTimeMs = -Infinity;

  private answerSoundPath: string;
  /** 全部正解音共享的主增益节点，用于统一控制播放音量，音量调整即时生效。 */
  private answerGainNode: GainNode;

  constructor(config: AudioManagerConfig) {
    this.audioContext = config.audioContext;
    this.outputNode = config.outputNode;
    this.answerSoundPath = config.answerSoundPath ?? "/assets/maimai/chart/answer.wav";
    this.volume = config.initialVolume ?? 0.5;
    this.timingOffsetMs = config.initialTimingOffset ?? ANSWER_SOUND_BASE_OFFSET_MS;
    this.answerGainNode = this.audioContext.createGain();
    this.answerGainNode.gain.value = this.volume;
    this.answerGainNode.connect(this.outputNode);
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
      const response = await fetch(this.answerSoundPath);
      const arrayBuffer = await response.arrayBuffer();
      this.answerBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.initialized = true;
    } catch (error) {
      console.error("AudioManager: Failed to initialize", error);
    }
  }

  /**
   * 释放调度器占用的内部资源并重置状态。
   *
   * 立即停止所有已调度或正在播放的声音节点并清空事件缓存。不会关闭外部传入的 AudioContext。
   */
  dispose(): void {
    this.clearScheduledSources(true);
    this.answerBuffer = null;
    this.initialized = false;
    this.handledEvents.clear();
  }

  /**
   * 在指定的 AudioContext 时间点播放单个打击音。
   *
   * @param when 计划播放的 AudioContext 时间戳（秒）；若为 0 或非正数则立即播放。
   * @param stopAfterMs 可选的播放截断时长（毫秒）；大于 0 时在经过该时长后强制停止。
   */
  private playAnswerSoundAt(when: number, stopAfterMs: number = 0): void {
    if (!this.enabled || !this.answerBuffer) return;

    try {
      const source = this.audioContext.createBufferSource();
      const entry: ScheduledSourceEntry = {
        source,
        startTime: when > 0 ? when : this.audioContext.currentTime,
      };

      source.buffer = this.answerBuffer;

      source.connect(this.answerGainNode);
      this.scheduledSources.add(entry);
      source.start(when);
      if (stopAfterMs > 0) {
        source.stop(entry.startTime + stopAfterMs / 1000);
      }

      source.onended = () => {
        this.scheduledSources.delete(entry);

        try {
          source.disconnect();
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
        runs.push(this.bakeRun(events, i, j));
      } else {
        for (let k = i; k <= j; k++) singles.push(events[k]);
      }
      i = j + 1;
    }

    const result: PreprocessedEvents = { epoch: this.toggleEpoch, singles, runs };
    this.preprocessedCache.set(events, result);
    return result;
  }

  /** 将指定索引区间内的密集音符离线合并烘焙为单个音频缓冲区。 */
  private bakeRun(events: readonly PreparedAudioEvent[], from: number, to: number): DenseRun {
    const tickBuffer = this.answerBuffer!;
    const startMs = events[from].timeMs;
    const endMs = events[to].timeMs;
    const sampleRate = tickBuffer.sampleRate;
    const length = Math.ceil(((endMs - startMs) / 1000) * sampleRate) + tickBuffer.length;
    const buffer = this.audioContext.createBuffer(1, length, sampleRate);
    const out = buffer.getChannelData(0);
    const tick = tickBuffer.getChannelData(0);

    for (let k = from; k <= to; k++) {
      const event = events[k];
      if (!this.shouldPlaySound(event)) continue;
      const offset = Math.round(((event.timeMs - startMs) / 1000) * sampleRate);
      const limit = Math.min(tick.length, length - offset);
      for (let s = 0; s < limit; s++) out[offset + s] += tick[s];
    }

    return { key: `run:${startMs}:${to - from + 1}`, startMs, endMs, buffer };
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

      source.connect(this.answerGainNode);
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

  /** 根据当前音效开关配置判断指定事件是否需要发出声音。 */
  private shouldPlaySound(event: PreparedAudioEvent): boolean {
    return (
      event.hasBaseSound ||
      (this.touchSoundEnabled && event.hasTouchSound) ||
      (this.holdEndSoundEnabled && event.hasHoldEndSound) ||
      (this.touchSoundEnabled && this.holdEndSoundEnabled && event.hasTouchHoldEndSound)
    );
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

    const { singles, runs } = this.getPreprocessed(events);

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

      if (!this.shouldPlaySound(event)) continue;

      if (this.handledEvents.has(event.key)) continue;

      const gapMs = i + 1 < singles.length ? singles[i + 1].timeMs - noteTime : Infinity;
      const stopAfterMs =
        gapMs < DENSE_GAP_MS ? Math.max(gapMs * 3, MIN_TICK_TAIL_MS) / normalizedPlaybackSpeed : 0;

      if (noteTime <= adjustedCurrentTime) {
        this.handledEvents.add(event.key);
        if (noteTime > adjustedLastTime) {
          this.playAnswerSoundAt(0, stopAfterMs);
        }
        continue;
      }

      this.handledEvents.add(event.key);
      const delayMs = noteTime - adjustedCurrentTime;
      const when = Math.max(
        currentContextTime,
        outputTime + delayMs / 1000 / normalizedPlaybackSpeed,
      );
      this.playAnswerSoundAt(when, stopAfterMs);
    }

    this.lastScheduledTimeMs = currentTimeMs;
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
   * @param stopStartedSources 是否同时强制停止已经起播的声音节点（默认为 false，允许已发声节点自然播放完毕）。
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

  /** 开关变更后已烘焙 run 内容失效：停掉在途 run source 并清除其 handled 键，下次调度重烘重排。 */
  private invalidateBakedRuns(): void {
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
      if (key.startsWith("run:")) this.handledEvents.delete(key);
    }
  }

  /**
   * 设置 Hold 结束打击音是否启用。
   *
   * 状态变更时会使密集段预处理缓存失效，并立即中断在途的密集段播放以便重新排期。
   */
  setHoldEndSoundEnabled(enabled: boolean): void {
    if (enabled !== this.holdEndSoundEnabled) {
      this.toggleEpoch++;
      this.invalidateBakedRuns();
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
   * 状态变更时会使密集段预处理缓存失效，并立即中断在途的密集段播放以便重新排期。
   */
  setTouchSoundEnabled(enabled: boolean): void {
    if (enabled !== this.touchSoundEnabled) {
      this.toggleEpoch++;
      this.invalidateBakedRuns();
    }
    this.touchSoundEnabled = enabled;
  }

  /** 获取触摸音符打击音是否启用。 */
  isTouchSoundEnabled(): boolean {
    return this.touchSoundEnabled;
  }

  /**
   * 设置打击音音量。
   *
   * 数值会被限制在 [0, 1] 区间内，并通过主增益节点即时生效于当前及后续播放的声音。
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.answerGainNode.gain.value = this.volume;
  }

  /** 获取当前打击音音量（0 ~ 1）。 */
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
