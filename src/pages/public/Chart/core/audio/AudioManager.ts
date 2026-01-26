import { Note, AudioConfig } from '../../types';
import { ANSWER_SOUND_BASE_OFFSET_MS } from '../../utils/constants';

export interface AudioManagerConfig {
  answerSoundPath?: string;
  initialVolume?: number;
  initialTimingOffset?: number;
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

  private playedNotes = new Set<string>();
  
  private lastTickTimeMs = -Infinity;

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
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.answerBuffer = null;
    this.initialized = false;
    this.playedNotes.clear();
  }

  private playAnswerSound(): void {
    if (!this.enabled || !this.answerBuffer || !this.audioContext) return;

    try {
      const source = this.audioContext.createBufferSource();
      const gainNode = this.audioContext.createGain();

      source.buffer = this.answerBuffer;
      gainNode.gain.value = this.volume;

      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      source.start(0);
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

  private getNoteKey(note: Note): string {
    return `${note.type}-${note.timing}-${note.position}`;
  }

  tick(notes: Note[] | null, currentTimeMs: number): void {
    if (!this.enabled || !notes) return;

    const adjustedCurrentTime = currentTimeMs - this.timingOffsetMs;
    const adjustedLastTime = this.lastTickTimeMs - this.timingOffsetMs;

    let shouldPlay = false;

    for (const note of notes) {
      const noteKey = this.getNoteKey(note);

      if (this.playedNotes.has(noteKey)) continue;

      const noteTime = note.timingMs;
      
      if (noteTime > adjustedLastTime && noteTime <= adjustedCurrentTime) {
        if (this.shouldPlaySound(note)) {
          shouldPlay = true;
          this.playedNotes.add(noteKey);
        }
      }
    }

    this.lastTickTimeMs = currentTimeMs;

    if (shouldPlay) {
      this.playAnswerSound();
    }
  }

  reset(currentTimeMs?: number): void {
    this.playedNotes.clear();
    // 如果提供了当前时间，使用它作为 lastTickTimeMs，避免播放之前的 note 音效
    // 如果没有提供，使用 -Infinity（从头开始播放的情况）
    this.lastTickTimeMs = currentTimeMs ?? -Infinity;
  }

  setEnabled(enabled: boolean): void {
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
}

export default AudioManager;
