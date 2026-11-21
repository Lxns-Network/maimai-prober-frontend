import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CanvasResolution } from "@/pages/public/Chart/chunithm/runtime/canvasSize";
import type { PlayInputDevice } from "@/pages/public/Chart/chunithm/runtime/types";
import { GROUND_HEIGHT } from "@/pages/public/Chart/chunithm/input/touchZones";
import {
  DEFAULT_KEY_BINDINGS,
  type KeyBindings,
} from "@/pages/public/Chart/chunithm/input/keyboard";

interface ChunithmChartSettings {
  speedRow: number;
  playbackSpeed: number;
  alwaysKeepHiSpeed: boolean;
  playTimingRow: number;
  judgeTimingRow: number;
  judgePositionRow: number;
  criticalDisplayRow: number;
  mirror: boolean;
  wallRawId: number;
  dividerRow: number;
  fieldBrightness: string;
  showBackground: boolean;
  resolution: CanvasResolution;
  fpsLimit: number;
  hasConfirmed4k: boolean;
  hasSeenMusicCalibration: boolean;
  musicOffset: number;
  soundOffset: number;
  musicVolume: number;
  soundVolume: number;
  keyBindings: KeyBindings;
  inputDevice: PlayInputDevice | null;
  groundHeight: number;
  flickNeedsMotion: boolean;
}

const useChunithmChartSettingsStore = create<
  ChunithmChartSettings & {
    setOptions: (options: Partial<ChunithmChartSettings>) => void;
  }
>()(
  persist(
    (set) => ({
      speedRow: 28,
      playbackSpeed: 1,
      alwaysKeepHiSpeed: false,
      playTimingRow: 20,
      judgeTimingRow: 20,
      judgePositionRow: 0,
      criticalDisplayRow: 0,
      mirror: false,
      wallRawId: 0,
      dividerRow: 2,
      fieldBrightness: "0",
      showBackground: true,
      resolution: "auto",
      fpsLimit: 0,
      hasConfirmed4k: false,
      hasSeenMusicCalibration: false,
      musicOffset: 0,
      soundOffset: 0,
      musicVolume: 0.8,
      soundVolume: 0.6,
      keyBindings: DEFAULT_KEY_BINDINGS,
      inputDevice: null,
      groundHeight: GROUND_HEIGHT.default,
      flickNeedsMotion: true,
      setOptions: (options) => set(options),
    }),
    { name: "chunithm_chart_preview_settings" },
  ),
);

export default useChunithmChartSettingsStore;
