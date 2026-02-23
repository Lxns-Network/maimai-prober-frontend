import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { MirrorMode, JudgmentLineDesign } from '../types';

export interface GameSettingsState {
  hiSpeed: number;
  slideRotation: boolean;
  mirrorMode: MirrorMode;
  judgmentLineDesign: JudgmentLineDesign;
  pinkSlideStart: boolean;
  highlightExNotes: boolean;
  normalColorBreakSlide: boolean;
  soundEnabled: boolean;
  soundVolume: number;
  soundOffset: number;
  musicVolume: number;
}

export interface GameSettingsActions {
  setHiSpeed: (speed: number) => void;
  setSlideRotation: (enabled: boolean) => void;
  setMirrorMode: (mode: MirrorMode) => void;
  setJudgmentLineDesign: (design: JudgmentLineDesign) => void;
  setPinkSlideStart: (enabled: boolean) => void;
  setHighlightExNotes: (enabled: boolean) => void;
  setNormalColorBreakSlide: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (volume: number) => void;
  setSoundOffset: (offset: number) => void;
  setMusicVolume: (volume: number) => void;
}

export type GameSettingsStore = GameSettingsState & GameSettingsActions;

const SETTINGS_STORE_VERSION = 1;

const initialState: GameSettingsState = {
  hiSpeed: 6,
  slideRotation: true,
  mirrorMode: 'none',
  judgmentLineDesign: 'simple',
  pinkSlideStart: false,
  highlightExNotes: false,
  normalColorBreakSlide: false,
  soundEnabled: false,
  soundVolume: 0.5,
  soundOffset: 0,
  musicVolume: 0.8,
};

export const useGameSettingsStore = create<GameSettingsStore>()(
  persist(
    (set) => ({
      ...initialState,
      setHiSpeed: (speed: number) => set({ hiSpeed: Math.max(3, Math.min(9, speed)) }),
      setSlideRotation: (enabled: boolean) => set({ slideRotation: enabled }),
      setMirrorMode: (mode: MirrorMode) => set({ mirrorMode: mode }),
      setJudgmentLineDesign: (design: JudgmentLineDesign) => set({ judgmentLineDesign: design }),
      setPinkSlideStart: (enabled: boolean) => set({ pinkSlideStart: enabled }),
      setHighlightExNotes: (enabled: boolean) => set({ highlightExNotes: enabled }),
      setNormalColorBreakSlide: (enabled: boolean) => set({ normalColorBreakSlide: enabled }),
      setSoundEnabled: (enabled: boolean) => set({ soundEnabled: enabled }),
      setSoundVolume: (volume: number) => set({ soundVolume: Math.max(0, Math.min(1, volume)) }),
      setSoundOffset: (offset: number) => set({ soundOffset: offset }),
      setMusicVolume: (volume: number) => set({ musicVolume: Math.max(0, Math.min(1, volume)) }),
    }),
    {
      name: 'maimai-prober-chart-settings',
      version: SETTINGS_STORE_VERSION,
      migrate: (persistedState) => ({
        ...initialState,
        ...(persistedState as Partial<GameSettingsState>),
      }),
      partialize: (state) => ({
        hiSpeed: state.hiSpeed,
        slideRotation: state.slideRotation,
        mirrorMode: state.mirrorMode,
        judgmentLineDesign: state.judgmentLineDesign,
        pinkSlideStart: state.pinkSlideStart,
        highlightExNotes: state.highlightExNotes,
        normalColorBreakSlide: state.normalColorBreakSlide,
        soundEnabled: state.soundEnabled,
        soundVolume: state.soundVolume,
        soundOffset: state.soundOffset,
        musicVolume: state.musicVolume,
      }),
    }
  )
);
