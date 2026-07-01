import { Note, AudioConfig } from "../../types";
import { ANSWER_SOUND_BASE_OFFSET_MS } from "../../utils/constants";
import { getAudioContextOutputTime } from "./audioClock";

const SCHEDULE_LOOKAHEAD_MS = 1500;

export interface AudioManagerConfig {
  audioContext: AudioContext;
  outputNode: AudioNode;
  answerSoundPath?: string;
  initialVolume?: number;
  initialTimingOffset?: number;
}

interface ScheduledSourceEntry {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  startTime: number;
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

  private lastScheduledTimeMs = -Infinity;

  private answerSoundPath: string;

  constructor(config: AudioManagerConfig) {
    this.audioContext = config.audioContext;
    this.outputNode = config.outputNode;
    this.answerSoundPath = config.answerSoundPath ?? "/assets/maimai/chart/answer.wav";
    this.volume = config.initialVolume ?? 0.5;
    this.timingOffsetMs = config.initialTimingOffset ?? ANSWER_SOUND_BASE_OFFSET_MS;
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

  private playAnswerSoundAt(when: number): void {
    if (!this.enabled || !this.answerBuffer) return;

    try {
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();
      const entry: ScheduledSourceEntry = {
        source,
        gainNode,
        startTime: when > 0 ? when : this.audioContext.currentTime,
      };

      source.buffer = this.answerBuffer;
      gainNode.gain.value = this.volume;

      source.connect(gainNode);
      gainNode.connect(this.outputNode);
      this.scheduledSources.add(entry);
      source.start(when);

      source.onended = () => {
        this.scheduledSources.delete(entry);

        try {
          source.disconnect();
        } catch {
          // 忽略已经断开的 source
        }

        try {
          gainNode.disconnect();
        } catch {
          // 忽略已经断开的 gain
        }
      };
    } catch (error) {
      console.error("AudioManager: Playback error", error);
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

    const startIndex = this.lowerBoundEvents(events, adjustedLastTime);
    for (let i = startIndex; i < events.length; i++) {
      const event = events[i];
      const noteTime = event.timeMs;
      if (noteTime > adjustedLookAheadTime) break;

      if (!this.shouldPlaySound(event)) continue;

      if (this.handledEvents.has(event.key)) continue;

      if (noteTime <= adjustedCurrentTime) {
        this.handledEvents.add(event.key);
        if (noteTime > adjustedLastTime) {
          this.playAnswerSoundAt(0);
        }
        continue;
      }

      this.handledEvents.add(event.key);
      const delayMs = noteTime - adjustedCurrentTime;
      const when = Math.max(
        currentContextTime,
        outputTime + delayMs / 1000 / normalizedPlaybackSpeed,
      );
      this.playAnswerSoundAt(when);
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

  setHoldEndSoundEnabled(enabled: boolean): void {
    this.holdEndSoundEnabled = enabled;
  }

  isHoldEndSoundEnabled(): boolean {
    return this.holdEndSoundEnabled;
  }

  setTouchSoundEnabled(enabled: boolean): void {
    this.touchSoundEnabled = enabled;
  }

  isTouchSoundEnabled(): boolean {
    return this.touchSoundEnabled;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
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
      if (!stopStartedSources && entry.startTime <= now) {
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

      try {
        entry.gainNode.disconnect();
      } catch {
        // 忽略已经断开的 gain
      }

      this.scheduledSources.delete(entry);
    }
  }
}
