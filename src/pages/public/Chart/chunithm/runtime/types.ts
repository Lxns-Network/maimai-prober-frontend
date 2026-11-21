import type { SurfaceSample } from "@lxns-network/chunithm-chart-engine/chart/play/input";
import type { FrameSurface } from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import type { StartMusicCalibration } from "@/pages/public/Chart/utils/musicCalibration";
import type { PreviewLiveState } from "./liveState";
import type { CanvasResolution } from "./canvasSize";
import type { KeyBindings } from "../input/keyboard";
import type { ControllerLightWriter } from "../input/controllers/adapter";

export interface LoopRange {
  start: number;
  end: number;
}

export type PlayInputDevice = "touch" | "keyboard" | "controller";

export interface PlaySettings {
  inputDevice: PlayInputDevice;
  keyBindings: KeyBindings;
  groundHeight: number;
  flickNeedsMotion: boolean;
}

export interface PreviewControls {
  touchProjection(): Float32Array | null;
  controllerInput(sample: SurfaceSample | null, receivedAt: number): void;
  setControllerLights(writer: ControllerLightWriter | null): void;
  selectDifficulty(value: number | undefined, seconds?: number): void;
  setLoop(range: LoopRange | null): void;
  captureFrame(): Promise<Blob>;
  exportGif(
    range: LoopRange,
    signal: AbortSignal,
    progress: (value: number) => void,
  ): Promise<Blob>;
  toggle(): void;
  pause(): void;
  startMusicCalibration: StartMusicCalibration;
  scrub(seconds: number): void;
  seek(seconds: number): void;
  selectSpeed(value: string): void;
  selectMirror(value: boolean): void;
  selectPlaybackSpeed(value: number): void;
  selectKeepHiSpeed(value: boolean): void;
  selectPlayTiming(value: string): void;
  selectJudgeTiming(value: string): void;
  selectJudgePosition(value: string): void;
  selectCriticalDisplay(value: string): void;
  selectFieldWall(value: string): void;
  selectDivider(value: string): void;
  selectResolution(value: CanvasResolution): void;
  setFpsLimit(value: number): void;
  setAudioOffsets(musicOffset: number, soundOffset: number): void;
  setVolume(musicVolume: number, soundVolume: number): void;
  refreshPresentation(): void;
  /** Plays the chart with the player's controls instead of showing the automatic play. */
  setPlayMode(value: boolean): void;
  setPlaySettings(value: PlaySettings): void;
}

/** Live scheduling limits for optional Stage checkpoint work. Times are in milliseconds. */
export interface PreviewWarmState {
  playing: boolean;
  busy: boolean;
  blockedUntil: number;
}

export interface PreviewSessionInput {
  canvas: HTMLCanvasElement;
  /** Directory of the engine packs and the resources every chart shares. */
  assetBase: string;
  musicId: number;
  /** Chart difficulty; the chart's highest when omitted or not in the chart. */
  difficulty?: number;
  initialSeconds: number;
  initialSpeedRow: number | null;
  playbackSpeed?: number;
  alwaysKeepHiSpeed?: boolean;
  initialPlayTimingRow: number | null;
  initialJudgeTimingRow: number | null;
  initialJudgePositionRow: number | null;
  initialCriticalDisplayRow: number | null;
  mirror: boolean;
  initialWallRawId: number | null;
  initialDividerRow: number | null;
  /** Music file; the chart's own music when omitted. */
  musicUrl?: string | null;
  /** Jacket image; the chart's own jacket when omitted. */
  jacketUrl?: string | null;
  resolution?: CanvasResolution;
  fpsLimit?: number;
  musicOffset?: number;
  soundOffset?: number;
  musicVolume?: number;
  soundVolume?: number;
  fieldMaskPresentation?: "external";
  preparePresentation?: (
    scene: FrameSurface,
    stage: Promise<number | null>,
    signal: AbortSignal,
    setDividerColor: (color: number) => void,
    duration: Promise<number>,
    readWarmState: () => PreviewWarmState,
  ) => Promise<() => void>;
  live: PreviewLiveState;
  ui: {
    setStatus(status: "loading" | "ready" | "error"): void;
    setError(message: string | null): void;
    setPlaying(playing: boolean): void;
    setSeeking(seeking: boolean): void;
    setLiveSoundsMuted(muted: boolean): void;
    setChangingDifficulty(changing: boolean): void;
    setDurationSeconds(seconds: number): void;
    setSpeedOptions(options: FrameSurface["speedOptions"]): void;
    setSpeedValue(value: string | null): void;
    setPlayTimingValue(value: string): void;
    setJudgeTimingValue(value: string): void;
    setJudgePositionValue(value: string): void;
    setCriticalDisplayValue(value: string): void;
    setFieldWallOptions(options: { value: string; label: string }[]): void;
    setFieldWallValue(value: string | null): void;
    setDividerOptions(options: { value: string; label: string }[]): void;
    setDividerValue(value: string | null): void;
    setDifficultyOptions(options: { value: string; label: string }[]): void;
    setDifficultyValue(value: string | null): void;
  };
  setControls(controls: PreviewControls | null): void;
}
