import { useRef, useEffect, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, playbackTimeRef } from '../stores/useGameStore';
import { BpmEvent } from '../types';

const LEAD_IN_BEATS = 4;
const DRIFT_THRESHOLD = 0.3;
const SYNC_INTERVAL_MS = 200;
const SEEK_THROTTLE_MS = 50;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

function beatsToMs(beats: number, bpmEvents: BpmEvent[] | null, defaultBpm: number): number {
  if (!bpmEvents?.length) {
    return (60000 * beats) / defaultBpm;
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

  return totalMs + (60000 * (beats - lastBeat)) / currentBpm;
}

function calculateMusicTime(
  preciseTime: number,
  bpmEvents: BpmEvent[] | null,
  bpm: number,
  musicOffset: number
): number {
  const chartTimeMs = beatsToMs(preciseTime, bpmEvents, bpm);
  const leadInMs = (60000 * LEAD_IN_BEATS) / bpm;
  return (chartTimeMs - leadInMs - musicOffset) / 1000;
}

interface AudioState {
  audioContext: AudioContext | null;
  audioBuffer: AudioBuffer | null;
  sourceNode: AudioBufferSourceNode | null;
  gainNode: GainNode | null;
  startTime: number;
  startOffset: number;
  isSourcePlaying: boolean;
}

export function useMusicPlayer() {
  const audioStateRef = useRef<AudioState>({
    audioContext: null,
    audioBuffer: null,
    sourceNode: null,
    gainNode: null,
    startTime: 0,
    startOffset: 0,
    isSourcePlaying: false,
  });
  const lastUrlRef = useRef('');
  const lastSeekRef = useRef(0);
  const playbackSpeedRef = useRef(1);
  const loadingUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    musicUrl,
    musicOffset,
    musicVolume,
    isPlaying,
    playbackSpeed,
    chartData,
    preciseTime,
    pendingPlay,
    setMusicState,
  } = useGameStore(
    useShallow((s) => ({
      musicUrl: s.musicUrl,
      musicOffset: s.musicOffset,
      musicVolume: s.musicVolume,
      isPlaying: s.isPlaying,
      playbackSpeed: s.playbackSpeed,
      chartData: s.chartData,
      preciseTime: s.timeline.preciseTime,
      pendingPlay: s.pendingPlay,
      setMusicState: s.setMusicState,
    }))
  );

  const bpm = chartData?.bpm ?? 120;
  const bpmEvents = chartData?.bpmEvents ?? null;

  // 保持 playbackSpeed 的最新引用
  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // 获取当前播放位置
  const getCurrentTime = useCallback((): number => {
    const state = audioStateRef.current;
    if (!state.audioContext || !state.isSourcePlaying) {
      return state.startOffset;
    }
    const elapsed = (state.audioContext.currentTime - state.startTime) * playbackSpeedRef.current;
    return state.startOffset + elapsed;
  }, []);

  // 停止当前播放的 source node
  const stopSource = useCallback(() => {
    const state = audioStateRef.current;
    if (state.sourceNode) {
      try {
        state.sourceNode.stop();
      } catch {
        // 忽略已停止的 source
      }
      state.sourceNode.disconnect();
      state.sourceNode = null;
    }
    state.isSourcePlaying = false;
  }, []);

  // 确保 AudioContext 已初始化并处于运行状态
  const ensureAudioContextReady = useCallback(async (): Promise<boolean> => {
    const state = audioStateRef.current;

    // 懒加载创建 AudioContext
    if (!state.audioContext) {
      const ctx = new AudioContext();
      const gainNode = ctx.createGain();
      gainNode.gain.value = musicVolume;
      gainNode.connect(ctx.destination);
      state.audioContext = ctx;
      state.gainNode = gainNode;
    }

    // 如果 AudioContext 被挂起，尝试恢复（需要用户交互后才能成功）
    if (state.audioContext.state === 'suspended') {
      try {
        await state.audioContext.resume();
      } catch {
        return false;
      }
    }

    return state.audioContext.state === 'running';
  }, [musicVolume]);

  // 从指定位置开始播放
  const playFromPosition = useCallback(async (position: number) => {
    const state = audioStateRef.current;
    if (!state.audioBuffer || !state.gainNode) return;

    // 确保 AudioContext 处于运行状态
    const isReady = await ensureAudioContextReady();
    if (!isReady || !state.audioContext) return;

    // 停止当前播放
    stopSource();

    const duration = state.audioBuffer.duration;
    const clampedPosition = clamp(position, 0, duration - 0.01);

    // 创建新的 source node
    const sourceNode = state.audioContext.createBufferSource();
    sourceNode.buffer = state.audioBuffer;
    sourceNode.playbackRate.value = playbackSpeedRef.current;
    sourceNode.connect(state.gainNode);

    // 处理播放结束
    sourceNode.onended = () => {
      if (state.sourceNode === sourceNode) {
        state.isSourcePlaying = false;
      }
    };

    state.sourceNode = sourceNode;
    state.startTime = state.audioContext.currentTime;
    state.startOffset = clampedPosition;
    state.isSourcePlaying = true;

    sourceNode.start(0, clampedPosition);
  }, [stopSource, ensureAudioContextReady]);

  // 同步加载状态到 store
  useEffect(() => {
    setMusicState(isLoaded, isLoading, error);
  }, [isLoaded, isLoading, error, setMusicState]);

  // 清理 AudioContext 和取消加载
  useEffect(() => {
    return () => {
      const state = audioStateRef.current;
      stopSource();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (state.audioContext) {
        state.audioContext.close();
        state.audioContext = null;
        state.gainNode = null;
      }
    };
  }, [stopSource]);

  // 当 musicUrl 清空时重置状态
  useEffect(() => {
    if (!musicUrl) {
      const state = audioStateRef.current;
      stopSource();
      state.audioBuffer = null;
      state.startOffset = 0;
      lastUrlRef.current = '';
      loadingUrlRef.current = null;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      setIsLoaded(false);
      setIsLoading(false);
      setError(null);
    }
  }, [musicUrl, stopSource]);

  // 加载音频文件（在 pendingPlay 或音频缓存被清除时触发）
  useEffect(() => {
    const state = audioStateRef.current;

    // 需要加载音频的条件：有 musicUrl，并且（pendingPlay 或 audioBuffer 为空且 URL 变了）
    if (!musicUrl) return;
    
    const shouldLoad = pendingPlay || (!state.audioBuffer && musicUrl !== lastUrlRef.current);
    if (!shouldLoad) return;

    // 如果已经加载完成（相同 URL），不重复加载
    if (state.audioBuffer && musicUrl === lastUrlRef.current) return;

    // 如果正在加载相同的 URL，不重复发起请求
    if (loadingUrlRef.current === musicUrl) return;

    // URL 变化时需要取消之前的请求并重新加载
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (musicUrl !== lastUrlRef.current) {
      stopSource();
      state.audioBuffer = null;
      state.startOffset = 0;
    }

    loadingUrlRef.current = musicUrl;
    const currentUrl = musicUrl; // 捕获当前 URL
    setIsLoading(true);
    setError(null);
    setIsLoaded(false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const loadAudio = async () => {
      try {
        // 懒加载创建 AudioContext（此时可能处于 suspended 状态，播放时再 resume）
        if (!state.audioContext) {
          const ctx = new AudioContext();
          const gainNode = ctx.createGain();
          gainNode.gain.value = musicVolume;
          gainNode.connect(ctx.destination);
          state.audioContext = ctx;
          state.gainNode = gainNode;
        }

        const response = await fetch(currentUrl, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // 检查是否已被取消
        if (abortController.signal.aborted) return;

        const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

        // 再次检查是否已被取消
        if (abortController.signal.aborted) return;

        // 确保是当前 URL 的加载结果
        if (loadingUrlRef.current === currentUrl) {
          state.audioBuffer = audioBuffer;
          lastUrlRef.current = currentUrl;
          loadingUrlRef.current = null;
          setIsLoaded(true);
          setIsLoading(false);
          setError(null);
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        if (loadingUrlRef.current === currentUrl) {
          loadingUrlRef.current = null;
          setIsLoaded(false);
          setIsLoading(false);
          setError('Failed to load audio. Check URL and CORS settings.');
        }
      }
    };

    loadAudio();

    // 注意：不在这里取消请求，让请求继续完成
    // 只有在 musicUrl 变化或组件卸载时才取消
  }, [pendingPlay, musicUrl, musicVolume, stopSource]);

  // 音量控制
  useEffect(() => {
    const state = audioStateRef.current;
    if (state.gainNode) {
      state.gainNode.gain.value = musicVolume;
    }
  }, [musicVolume]);

  // 播放速度控制
  useEffect(() => {
    const state = audioStateRef.current;
    if (state.sourceNode && state.isSourcePlaying) {
      // 保存当前位置
      const currentPosition = getCurrentTime();
      state.sourceNode.playbackRate.value = playbackSpeed;
      // 更新 startTime 和 startOffset 以保持位置同步
      if (state.audioContext) {
        state.startTime = state.audioContext.currentTime;
        state.startOffset = currentPosition;
      }
    }
  }, [playbackSpeed, getCurrentTime]);

  // 播放控制和时间同步
  useEffect(() => {
    const state = audioStateRef.current;
    if (!state.audioBuffer || !isLoaded) return;

    const duration = state.audioBuffer.duration;
    if (!isFinite(duration) || duration <= 0) return;

    if (isPlaying) {
      let animationFrameId: number | null = null;
      let lastSyncTime = 0;
      let isStartingPlayback = false; // 防止重复触发异步播放

      const syncAudio = () => {
        if (!useGameStore.getState().isPlaying) return;

        const now = performance.now();
        const currentBeats = playbackTimeRef.current;
        const musicTime = calculateMusicTime(currentBeats, bpmEvents, bpm, musicOffset);

        if (musicTime < 0) {
          // 音乐还未开始，停止播放
          if (state.isSourcePlaying) {
            stopSource();
            state.startOffset = 0;
          }
          isStartingPlayback = false;
        } else {
          const targetTime = clamp(musicTime, 0, duration - 0.01);

          // 检查漂移，必要时重新同步
          if (now - lastSyncTime >= SYNC_INTERVAL_MS) {
            lastSyncTime = now;
            const currentTime = getCurrentTime();
            const drift = Math.abs(currentTime - targetTime);
            if (drift > DRIFT_THRESHOLD && !isStartingPlayback) {
              isStartingPlayback = true;
              playFromPosition(targetTime).finally(() => {
                isStartingPlayback = false;
              });
            }
          }

          // 如果没有在播放，开始播放
          if (!state.isSourcePlaying && !isStartingPlayback) {
            isStartingPlayback = true;
            playFromPosition(targetTime).finally(() => {
              isStartingPlayback = false;
            });
          }
        }

        animationFrameId = requestAnimationFrame(syncAudio);
      };

      // 初始播放
      const initialBeats = playbackTimeRef.current;
      const initialMusicTime = calculateMusicTime(initialBeats, bpmEvents, bpm, musicOffset);
      if (initialMusicTime >= 0) {
        isStartingPlayback = true;
        playFromPosition(clamp(initialMusicTime, 0, duration - 0.01)).then(() => {
          isStartingPlayback = false;
          animationFrameId = requestAnimationFrame(syncAudio);
        });
      } else {
        animationFrameId = requestAnimationFrame(syncAudio);
      }

      return () => {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
      };
    } else {
      // 暂停播放
      if (state.isSourcePlaying) {
        state.startOffset = getCurrentTime();
        stopSource();
      }

      // 节流更新 seek 位置
      const now = Date.now();
      if (now - lastSeekRef.current >= SEEK_THROTTLE_MS) {
        lastSeekRef.current = now;
        const musicTime = calculateMusicTime(preciseTime, bpmEvents, bpm, musicOffset);
        state.startOffset = musicTime < 0 ? 0 : clamp(musicTime, 0, duration - 0.01);
      }
    }
  }, [isPlaying, preciseTime, bpmEvents, bpm, musicOffset, isLoaded, stopSource, playFromPosition, getCurrentTime]);

  return { 
    isLoaded, 
    isLoading, 
    error,
    clearAudio: () => {
      const state = audioStateRef.current;
      stopSource();
      state.audioBuffer = null;
      lastUrlRef.current = '';
      setIsLoaded(false);
      setIsLoading(false);
      setError(null);
    }
  };
}

export default useMusicPlayer;
