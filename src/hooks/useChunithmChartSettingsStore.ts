import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CanvasResolution } from "@/pages/public/Chart/chunithm/runtime/canvasSize";
import {
  DEFAULT_KEY_BINDINGS,
  type KeyBindings,
} from "@/pages/public/Chart/chunithm/options/keyBindings";

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
  musicOffset: number;
  soundOffset: number;
  musicVolume: number;
  soundVolume: number;
  keyBindings: KeyBindings;
  /** Whether a FLICK needs a slash across its lanes; otherwise a touch takes it. */
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
      musicOffset: 0,
      soundOffset: 0,
      musicVolume: 0.8,
      soundVolume: 0.6,
      keyBindings: DEFAULT_KEY_BINDINGS,
      flickNeedsMotion: true,
      setOptions: (options) => set(options),
    }),
    { name: "chunithm_chart_preview_settings" },
  ),
);

export default useChunithmChartSettingsStore;
