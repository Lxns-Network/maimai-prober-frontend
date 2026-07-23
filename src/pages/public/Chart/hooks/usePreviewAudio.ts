import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore, playbackTimeRef } from "../stores/useGameStore";
import { useGameSettingsStore } from "../stores/useGameSettingsStore";
import {
  AudioManager,
  ANSWER_SOUND_BASE_OFFSET_MS,
  prepareAudioEvents,
  type PreparedAudioEvent,
  getAudioContextOutputTime,
} from "@lxns-network/maimai-chart-engine";
import { beatsToMs, msToBeats, calculateMusicTime, getLeadInMs } from "../utils/timeConversion";
import { clamp } from "../utils/math";
import { PlaybackClock } from "../utils/playbackClock";

const SEEK_THROTTLE_MS = 50;
const SOURCE_FADE_TIME_S = 0.015;
const SOURCE_START_LEAD_TIME_S = 0.05;
const SCHEDULE_LOOKAHEAD_MS = 1500;
// 距音频末尾多近视为"已播完"；须大于重启定位用的 0.01s clamp。
const MUSIC_END_EPSILON_S = 0.05;

interface AudioState {
  audioContext: AudioContext | null;
  audioBuffer: AudioBuffer | null;
  sourceNode: AudioBufferSourceNode | null;
  musicGainNode: GainNode | null;
  sourceGainNode: GainNode | null;
  answerManager: AudioManager | null;
  answerManagerInitPromise: Promise<boolean> | null;
  playbackClock: PlaybackClock;
  /** 音乐源是否正在 AudioContext 上调度发声（已过 start 时刻、未 onended）。 */
  isSourcePlaying: boolean;
  /** 音乐源自然播完（非 stopSource 停止）；置位后不再重启源，seek 或新源启动时清除。 */
  musicEnded: boolean;
  /** rAF 外推锚点：上一帧的 timestamp 与对应的 chart-ms，用于无音频时钟时线性外推播放头。 */
  rafAnchorTimestamp: number;
  rafAnchorMs: number;
  /** syncFrame 是否已建立首帧锚点；seek/暂停后置 false，等下一帧重新锚定。 */
  frameAnchorInitialized: boolean;
  /** 上次处理到的 seekVersion，与 store 当前值比对以检测用户 seek。 */
  lastSeekVersion: number;
  // —— 播放中 seek 的调度交接状态机（见 syncFrame 的"启动/等待新源可听"分支）——
  // pendingSeek：seek 后等待启动新音乐源；期间视觉播放头停在目标位置。
  // isStartingPlayback：已发起 playFromPosition，等新源变可听；期间用 pendingStartChartMs 作播放头。
  // startRequestId：每次发起启动递增，用于丢弃被后续 seek/切换作废的旧启动 Promise 结果。
  pendingSeek: boolean;
  isStartingPlayback: boolean;
  pendingStartChartMs: number | null;
  startRequestId: number;
  /** 当前 syncFrame 驱动播放头用的时钟源：audio（音频输出时钟）或 raf（rAF 外推）。 */
  clockSource: PreviewClockSource;
}

export type PreviewClockSource = "audio" | "raf";

interface PreviewFrameState {
  currentBeats: number;
}

export interface PreviewAudioController {
  syncFrame: (timestamp: number) => PreviewFrameState | null;
  getClockSource: () => PreviewClockSource;
}

export function usePreviewAudio(): PreviewAudioController {
  const audioStateRef = useRef<AudioState>({
    audioContext: null,
    audioBuffer: null,
    sourceNode: null,
    musicGainNode: null,
    sourceGainNode: null,
    answerManager: null,
    answerManagerInitPromise: null,
    playbackClock: new PlaybackClock(),
    isSourcePlaying: false,
    musicEnded: false,
    rafAnchorTimestamp: 0,
    rafAnchorMs: 0,
    frameAnchorInitialized: false,
    lastSeekVersion: -1,
    pendingSeek: false,
    isStartingPlayback: false,
    pendingStartChartMs: null,
    startRequestId: 0,
    clockSource: "raf",
  });
  const lastUrlRef = useRef("");
  const lastSeekRef = useRef(0);
  const playbackSpeedRef = useRef(1);
  const loadingUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const answerEventsRef = useRef<PreparedAudioEvent[]>([]);
  const totalDurationCacheRef = useRef<{ chartNotes: unknown; totalDurationMs: number } | null>(
    null,
  );

  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { musicUrl, isPlaying, playbackSpeed, chartData, preciseTime, pendingPlay, setMusicState } =
    useGameStore(
      useShallow((s) => ({
        musicUrl: s.musicUrl,
        isPlaying: s.isPlaying,
        playbackSpeed: s.playbackSpeed,
        chartData: s.chartData,
        preciseTime: s.timeline.preciseTime,
        pendingPlay: s.pendingPlay,
        setMusicState: s.setMusicState,
      })),
    );

  const { musicVolume, musicOffset, soundEnabled, soundVolume, soundOffset } = useGameSettingsStore(
    useShallow((s) => ({
      musicVolume: s.musicVolume,
      musicOffset: s.musicOffset,
      soundEnabled: s.soundEnabled,
      soundVolume: s.soundVolume,
      soundOffset: s.soundOffset,
    })),
  );

  const musicVolumeRef = useRef(musicVolume);
  const bpm = chartData?.bpm ?? 120;
  const bpmEvents = chartData?.bpmEvents ?? null;

  useEffect(() => {
    answerEventsRef.current = prepareAudioEvents(chartData?.notes ?? null);
  }, [chartData?.notes]);

  useEffect(() => {
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed]);

  useEffect(() => {
    musicVolumeRef.current = musicVolume;
  }, [musicVolume]);

  const getCurrentTime = useCallback((precomputedOutputTime?: number): number => {
    const state = audioStateRef.current;
    if (!state.audioContext || !state.isSourcePlaying) {
      return state.playbackClock.offset;
    }
    const outputTime = precomputedOutputTime ?? getAudioContextOutputTime(state.audioContext);
    state.playbackClock.prune(outputTime);
    return state.playbackClock.positionAt(outputTime);
  }, []);

  /** 排布未来音应使用的倍速：音频源在播时取 PlaybackClock 最新段（最新倍速），否则回退 store 倍速。 */
  const getSchedulingSpeed = useCallback((): number => {
    const state = audioStateRef.current;
    if (!state.audioContext || !state.isSourcePlaying) {
      return playbackSpeedRef.current;
    }
    return state.playbackClock.schedulingSpeed(playbackSpeedRef.current);
  }, []);

  const stopSource = useCallback((immediate: boolean = false) => {
    const state = audioStateRef.current;
    const sourceNode = state.sourceNode;
    const sourceGainNode = state.sourceGainNode;

    state.sourceNode = null;
    state.sourceGainNode = null;
    state.isSourcePlaying = false;
    state.playbackClock.clear();

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

  const ensureAudioContext = useCallback((): AudioContext => {
    const state = audioStateRef.current;

    if (!state.audioContext) {
      const ctx = new AudioContext();
      const musicGainNode = ctx.createGain();
      musicGainNode.gain.value = musicVolumeRef.current;
      musicGainNode.connect(ctx.destination);
      state.audioContext = ctx;
      state.musicGainNode = musicGainNode;
    }

    return state.audioContext;
  }, []);

  const configureAnswerManager = useCallback((manager: AudioManager) => {
    const settings = useGameSettingsStore.getState();
    manager.setEnabled(settings.soundEnabled);
    manager.setVolume(settings.soundVolume);
    manager.setTimingOffset(ANSWER_SOUND_BASE_OFFSET_MS + settings.soundOffset);
  }, []);

  const ensureAnswerManager = useCallback((): AudioManager => {
    const state = audioStateRef.current;
    const audioContext = ensureAudioContext();

    if (!state.answerManager) {
      state.answerManager = new AudioManager({
        audioContext,
        outputNode: audioContext.destination,
      });
      configureAnswerManager(state.answerManager);
    }

    return state.answerManager;
  }, [ensureAudioContext, configureAnswerManager]);

  const ensureAnswerManagerInitialized = useCallback(async (): Promise<boolean> => {
    const state = audioStateRef.current;
    const manager = ensureAnswerManager();
    if (manager.isInitialized()) return true;

    if (!state.answerManagerInitPromise) {
      state.answerManagerInitPromise = manager
        .init()
        .then(() => manager.isInitialized())
        .catch(() => false)
        .finally(() => {
          state.answerManagerInitPromise = null;
        });
    }

    return state.answerManagerInitPromise;
  }, [ensureAnswerManager]);

  // AudioContext 懒加载 + 自动 resume（suspended 状态需要用户交互后才能恢复）。
  const ensureAudioContextReady = useCallback(async (): Promise<boolean> => {
    const audioContext = ensureAudioContext();

    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        return false;
      }
    }

    return audioContext.state === "running";
  }, [ensureAudioContext]);

  const scheduleAnswerSounds = useCallback(
    (currentTimeMs: number, precomputedOutputTime?: number) => {
      const settings = useGameSettingsStore.getState();
      const events = answerEventsRef.current;
      if (events.length === 0 || !settings.soundEnabled) return;

      const manager = ensureAnswerManager();
      if (!manager.isInitialized()) {
        void ensureAnswerManagerInitialized();
        return;
      }

      manager.schedule(
        events,
        currentTimeMs,
        getSchedulingSpeed(),
        SCHEDULE_LOOKAHEAD_MS,
        precomputedOutputTime,
      );
    },
    [ensureAnswerManager, ensureAnswerManagerInitialized, getSchedulingSpeed],
  );

  const resetAnswerSounds = useCallback(
    (currentTimeMs?: number, stopStartedSources: boolean = false) => {
      audioStateRef.current.answerManager?.reset(currentTimeMs, stopStartedSources);
    },
    [],
  );

  // stopStartedSources: 时间映射类变更（倍速切换）需传 true 停掉已发声的旧调度音，
  // 避免 reset 清空 handledEvents 后这些音继续响并触发重复播放；参数类变更
  // （soundEnabled/soundOffset）保持 false，让正在响的音自然结束。
  const resyncAnswerSounds = useCallback(
    (currentTimeMs: number, stopStartedSources: boolean = false) => {
      const chart = useGameStore.getState().chartData;
      const settings = useGameSettingsStore.getState();
      if (!chart || !settings.soundEnabled) return;

      resetAnswerSounds(currentTimeMs, stopStartedSources);
      scheduleAnswerSounds(currentTimeMs);
    },
    [resetAnswerSounds, scheduleAnswerSounds],
  );

  // 不依赖 rAF 的播放时间：音乐在跑时直接用 AudioContext 时钟反推 chart-ms。
  // 用于后台（rAF 被节流）兜底调度正解音，离开 syncFrame 也能继续推进调度窗口。
  const getPlaybackMsIndependent = useCallback((): number | null => {
    const state = audioStateRef.current;
    const chart = useGameStore.getState().chartData;
    if (
      !state.audioContext ||
      !state.isSourcePlaying ||
      !state.sourceNode ||
      state.isStartingPlayback ||
      !chart
    ) {
      return null;
    }
    const settings = useGameSettingsStore.getState();
    const musicTimeSec = getCurrentTime();
    const leadInMs = getLeadInMs(chart.bpm);
    return musicTimeSec * 1000 + leadInMs + settings.musicOffset - (chart.firstMs ?? 0);
  }, [getCurrentTime]);

  const playFromPosition = useCallback(
    async (position: number, requestId: number): Promise<boolean> => {
      const state = audioStateRef.current;
      if (!state.audioBuffer) return false;

      stopSource(true);

      const isReady = await ensureAudioContextReady();
      if (state.startRequestId !== requestId) return false;
      if (!isReady || !state.audioContext || !state.musicGainNode) return false;

      const duration = state.audioBuffer.duration;
      const playbackSpeed = playbackSpeedRef.current;
      const clampedPosition = clamp(position, 0, duration - 0.01);

      const sourceNode = state.audioContext.createBufferSource();
      const sourceGainNode = state.audioContext.createGain();
      sourceNode.buffer = state.audioBuffer;
      sourceNode.playbackRate.value = playbackSpeed;
      const startTime = state.audioContext.currentTime + SOURCE_START_LEAD_TIME_S;
      sourceGainNode.gain.setValueAtTime(0, startTime);
      sourceGainNode.gain.linearRampToValueAtTime(1, startTime + SOURCE_FADE_TIME_S);
      sourceNode.connect(sourceGainNode);
      sourceGainNode.connect(state.musicGainNode);

      sourceNode.onended = () => {
        // stopSource 会先把 sourceNode 置 null 再 stop，走到这里说明是自然播完。
        if (state.sourceNode === sourceNode) {
          state.sourceNode = null;
          state.sourceGainNode = null;
          state.isSourcePlaying = false;
          state.musicEnded = true;
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
      state.playbackClock.set(startTime, clampedPosition, playbackSpeed);
      state.isSourcePlaying = true;
      state.musicEnded = false;

      sourceNode.start(startTime, clampedPosition);
      return true;
    },
    [stopSource, ensureAudioContextReady],
  );

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
      state.answerManager?.dispose();
      state.answerManager = null;
      state.answerManagerInitPromise = null;
      if (state.audioContext) {
        state.audioContext.close();
        state.audioContext = null;
        state.musicGainNode = null;
        state.sourceGainNode = null;
      }
    };
  }, [stopSource]);

  useEffect(() => {
    if (!musicUrl) {
      const state = audioStateRef.current;
      stopSource(true);
      state.audioBuffer = null;
      state.playbackClock.setOffset(0);
      lastUrlRef.current = "";
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
    const shouldLoad = pendingPlay || musicUrl !== lastUrlRef.current || !state.audioBuffer;
    if (!shouldLoad) return;
    if (state.audioBuffer && musicUrl === lastUrlRef.current) return;
    if (loadingUrlRef.current === musicUrl) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (musicUrl !== lastUrlRef.current) {
      stopSource(true);
      state.audioBuffer = null;
      state.playbackClock.setOffset(0);
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
        const audioContext = ensureAudioContext();

        const response = await fetch(currentUrl, { signal: abortController.signal });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (abortController.signal.aborted) return;

        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
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
          setError("Failed to load audio. Check URL and CORS settings.");
        }
      }
    };

    loadAudio();
    // effect cleanup 不取消请求 —— 让请求跑完，只在 URL 变化/卸载时 abort。
  }, [pendingPlay, musicUrl, stopSource, ensureAudioContext]);

  useEffect(() => {
    const state = audioStateRef.current;
    if (state.musicGainNode) {
      state.musicGainNode.gain.value = musicVolume;
    }
  }, [musicVolume]);

  // 切速度：保存当前位置 → 改 playbackRate → 重锚 startTime/startOffset，避免外推跳变。
  useEffect(() => {
    const state = audioStateRef.current;
    if (state.sourceNode && state.isSourcePlaying && state.audioContext) {
      const startTime = state.audioContext.currentTime;
      const outputTime = getAudioContextOutputTime(state.audioContext);
      state.sourceNode.playbackRate.setValueAtTime(playbackSpeed, startTime);
      state.playbackClock.appendSegment(startTime, playbackSpeed, outputTime);
    }

    if (isPlaying && chartData) {
      const currentMs = beatsToMs(playbackTimeRef.current, chartData.bpmEvents, chartData.bpm);
      state.rafAnchorTimestamp = performance.now();
      state.rafAnchorMs = currentMs;
      resyncAnswerSounds(currentMs, true);
    }
  }, [playbackSpeed, isPlaying, chartData, resyncAnswerSounds]);

  useEffect(() => {
    const manager = audioStateRef.current.answerManager;
    if (!manager) {
      if (chartData && isPlaying && soundEnabled) {
        const currentMs = beatsToMs(playbackTimeRef.current, chartData.bpmEvents, chartData.bpm);
        resyncAnswerSounds(currentMs);
      }
      return;
    }

    manager.setEnabled(soundEnabled);

    if (!chartData || !isPlaying) return;

    const currentMs = beatsToMs(playbackTimeRef.current, chartData.bpmEvents, chartData.bpm);
    resyncAnswerSounds(currentMs);
  }, [soundEnabled, chartData, isPlaying, resyncAnswerSounds]);

  useEffect(() => {
    audioStateRef.current.answerManager?.setVolume(soundVolume);
  }, [soundVolume]);

  useEffect(() => {
    const manager = audioStateRef.current.answerManager;
    manager?.setTimingOffset(ANSWER_SOUND_BASE_OFFSET_MS + soundOffset);

    if (!chartData || !isPlaying || !soundEnabled) return;

    const currentMs = beatsToMs(playbackTimeRef.current, chartData.bpmEvents, chartData.bpm);
    resyncAnswerSounds(currentMs);
  }, [soundOffset, chartData, isPlaying, soundEnabled, resyncAnswerSounds]);

  useEffect(() => {
    if (!isPlaying) return;
    void ensureAudioContextReady();
    if (soundEnabled) {
      void ensureAnswerManagerInitialized();
    }
  }, [isPlaying, soundEnabled, ensureAudioContextReady, ensureAnswerManagerInitialized]);

  useEffect(() => {
    if (isPlaying) return;

    const state = audioStateRef.current;
    state.frameAnchorInitialized = false;
    state.pendingSeek = false;
    state.isStartingPlayback = false;
    state.pendingStartChartMs = null;
    state.startRequestId += 1;
    state.clockSource = "raf";
    state.musicEnded = false;

    if (state.isSourcePlaying) {
      state.playbackClock.setOffset(getCurrentTime());
      stopSource();
    }

    const currentChart = useGameStore.getState().chartData;
    if (!currentChart) {
      resetAnswerSounds(undefined, true);
      return;
    }

    const currentMs = beatsToMs(playbackTimeRef.current, currentChart.bpmEvents, currentChart.bpm);
    resetAnswerSounds(currentMs, true);

    const duration = state.audioBuffer?.duration ?? 0;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const now = Date.now();
    if (now - lastSeekRef.current >= SEEK_THROTTLE_MS) {
      lastSeekRef.current = now;
      const musicTime = calculateMusicTime(
        preciseTime,
        bpmEvents,
        bpm,
        musicOffset,
        chartData?.firstMs ?? 0,
      );
      state.playbackClock.setOffset(musicTime < 0 ? 0 : clamp(musicTime, 0, duration - 0.01));
    }
  }, [
    isPlaying,
    preciseTime,
    bpmEvents,
    bpm,
    musicOffset,
    chartData,
    getCurrentTime,
    stopSource,
    resetAnswerSounds,
  ]);

  // 后台兜底调度：rAF 在页面切到后台时会被浏览器节流/暂停，syncFrame 不再执行，
  // 正解音就会断。这里用独立 interval（不依赖 rAF）继续推进调度窗口；音乐在跑时
  // 直接用 AudioContext 时钟反推 currentMs，所以后台也能准确预约即将到来的 note。
  useEffect(() => {
    if (!isPlaying || !soundEnabled) return;

    const intervalId = window.setInterval(() => {
      const gameState = useGameStore.getState();
      const settingsState = useGameSettingsStore.getState();
      if (!gameState.isPlaying || !settingsState.soundEnabled) return;

      const currentMs = getPlaybackMsIndependent();
      if (currentMs === null) return;

      scheduleAnswerSounds(currentMs);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPlaying, soundEnabled, getPlaybackMsIndependent, scheduleAnswerSounds]);

  // 切回前台时消除爆音：后台期间 syncFrame 停摆，AudioManager 的
  // lastScheduledTimeMs 冻结在离开前的值，回前台第一帧调度窗口会覆盖一大段
  // "错过"的 note，全部命中立即播放分支叠加爆音。这里在可见时把窗口对齐到
  // 当前真实位置，丢弃过时 note。
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!useGameStore.getState().isPlaying) return;
      if (!useGameSettingsStore.getState().soundEnabled) return;

      const currentMs = getPlaybackMsIndependent();
      if (currentMs === null) return;

      resetAnswerSounds(currentMs, true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [getPlaybackMsIndependent, resetAnswerSounds]);

  const syncFrame = useCallback(
    (timestamp: number): PreviewFrameState | null => {
      const state = audioStateRef.current;
      const gameState = useGameStore.getState();
      const settingsState = useGameSettingsStore.getState();
      const chart = gameState.chartData;

      if (!gameState.isPlaying || !chart) return null;

      if (!state.frameAnchorInitialized) {
        const initialMs = beatsToMs(gameState.timeline.preciseTime, chart.bpmEvents, chart.bpm);
        state.rafAnchorTimestamp = timestamp;
        state.rafAnchorMs = initialMs;
        state.lastSeekVersion = gameState.seekVersion;
        state.frameAnchorInitialized = true;
        resetAnswerSounds(initialMs, true);
      }

      if (gameState.seekVersion !== state.lastSeekVersion) {
        const seekMs = beatsToMs(gameState.timeline.preciseTime, chart.bpmEvents, chart.bpm);
        state.rafAnchorTimestamp = timestamp;
        state.rafAnchorMs = seekMs;
        state.lastSeekVersion = gameState.seekVersion;
        state.pendingSeek = true;
        state.isStartingPlayback = false;
        state.pendingStartChartMs = null;
        state.startRequestId += 1;
        state.clockSource = "raf";
        state.musicEnded = false;
        resetAnswerSounds(seekMs, true);
      }

      let audioChartMs: number | null = null;
      const duration = state.audioBuffer?.duration ?? 0;
      // 每帧预计算一次 outputTime，避免 getCurrentTime 和 AudioManager.schedule 重复调用
      const precomputedOutputTime = state.audioContext
        ? getAudioContextOutputTime(state.audioContext)
        : -Infinity;

      if (Number.isFinite(duration) && duration > 0 && isLoaded) {
        const firstMs = chart.firstMs ?? 0;
        const musicTime = calculateMusicTime(
          playbackTimeRef.current,
          chart.bpmEvents,
          chart.bpm,
          settingsState.musicOffset,
          firstMs,
        );

        if (musicTime < 0) {
          if (state.isSourcePlaying) {
            stopSource();
            state.playbackClock.setOffset(0);
          }
          state.pendingSeek = false;
          state.isStartingPlayback = false;
          state.pendingStartChartMs = null;
        } else if (musicTime >= duration - MUSIC_END_EPSILON_S) {
          // 音乐已到末尾（谱面可能比音频长）：停源并清掉启动状态，播放头交给 rAF 外推继续。
          if (state.isSourcePlaying) stopSource();
          state.pendingSeek = false;
          state.isStartingPlayback = false;
          state.pendingStartChartMs = null;
          state.startRequestId += 1;
        } else {
          const targetTime = clamp(musicTime, 0, duration - 0.01);
          const leadInMs = getLeadInMs(chart.bpm);
          const targetChartMs = targetTime * 1000 + leadInMs + settingsState.musicOffset - firstMs;

          // 三态交接：seek/未播放 → 发起 playFromPosition 并等新源可听 → 可听后切回音频时钟跟随。
          // 切换瞬间视觉播放头用 pendingStartChartMs（目标位置）保持不动，避免在新源尚未发声时
          // 用旧时钟外推产生跳变；新源可听后改用 getCurrentTime 接管，回到音频输出时钟。
          // 源已自然播完时不重启末尾残端（输出延迟使 musicTime 反推值滞后于 duration）。
          if (
            (state.pendingSeek || !state.isSourcePlaying) &&
            !state.isStartingPlayback &&
            !state.musicEnded
          ) {
            state.pendingSeek = false;
            state.isStartingPlayback = true;
            state.pendingStartChartMs = targetChartMs;
            state.startRequestId += 1;
            const requestId = state.startRequestId;
            audioChartMs = state.pendingStartChartMs;
            playFromPosition(targetTime, requestId).then((started) => {
              if (state.startRequestId !== requestId) return;
              if (!started) {
                state.isStartingPlayback = false;
                state.pendingStartChartMs = null;
              }
            });
          } else if (state.isStartingPlayback) {
            if (state.musicEnded) {
              // 新源在变可听前就自然播完了：放弃等待，交给 rAF 外推从锚点继续。
              state.isStartingPlayback = false;
              state.pendingStartChartMs = null;
            } else if (
              state.isSourcePlaying &&
              state.audioContext &&
              state.playbackClock.isAudibleAt(precomputedOutputTime)
            ) {
              state.isStartingPlayback = false;
              state.pendingStartChartMs = null;
              const musicTimeSec = getCurrentTime(precomputedOutputTime);
              audioChartMs = musicTimeSec * 1000 + leadInMs + settingsState.musicOffset - firstMs;
            } else {
              audioChartMs = state.pendingStartChartMs ?? targetChartMs;
            }
          } else if (
            state.isSourcePlaying &&
            state.audioContext &&
            !state.pendingSeek &&
            !state.isStartingPlayback
          ) {
            const musicTimeSec = getCurrentTime(precomputedOutputTime);
            audioChartMs = musicTimeSec * 1000 + leadInMs + settingsState.musicOffset - firstMs;
          }
        }
      }

      let currentMs: number;
      const normalizedPlaybackSpeed = Math.max(gameState.playbackSpeed, 0.001);
      if (audioChartMs !== null) {
        currentMs = audioChartMs;
        state.rafAnchorTimestamp = timestamp;
        state.rafAnchorMs = audioChartMs;
        state.clockSource = "audio";
      } else {
        currentMs =
          state.rafAnchorMs + (timestamp - state.rafAnchorTimestamp) * normalizedPlaybackSpeed;
        state.clockSource = "raf";
      }

      const totalBeats = gameState.timeline.totalMeasures * gameState.timeline.beatsPerMeasure;
      let totalDurationMs: number;
      const cache = totalDurationCacheRef.current;
      if (cache && cache.chartNotes === chart.notes) {
        totalDurationMs = cache.totalDurationMs;
      } else {
        totalDurationMs = beatsToMs(totalBeats, chart.bpmEvents, chart.bpm);
        totalDurationCacheRef.current = { chartNotes: chart.notes, totalDurationMs };
      }
      if (currentMs >= totalDurationMs + 500) {
        gameState.setPreciseTime(totalBeats);
        gameState.pause();
        return null;
      }

      const currentBeats = msToBeats(currentMs, chart.bpmEvents, chart.bpm);
      playbackTimeRef.current = currentBeats;
      if (!state.isStartingPlayback) {
        scheduleAnswerSounds(currentMs, precomputedOutputTime);
      }

      return {
        currentBeats,
      };
    },
    [
      isLoaded,
      getCurrentTime,
      playFromPosition,
      resetAnswerSounds,
      scheduleAnswerSounds,
      stopSource,
    ],
  );

  const previewAudio = useMemo<PreviewAudioController>(
    () => ({
      syncFrame,
      getClockSource: () => audioStateRef.current.clockSource,
    }),
    [syncFrame],
  );

  return previewAudio;
}
