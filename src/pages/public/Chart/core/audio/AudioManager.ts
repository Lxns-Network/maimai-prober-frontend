import { Note, AudioConfig } from '../../types';
import { ANSWER_SOUND_BASE_OFFSET_MS } from '../../utils/constants';

const SCHEDULE_LOOKAHEAD_MS = 1500;

export interface AudioManagerConfig {
  answerSoundPath?: string;
  initialVolume?: number;
  initialTimingOffset?: number;
}

interface ScheduledSourceEntry {
  source: AudioBufferSourceNode;
  startTime: number;
}

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private answerBuffer: AudioBuffer | null = null;
  private initialized = false;

  private enabled = false;
  private holdEndSoundEnabled = true;
  private touchSoundEnabled = true;
  private volume = 0.5;
  private timingOffsetMs = ANSWER_SOUND_BASE_OFFSET_MS;

  private handledEvents = new Set<string>();
  private scheduledSources = new Map<string, ScheduledSourceEntry>();

  private lastScheduledTimeMs = -Infinity;

  private answerSoundPath: string;

  constructor(config: AudioManagerConfig = {}) {
    this.answerSoundPath = config.answerSoundPath ?? '/assets/maimai/chart/answer.wav';
    this.volume = config.initialVolume ?? 0.5;
    this.timingOffsetMs = config.initialTimingOffset ?? ANSWER_SOUND_BASE_OFFSET_MS;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const AudioContextClass = window.AudioContext || 
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      
      this.audioContext = new AudioContextClass();

      const response = await fetch(this.answerSoundPath);
      const arrayBuffer = await response.arrayBuffer();
      this.answerBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      this.initialized = true;
    } catch (error) {
      console.error('AudioManager: Failed to initialize', error);
    }
  }

  async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  dispose(): void {
    this.clearScheduledSources(true);
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.answerBuffer = null;
    this.initialized = false;
    this.handledEvents.clear();
  }

  private playAnswerSoundAt(when: number, eventKey?: string): void {
    if (!this.enabled || !this.answerBuffer || !this.audioContext) return;

    try {
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      source.buffer = this.answerBuffer;
      gainNode.gain.value = this.volume;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      source.start(when);

      if (eventKey) {
        this.scheduledSources.set(eventKey, {
          source,
          startTime: when > 0 ? when : this.audioContext.currentTime,
        });
      }

      source.onended = () => {
        if (eventKey) {
          this.scheduledSources.delete(eventKey);
        }
      };
    } catch (error) {
      console.error('AudioManager: Playback error', error);
    }
  }

  private shouldPlaySound(note: Note): boolean {
    switch (note.type) {
      case 'tap':
      case 'break':
      case 'simultaneous':
      case 'hold-start':
      case 'hold-start-simultaneous':
      case 'slide':
        return true;

      case 'touch':
      case 'touch-hold-start':
        return this.touchSoundEnabled;

      case 'touch-hold-end':
        return this.touchSoundEnabled && this.holdEndSoundEnabled;

      case 'hold-end':
      case 'hold-end-simultaneous':
        return this.holdEndSoundEnabled;

      default:
        return false;
    }
  }

  private getEventKey(note: Note): string {
    return note.timingMs.toFixed(3);
  }

  schedule(
    notes: Note[] | null,
    currentTimeMs: number,
    playbackSpeed: number = 1,
    lookAheadMs: number = SCHEDULE_LOOKAHEAD_MS
  ): void {
    if (!this.enabled || !notes || !this.audioContext || !this.answerBuffer) return;

    const normalizedPlaybackSpeed = Math.max(playbackSpeed, 0.001);

    const adjustedCurrentTime = currentTimeMs - this.timingOffsetMs;
    const adjustedLastTime = this.lastScheduledTimeMs - this.timingOffsetMs;
    const adjustedLookAheadTime = adjustedCurrentTime + lookAheadMs;

    for (const note of notes) {
      if (!this.shouldPlaySound(note)) continue;

      const eventKey = this.getEventKey(note);
      if (this.handledEvents.has(eventKey)) continue;

      const noteTime = note.timingMs;
      if (noteTime > adjustedLookAheadTime) continue;

      if (noteTime <= adjustedCurrentTime) {
        this.handledEvents.add(eventKey);
        if (noteTime > adjustedLastTime) {
          this.playAnswerSoundAt(0, eventKey);
        }
        continue;
      }

      this.handledEvents.add(eventKey);
      const delayMs = noteTime - adjustedCurrentTime;
      const when = this.audioContext.currentTime + delayMs / 1000 / normalizedPlaybackSpeed;
      this.playAnswerSoundAt(when, eventKey);
    }

    this.lastScheduledTimeMs = currentTimeMs;
  }

  reset(currentTimeMs?: number): void {
    this.clearScheduledSources();
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
    const now = this.audioContext?.currentTime ?? 0;

    for (const [eventKey, entry] of this.scheduledSources.entries()) {
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

      this.scheduledSources.delete(eventKey);
    }
  }
}

export default AudioManager;
