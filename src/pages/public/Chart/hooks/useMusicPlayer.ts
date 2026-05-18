import { useRef, useEffect, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, playbackTimeRef, audioMasterTimeMsRef } from '../stores/useGameStore';
import { useGameSettingsStore } from '../stores/useGameSettingsStore';
import { BpmEvent } from '../types';

const LEAD_IN_BEATS = 4;
const SEEK_THROTTLE_MS = 50;
const SOURCE_FADE_TIME_S = 0.015;

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
  sourceGainNode: GainNode | null;
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
    sourceGainNode: null,
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
    isPlaying,
    playbackSpeed,
    chartData,
    preciseTime,
    pendingPlay,
    setMusicState,
  } = useGameStore(
    useShallow((s) => ({
      musicUrl: s.musicUrl,
      isPlaying: s.isPlaying,
      playbackSpeed: s.playbackSpeed,
      chartData: s.chartData,
      preciseTime: s.timeline.preciseTime,
      pendingPlay: s.pendingPlay,
      setMusicState: s.setMusicState,
    }))
  );

  const { musicVolume, musicOffset } = useGameSettingsStore(
    useShallow((s) => ({ musicVolume: s.musicVolume, musicOffset: s.musicOffset }))
  );

  const bpm = chartData?.bpm ?? 120;
  const bpmEvents = chartData?.bpmEvents ?? null;

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  // 用 sourceNode.playbackRate 而非 ref：切速度时 React effect 顺序让 ref 早于
  // 音频 rate 更新，错位会让切换瞬间的位置外推错。
  const getCurrentTime = useCallback((): number => {
    const state = audioStateRef.current;
    if (!state.audioContext || !state.isSourcePlaying || !state.sourceNode) {
      return state.startOffset;
    }
    const speed = state.sourceNode.playbackRate.value;
    const elapsed = (state.audioContext.currentTime - state.startTime) * speed;
    return state.startOffset + elapsed;
  }, []);

  const stopSource = useCallback((immediate: boolean = false) => {
    const state = audioStateRef.current;
    const sourceNode = state.sourceNode;
    const sourceGainNode = state.sourceGainNode;

    state.sourceNode = null;
    state.sourceGainNode = null;
    state.isSourcePlaying = false;

    if (!sourceNode) {
      return;
    }

    const cleanup = () => {
      try {
        sourceNode.disconnect();
      } catch {
        // 忽略已经断开的 source
      }
      try {
        sourceGainNode?.disconnect();
      } catch {
        // 忽略已经断开的 gain
      }
    };

    if (immediate || !state.audioContext || !sourceGainNode) {
      try {
        sourceNode.stop();
      } catch {
        // 忽略已停止的 source
      }
      cleanup();
      return;
    }

    const now = state.audioContext.currentTime;

    try {
      sourceGainNode.gain.cancelScheduledValues(now);
      sourceGainNode.gain.setValueAtTime(sourceGainNode.gain.value, now);
      sourceGainNode.gain.linearRampToValueAtTime(0, now + SOURCE_FADE_TIME_S);
      sourceNode.stop(now + SOURCE_FADE_TIME_S);
    } catch {
      try {
        sourceNode.stop();
      } catch {
        // 忽略已经停止的 source
      }
    }

    window.setTimeout(cleanup, SOURCE_FADE_TIME_S * 1000 + 50);
  }, []);

  // AudioContext 懒加载 + 自动 resume（suspended 状态需要用户交互后才能恢复）。
  const ensureAudioContextReady = useCallback(async (): Promise<boolean> => {
    const state = audioStateRef.current;

    if (!state.audioContext) {
      const ctx = new AudioContext();
      const gainNode = ctx.createGain();
      gainNode.gain.value = musicVolume;
      gainNode.connect(ctx.destination);
      state.audioContext = ctx;
      state.gainNode = gainNode;
    }

    if (state.audioContext.state === 'suspended') {
      try {
        await state.audioContext.resume();
      } catch {
        return false;
      }
    }

    return state.audioContext.state === 'running';
  }, [musicVolume]);

  const playFromPosition = useCallback(async (position: number) => {
    const state = audioStateRef.current;
    if (!state.audioBuffer || !state.gainNode) return;

    const isReady = await ensureAudioContextReady();
    if (!isReady || !state.audioContext) return;

    stopSource();

    const duration = state.audioBuffer.duration;
    const clampedPosition = clamp(position, 0, duration - 0.01);

    const sourceNode = state.audioContext.createBufferSource();
    const sourceGainNode = state.audioContext.createGain();
    sourceNode.buffer = state.audioBuffer;
    sourceNode.playbackRate.value = playbackSpeedRef.current;
    sourceGainNode.gain.setValueAtTime(0, state.audioContext.currentTime);
    sourceGainNode.gain.linearRampToValueAtTime(1, state.audioContext.currentTime + SOURCE_FADE_TIME_S);
    sourceNode.connect(sourceGainNode);
    sourceGainNode.connect(state.gainNode);

    // 处理播放结束
    sourceNode.onended = () => {
      if (state.sourceNode === sourceNode) {
        state.sourceNode = null;
        state.sourceGainNode = null;
        state.isSourcePlaying = false;
      }
      try {
        sourceNode.disconnect();
      } catch {
        // 忽略已经断开的 source
      }
      try {
        sourceGainNode.disconnect();
      } catch {
        // 忽略已经断开的 gain
      }
    };

    state.sourceNode = sourceNode;
    state.sourceGainNode = sourceGainNode;
    state.startTime = state.audioContext.currentTime;
    state.startOffset = clampedPosition;
    state.isSourcePlaying = true;

    sourceNode.start(0, clampedPosition);
  }, [stopSource, ensureAudioContextReady]);

  useEffect(() => {
    setMusicState(isLoaded, isLoading, error);
  }, [isLoaded, isLoading, error, setMusicState]);

  // 卸载清理：停 source、abort 进行中的下载、关 AudioContext。
  useEffect(() => {
    const currentState = audioStateRef.current;
    return () => {
      const state = currentState;
      stopSource();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (state.audioContext) {
        state.audioContext.close();
        state.audioContext = null;
        state.gainNode = null;
        state.sourceGainNode = null;
      }
    };
  }, [stopSource]);

  useEffect(() => {
    if (!musicUrl) {
      const state = audioStateRef.current;
      stopSource(true);
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

  // 仅在 pendingPlay 或 URL 变化时拉音频；同 URL 已 in-flight 时不重发。
  useEffect(() => {
    const state = audioStateRef.current;
    if (!musicUrl) return;
    const shouldLoad = pendingPlay || (!state.audioBuffer && musicUrl !== lastUrlRef.current);
    if (!shouldLoad) return;
    if (state.audioBuffer && musicUrl === lastUrlRef.current) return;
    if (loadingUrlRef.current === musicUrl) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (musicUrl !== lastUrlRef.current) {
      stopSource(true);
      state.audioBuffer = null;
      state.startOffset = 0;
    }

    loadingUrlRef.current = musicUrl;
    const currentUrl = musicUrl;
    setIsLoading(true);
    setError(null);
    setIsLoaded(false);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const loadAudio = async () => {
      try {
        // AudioContext 在加载时就建（首次播放再 resume）。
        if (!state.audioContext) {
          const ctx = new AudioContext();
          const gainNode = ctx.createGain();
          gainNode.gain.value = musicVolume;
          gainNode.connect(ctx.destination);
          state.audioContext = ctx;
          state.gainNode = gainNode;
        }

        const response = await fetch(currentUrl, { signal: abortController.signal });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (abortController.signal.aborted) return;

        const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
        if (abortController.signal.aborted) return;

        // 期间用户可能切歌；只在仍指向 currentUrl 时落盘。
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
    // effect cleanup 不取消请求 —— 让请求跑完，只在 URL 变化/卸载时 abort。
  }, [pendingPlay, musicUrl, musicVolume, stopSource]);

  useEffect(() => {
    const state = audioStateRef.current;
    if (state.gainNode) {
      state.gainNode.gain.value = musicVolume;
    }
  }, [musicVolume]);

  // 切速度：保存当前位置 → 改 playbackRate → 重锚 startTime/startOffset，避免外推跳变。
  useEffect(() => {
    const state = audioStateRef.current;
    if (state.sourceNode && state.isSourcePlaying) {
      const currentPosition = getCurrentTime();
      state.sourceNode.playbackRate.value = playbackSpeed;
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
      let isStartingPlayback = false; // 防止重复触发异步播放
      let lastSeekVersion = useGameStore.getState().seekVersion;
      let pendingSeek = false;

      const syncAudio = () => {
        if (!useGameStore.getState().isPlaying) return;

        // 显式监听 seek：用户拖动进度条 → seekVersion++ → 重新定位音频源。
        // 与旧版"按漂移阈值整源重启"相反，这里只在用户主动 seek 时动音频，
        // 渲染抖动不再导致 source 重建。
        const sv = useGameStore.getState().seekVersion;
        if (sv !== lastSeekVersion) {
          lastSeekVersion = sv;
          pendingSeek = true;
          // 立即让出主时钟，避免 animate 在本帧先于 syncAudio 跑时消费到 seek 前的音频时间
          audioMasterTimeMsRef.current = null;
        }

        const currentBeats = playbackTimeRef.current;
        const musicTime = calculateMusicTime(currentBeats, bpmEvents, bpm, musicOffset);

        if (musicTime < 0) {
          // 前奏（lead-in）阶段：音乐尚未真正开始
          if (state.isSourcePlaying) {
            stopSource();
            state.startOffset = 0;
          }
          audioMasterTimeMsRef.current = null;
          isStartingPlayback = false;
          pendingSeek = false;
        } else if (musicTime >= duration && !pendingSeek) {
          // 谱面已经走过音乐尾巴：不要重启音频（否则 source 反复在 duration-0.01
          // 起播又立即 onended，钉死 audioMasterTimeMsRef 在末尾，让 ChartCanvas
          // 的尾奏判停 (currentMs >= totalDurationMs + 500) 永远触发不到）。
          if (state.isSourcePlaying) stopSource();
          audioMasterTimeMsRef.current = null;
        } else {
          const targetTime = clamp(musicTime, 0, duration - 0.01);

          if ((pendingSeek || !state.isSourcePlaying) && !isStartingPlayback) {
            // 起播或显式 seek：以谱面时间为锚点启动音频
            pendingSeek = false;
            audioMasterTimeMsRef.current = null;
            isStartingPlayback = true;
            playFromPosition(targetTime).finally(() => {
              isStartingPlayback = false;
            });
          } else if (
            state.isSourcePlaying &&
            state.audioContext &&
            !pendingSeek &&
            !isStartingPlayback
          ) {
            // 音频在跑：用 AudioContext 时钟反推 chart-ms，渲染层将以此为主时钟。
            // pendingSeek 或起播 in-flight 期间不发布，避免推出 seek 前 / 起播前的旧位置。
            const elapsedSec =
              (state.audioContext.currentTime - state.startTime) * playbackSpeedRef.current;
            const musicTimeSec = state.startOffset + elapsedSec;
            const leadInMs = (60000 * LEAD_IN_BEATS) / bpm;
            audioMasterTimeMsRef.current = musicTimeSec * 1000 + leadInMs + musicOffset;
          } else {
            audioMasterTimeMsRef.current = null;
          }
        }

        animationFrameId = requestAnimationFrame(syncAudio);
      };

      // 起播延到下一帧 rAF，跟 ChartCanvas animate 首帧落在同一个 vsync 起步
      let initRafId: number | null = requestAnimationFrame(() => {
        initRafId = null;
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
      });

      return () => {
        if (initRafId !== null) {
          cancelAnimationFrame(initRafId);
        }
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
        }
        audioMasterTimeMsRef.current = null;
      };
    } else {
      // 暂停播放
      if (state.isSourcePlaying) {
        state.startOffset = getCurrentTime();
        stopSource();
      }
      audioMasterTimeMsRef.current = null;

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
