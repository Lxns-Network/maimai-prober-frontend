import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Chart, BpmEvent, ChartDifficulty, AvailableDifficulties } from '../types';

export const playbackTimeRef = { current: 0 };

// 当音频已实际在播时，由 useMusicPlayer 每帧用 AudioContext 时钟反推的 chart-ms 位置。
// 渲染循环优先消费此值，让音频作为主时钟；为 null 时回落到 rAF 外推。
export const audioMasterTimeMsRef: { current: number | null } = { current: null };

interface TimelineState {
  totalMeasures: number;
  beatsPerMeasure: number;
  currentMeasure: number;
  currentPosition: number; // 0-511
  preciseTime: number; // in beats
}

interface GameState {
  /** 是否正在播放 */
  isPlaying: boolean;
  /** 播放速度 */
  playbackSpeed: number;
  /** 时间线 */
  timeline: TimelineState;
  /** 谱面数据 */
  chartData: Chart | null;
  /** 原始谱面文本 */
  rawSimaiText: string;
  /** 选定的难度 */
  selectedDifficulty: ChartDifficulty | null;
  /** 可用的难度 */
  availableDifficulties: AvailableDifficulties;
  /** 音乐 URL */
  musicUrl: string;
  /** 音乐是否加载完成 */
  musicLoaded: boolean;
  /** 音乐是否正在加载 */
  musicLoading: boolean;
  /** 音乐加载错误 */
  musicError: string | null;
  /** 等待音乐加载后播放 */
  pendingPlay: boolean;
  /** 播放开始时间 */
  playbackStartTime: number;
  /** 播放开始位置（毫秒） */
  playbackStartPositionMs: number;
  /** 搜索索引 */
  seekVersion: number;
  /** 是否全屏 */
  isFullscreen: boolean;
}

interface GameActions {
  /** 播放 */
  play: () => void;
  /** 暂停 */
  pause: () => void;
  /** 切换播放状态 */
  togglePlayback: () => void;
  /** 重新播放当前小节 */
  restartCurrentMeasure: () => void;
  /** 设置小节 */
  setMeasure: (measure: number) => void;
  /** 设置位置 */
  setPosition: (position: number) => void;
  /** 设置精确时间 */
  setPreciseTime: (time: number, incrementSeekVersion?: boolean) => void;
  /** 步进位置 */
  stepPosition: (steps: number) => void;
  /** 步进小节 */
  stepMeasure: (measures: number) => void;
  /** 设置谱面数据 */
  setChartData: (chart: Chart | null) => void;
  /** 设置原始谱面文本 */
  setRawSimaiText: (text: string) => void;
  /** 设置选定的难度 */
  setSelectedDifficulty: (difficulty: ChartDifficulty) => void;
  /** 设置可用的难度 */
  setAvailableDifficulties: (difficulties: AvailableDifficulties) => void;
  /** 设置播放速度 */
  setPlaybackSpeed: (speed: number) => void;
  /** 设置音乐 URL */
  setMusicUrl: (url: string) => void;
  /** 设置音乐状态 */
  setMusicState: (loaded: boolean, loading: boolean, error: string | null) => void;
  /** 设置等待播放状态 */
  setPendingPlay: (pending: boolean) => void;
  /** 获取当前时间（节拍） */
  getCurrentTimeInBeats: () => number;
  /** 获取当前时间（毫秒） */
  getCurrentTimeInMs: () => number;
  /** 获取总时间（毫秒） */
  getTotalDurationMs: () => number;
  /** 重置 */
  reset: () => void;
  /** 设置全屏模式 */
  setIsFullscreen: (isFullscreen: boolean) => void;
  /** 切换全屏模式 */
  toggleFullscreen: () => void;
}

export type GameStore = GameState & GameActions;

const initialTimeline: TimelineState = {
  totalMeasures: 1,
  beatsPerMeasure: 4,
  currentMeasure: 0,
  currentPosition: 0,
  preciseTime: 0,
};

const initialState: GameState = {
  isPlaying: false,
  playbackSpeed: 1.0,
  timeline: initialTimeline,
  chartData: null,
  rawSimaiText: '',
  selectedDifficulty: null,
  availableDifficulties: {},
  musicUrl: '',
  musicLoaded: false,
  musicLoading: false,
  musicError: null,
  pendingPlay: false,
  playbackStartTime: 0,
  playbackStartPositionMs: 0,
  seekVersion: 0,
  isFullscreen: false,
};

function beatsToMs(beats: number, bpmEvents: BpmEvent[] | null, defaultBpm: number): number {
  if (!bpmEvents || bpmEvents.length === 0) {
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

  totalMs += (60000 * (beats - lastBeat)) / currentBpm;
  return totalMs;
}

// 步进时的最大分拍（避免 1/384 等过细分拍导致步进过小）
const MAX_STEP_DIVISOR = 32;

function getDivisorAt(chartData: Chart | null, time: number, forStepping: boolean = false): number {
  if (!chartData?.divisorEvents || chartData.divisorEvents.length === 0) {
    return 4;
  }

  const events = chartData.divisorEvents;

  let left = 0;
  let right = events.length - 1;
  let result = -1;

  while (left <= right) {
    const mid = (left + right) >> 1;
    if (events[mid].timing <= time) {
      result = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  const divisor = result >= 0 ? events[result].divisor : 4;
  return forStepping ? Math.min(divisor, MAX_STEP_DIVISOR) : divisor;
}

export const useGameStore = create<GameStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    play: () => {
      const state = get();
      if (state.isPlaying) return;

      // 音乐还在加载：先标记 pendingPlay，等 musicLoaded 触发自动 play。
      if (state.musicUrl && !state.musicLoaded) {
        set({ pendingPlay: true });
        return;
      }

      const { timeline } = state;
      const totalBeats = timeline.totalMeasures * timeline.beatsPerMeasure;
      const isAtEnd = timeline.preciseTime >= totalBeats - 0.01;

      if (isAtEnd) {
        playbackTimeRef.current = 0;
        set({
          isPlaying: true,
          playbackStartTime: performance.now(),
          playbackStartPositionMs: 0,
          timeline: {
            ...timeline,
            currentMeasure: 0,
            currentPosition: 0,
            preciseTime: 0,
          },
          seekVersion: state.seekVersion + 1,
        });
        return;
      }

      const currentBeats = state.getCurrentTimeInBeats();
      const currentMs = beatsToMs(
        currentBeats,
        state.chartData?.bpmEvents ?? null,
        state.chartData?.bpm ?? 120
      );

      set({
        isPlaying: true,
        playbackStartTime: performance.now(),
        playbackStartPositionMs: currentMs,
      });
    },

    pause: () => {
      const state = get();
      const { beatsPerMeasure, totalMeasures } = state.timeline;
      const time = playbackTimeRef.current;

      const measure = Math.floor(time / beatsPerMeasure);
      const clampedMeasure = Math.max(0, Math.min(measure, totalMeasures - 1));
      const beatInMeasure = time - clampedMeasure * beatsPerMeasure;
      const position = Math.floor((beatInMeasure / beatsPerMeasure) * 512);
      const clampedPosition = Math.max(0, Math.min(position, 511));

      set({
        isPlaying: false,
        pendingPlay: false, // 取消等待播放状态
        timeline: {
          ...state.timeline,
          currentMeasure: clampedMeasure,
          currentPosition: clampedPosition,
          preciseTime: time,
        },
      });
    },

    togglePlayback: () => {
      const state = get();
      state.isPlaying ? state.pause() : state.play();
    },

    restartCurrentMeasure: () => {
      const state = get();
      const { beatsPerMeasure } = state.timeline;
      const currentTime = state.isPlaying ? playbackTimeRef.current : state.timeline.preciseTime;
      const currentMeasure = Math.floor(currentTime / beatsPerMeasure);
      state.setMeasure(currentMeasure);
    },

    setMeasure: (measure: number) => {
      const state = get();
      const clampedMeasure = Math.max(0, Math.min(measure, state.timeline.totalMeasures - 1));
      const newTime = clampedMeasure * state.timeline.beatsPerMeasure;

      playbackTimeRef.current = newTime;

      set({
        timeline: {
          ...state.timeline,
          currentMeasure: clampedMeasure,
          currentPosition: 0,
          preciseTime: newTime,
        },
        seekVersion: state.seekVersion + 1,
      });
    },

    setPosition: (position: number) => {
      const state = get();
      const clampedPosition = Math.max(0, Math.min(position, 511));
      const newTime = state.timeline.currentMeasure * state.timeline.beatsPerMeasure +
        (clampedPosition / 512) * state.timeline.beatsPerMeasure;

      playbackTimeRef.current = newTime;

      set({
        timeline: {
          ...state.timeline,
          currentPosition: clampedPosition,
          preciseTime: newTime,
        },
        seekVersion: state.seekVersion + 1,
      });
    },

    setPreciseTime: (time: number, incrementSeekVersion: boolean = false) => {
      const state = get();
      const { beatsPerMeasure, totalMeasures } = state.timeline;

      const measure = Math.floor(time / beatsPerMeasure);
      const clampedMeasure = Math.max(0, Math.min(measure, totalMeasures - 1));
      const beatInMeasure = time - clampedMeasure * beatsPerMeasure;
      const position = Math.floor((beatInMeasure / beatsPerMeasure) * 512);
      const clampedPosition = Math.max(0, Math.min(position, 511));

      playbackTimeRef.current = time;

      set({
        timeline: {
          ...state.timeline,
          currentMeasure: clampedMeasure,
          currentPosition: clampedPosition,
          preciseTime: time,
        },
        ...(incrementSeekVersion ? { seekVersion: state.seekVersion + 1 } : {}),
      });
    },

    stepPosition: (steps: number) => {
      const state = get();
      const { totalMeasures, beatsPerMeasure } = state.timeline;
      const currentTime = state.isPlaying ? playbackTimeRef.current : state.timeline.preciseTime;
      const maxTime = totalMeasures * beatsPerMeasure;

      let newTime: number;
      if (steps > 0) {
        const divisor = getDivisorAt(state.chartData, currentTime, true);
        newTime = Math.min(currentTime + beatsPerMeasure / divisor, maxTime);
      } else {
        const roughStep = beatsPerMeasure / getDivisorAt(state.chartData, currentTime, true);
        const targetTime = Math.max(0, currentTime - roughStep);
        const divisor = getDivisorAt(state.chartData, targetTime, true);
        newTime = Math.max(0, currentTime - beatsPerMeasure / divisor);
      }

      const measure = Math.floor(newTime / beatsPerMeasure);
      const clampedMeasure = Math.max(0, Math.min(measure, totalMeasures - 1));
      const beatInMeasure = newTime - clampedMeasure * beatsPerMeasure;
      const position = Math.floor((beatInMeasure / beatsPerMeasure) * 512);

      playbackTimeRef.current = newTime;

      set({
        timeline: {
          ...state.timeline,
          currentMeasure: clampedMeasure,
          currentPosition: Math.max(0, Math.min(position, 511)),
          preciseTime: newTime,
        },
        seekVersion: state.seekVersion + 1,
      });
    },

    stepMeasure: (measures: number) => {
      const state = get();
      const { beatsPerMeasure } = state.timeline;
      const currentTime = state.isPlaying ? playbackTimeRef.current : state.timeline.preciseTime;
      const currentMeasure = Math.floor(currentTime / beatsPerMeasure);
      get().setMeasure(currentMeasure + measures);
    },

    setChartData: (chart: Chart | null) => {
      playbackTimeRef.current = 0;

      set((state) => ({
        chartData: chart,
        isPlaying: false,
        pendingPlay: false,
        playbackStartTime: 0,
        playbackStartPositionMs: 0,
        timeline: {
          ...state.timeline,
          totalMeasures: chart?.measures ?? 1,
          currentMeasure: 0,
          currentPosition: 0,
          preciseTime: 0,
        },
        seekVersion: state.seekVersion + 1,
      }));
    },

    setRawSimaiText: (text: string) => set({ rawSimaiText: text }),
    setSelectedDifficulty: (difficulty: ChartDifficulty) => set({ selectedDifficulty: difficulty }),
    setAvailableDifficulties: (difficulties: AvailableDifficulties) =>
      set({ availableDifficulties: difficulties }),

    setPlaybackSpeed: (speed: number) => {
      const state = get();
      set({ playbackSpeed: Math.max(0.1, Math.min(1.0, speed)) });

      if (state.isPlaying) {
          const currentBeats = playbackTimeRef.current;
        const currentMs = beatsToMs(
          currentBeats,
          state.chartData?.bpmEvents ?? null,
          state.chartData?.bpm ?? 120
        );
        set({
          playbackStartTime: performance.now(),
          playbackStartPositionMs: currentMs,
        });
      }
    },

    setMusicUrl: (url: string) => {
      if (!url) {
        set({ musicUrl: '', musicLoaded: false, musicLoading: false, musicError: null });
      } else {
        set({ musicUrl: url });
      }
    },

    setMusicState: (loaded: boolean, loading: boolean, error: string | null) => {
      const state = get();
      const shouldAutoPlay = loaded && state.pendingPlay;

      set({
        musicLoaded: loaded,
        musicLoading: loading,
        musicError: error,
        // 在 set 这一拍清掉 pendingPlay：放到 play() 后才清，会让中间的 useEffect 误以为还在等。
        ...(shouldAutoPlay ? { pendingPlay: false } : {}),
      });

      if (shouldAutoPlay) {
        setTimeout(() => get().play(), 0);
      }
    },
    setPendingPlay: (pending: boolean) => set({ pendingPlay: pending }),

    getCurrentTimeInBeats: () => {
      const { timeline } = get();
      return (
        timeline.currentMeasure * timeline.beatsPerMeasure +
        (timeline.currentPosition / 512) * timeline.beatsPerMeasure
      );
    },

    getCurrentTimeInMs: () => {
      const state = get();
      return beatsToMs(
        state.getCurrentTimeInBeats(),
        state.chartData?.bpmEvents ?? null,
        state.chartData?.bpm ?? 120
      );
    },

    getTotalDurationMs: () => {
      const state = get();
      if (!state.chartData) return 0;
      const totalBeats = state.timeline.totalMeasures * state.timeline.beatsPerMeasure;
      return beatsToMs(totalBeats, state.chartData.bpmEvents, state.chartData.bpm);
    },

    reset: () => set({ ...initialState, timeline: { ...initialTimeline } }),

    setIsFullscreen: (isFullscreen: boolean) => set({ isFullscreen }),

    toggleFullscreen: () => set((state) => ({ isFullscreen: !state.isFullscreen })),
  }))
);

export const selectIsPlaying = (state: GameStore) => state.isPlaying;
export const selectCurrentMeasure = (state: GameStore) => state.timeline.currentMeasure;
export const selectTotalMeasures = (state: GameStore) => state.timeline.totalMeasures;
export const selectChartData = (state: GameStore) => state.chartData;
export const selectPlaybackSpeed = (state: GameStore) => state.playbackSpeed;
export const selectTimeline = (state: GameStore) => state.timeline;
export const selectMusicUrl = (state: GameStore) => state.musicUrl;

export default useGameStore;
