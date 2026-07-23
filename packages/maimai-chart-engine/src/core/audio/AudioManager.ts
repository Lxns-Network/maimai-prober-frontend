import { Note, AudioConfig } from "../../types";
import { ANSWER_SOUND_BASE_OFFSET_MS } from "../../utils/constants";
import { getAudioContextOutputTime } from "./audioClock";

const SCHEDULE_LOOKAHEAD_MS = 1500;
// 待播源上限，达到即停止本帧调度由后续帧续上，等效自适应收缩前瞻。
const MAX_PENDING_SOURCES = 96;
// 事件间隔小于该值视为超密段。
const DENSE_GAP_MS = 40;
const MIN_TICK_TAIL_MS = 30;
// 连续超密事件达到该数量时离线烘焙成单个 AudioBuffer，整段只挂一个 source。
const MIN_RUN_EVENTS = 16;

export interface AudioManagerConfig {
  audioContext: AudioContext;
  outputNode: AudioNode;
  answerSoundPath?: string;
  initialVolume?: number;
  initialTimingOffset?: number;
}

interface ScheduledSourceEntry {
  source: AudioBufferSourceNode;
  startTime: number;
  /** 任何 clear 都必须停止（烘焙段跨度长，残留会与重排后的段重叠） */
  stopOnClear?: boolean;
}

interface DenseRun {
  key: string;
  startMs: number;
  endMs: number;
  buffer: AudioBuffer;
}

interface PreprocessedEvents {
  epoch: number;
  singles: PreparedAudioEvent[];
  runs: DenseRun[];
}

export interface PreparedAudioEvent {
  timeMs: number;
  key: string;
  hasBaseSound: boolean;
  hasTouchSound: boolean;
  hasHoldEndSound: boolean;
  hasTouchHoldEndSound: boolean;
}

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
 * 正解音（打击音）调度器：仅负责 answer 音频的加载、准备与按谱面时刻调度播放。
 * 不持有音乐播放，也不管理 React 生命周期——音乐播放与输出时钟归 usePreviewAudio 所有。
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
  /** touch/holdEnd 开关变化时自增，烘焙缓存随之失效 */
  private toggleEpoch = 0;

  private lastScheduledTimeMs = -Infinity;

  private answerSoundPath: string;
  /** 全部正解音共享的音量节点，音量调整即时生效且省一半音频图节点。 */
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

  dispose(): void {
    this.clearScheduledSources(true);
    this.answerBuffer = null;
    this.initialized = false;
    this.handledEvents.clear();
  }

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
          // 忽略已经断开的 source
        }
      };
    } catch (error) {
      console.error("AudioManager: Playback error", error);
    }
  }

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
          // 忽略已经断开的 source
        }
      };
    } catch (error) {
      console.error("AudioManager: Run playback error", error);
    }
  }

  private shouldPlaySound(event: PreparedAudioEvent): boolean {
    return (
      event.hasBaseSound ||
      (this.touchSoundEnabled && event.hasTouchSound) ||
      (this.holdEndSoundEnabled && event.hasHoldEndSound) ||
      (this.touchSoundEnabled && this.holdEndSoundEnabled && event.hasTouchHoldEndSound)
    );
  }

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

  private lowerBoundEvents(events: readonly PreparedAudioEvent[], timeMs: number): number {
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (events[mid].timeMs < timeMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  reset(currentTimeMs?: number, stopStartedSources: boolean = false): void {
    this.clearScheduledSources(stopStartedSources);
    this.handledEvents.clear();
    this.lastScheduledTimeMs = currentTimeMs ?? -Infinity;
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) {
      this.clearScheduledSources(true);
    }
    this.enabled = enabled;
  }

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
        // 忽略已停止的 source
      }
      this.scheduledSources.delete(entry);
    }
    for (const key of this.handledEvents) {
      if (key.startsWith("run:")) this.handledEvents.delete(key);
    }
  }

  setHoldEndSoundEnabled(enabled: boolean): void {
    if (enabled !== this.holdEndSoundEnabled) {
      this.toggleEpoch++;
      this.invalidateBakedRuns();
    }
    this.holdEndSoundEnabled = enabled;
  }

  isHoldEndSoundEnabled(): boolean {
    return this.holdEndSoundEnabled;
  }

  setTouchSoundEnabled(enabled: boolean): void {
    if (enabled !== this.touchSoundEnabled) {
      this.toggleEpoch++;
      this.invalidateBakedRuns();
    }
    this.touchSoundEnabled = enabled;
  }

  isTouchSoundEnabled(): boolean {
    return this.touchSoundEnabled;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.answerGainNode.gain.value = this.volume;
  }

  getVolume(): number {
    return this.volume;
  }

  setTimingOffset(offsetMs: number): void {
    this.timingOffsetMs = offsetMs;
  }

  getTimingOffset(): number {
    return this.timingOffsetMs;
  }

  getConfig(): AudioConfig {
    return {
      enabled: this.enabled,
      holdEndSoundEnabled: this.holdEndSoundEnabled,
      touchSoundEnabled: this.touchSoundEnabled,
      volume: this.volume,
      timingOffsetMs: this.timingOffsetMs,
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  private clearScheduledSources(stopStartedSources: boolean = false): void {
    const now = this.audioContext.currentTime;

    for (const entry of this.scheduledSources) {
      if (!stopStartedSources && !entry.stopOnClear && entry.startTime <= now) {
        continue;
      }

      try {
        entry.source.stop();
      } catch {
        // 忽略已经结束的 source
      }

      try {
        entry.source.disconnect();
      } catch {
        // 忽略已经断开的 source
      }

      this.scheduledSources.delete(entry);
    }
  }
}
