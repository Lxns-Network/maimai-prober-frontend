import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  Chart,
  ChartDifficulty,
  AvailableDifficulties,
} from "@lxns-network/maimai-chart-engine";
import { beatsToMs } from "../utils/timeConversion";

export const playbackTimeRef = { current: 0 };

interface TimelineState {
  totalMeasures: number;
  beatsPerMeasure: number;
  currentMeasure: number;
  currentPosition: number; // 0-511
  preciseTime: number; // in beats
}

interface GameState {
  isPlaying: boolean;
  playbackSpeed: number;
  timeline: TimelineState;
  chartData: Chart | null;
  rawSimaiText: string;
  selectedDifficulty: ChartDifficulty | null;
  availableDifficulties: AvailableDifficulties;
  musicUrl: string;
  musicLoaded: boolean;
  musicLoading: boolean;
  musicError: string | null;
  /** 等待音乐加载完成后自动开始播放 */
  pendingPlay: boolean;
  /** 跳转计数器：用户每次 seek（拖动/跳转）时自增，消费者比对该值以重新定位音频与动画 */
  seekVersion: number;
  isFullscreen: boolean;
}

interface GameActions {
  play: () => void;
  pause: () => void;
  togglePlayback: () => void;
  restartCurrentMeasure: () => void;
  setMeasure: (measure: number) => void;
  setPosition: (position: number) => void;
  /** incrementSeekVersion 为 true 时自增 seekVersion，通知音频/动画重新定位 */
  setPreciseTime: (time: number, incrementSeekVersion?: boolean) => void;
  stepPosition: (steps: number) => void;
  stepMeasure: (measures: number) => void;
  setChartData: (chart: Chart | null) => void;
  setRawSimaiText: (text: string) => void;
  setSelectedDifficulty: (difficulty: ChartDifficulty) => void;
  setAvailableDifficulties: (difficulties: AvailableDifficulties) => void;
  setPlaybackSpeed: (speed: number) => void;
  setMusicUrl: (url: string) => void;
  setMusicState: (loaded: boolean, loading: boolean, error: string | null) => void;
  getCurrentTimeInBeats: () => number;
  getCurrentTimeInMs: () => number;
  getTotalDurationMs: () => number;
  reset: () => void;
  setIsFullscreen: (isFullscreen: boolean) => void;
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
  rawSimaiText: "",
  selectedDifficulty: null,
  availableDifficulties: {},
  musicUrl: "",
  musicLoaded: false,
  musicLoading: false,
  musicError: null,
  pendingPlay: false,
  seekVersion: 0,
  isFullscreen: false,
};

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

      set({ isPlaying: true });
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
        pendingPlay: false,
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
      const newTime =
        state.timeline.currentMeasure * state.timeline.beatsPerMeasure +
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
      set({ playbackSpeed: Math.max(0.1, Math.min(1.0, speed)) });
    },

    setMusicUrl: (url: string) => {
      if (!url) {
        set({ musicUrl: "", musicLoaded: false, musicLoading: false, musicError: null });
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

    getCurrentTimeInBeats: () => {
      const { isPlaying, timeline } = get();
      if (isPlaying) return playbackTimeRef.current;

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
        state.chartData?.bpm ?? 120,
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
  })),
);

export default useGameStore;
