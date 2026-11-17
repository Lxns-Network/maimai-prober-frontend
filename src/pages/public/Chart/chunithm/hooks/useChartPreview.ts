import { useEffect, useRef, useState } from "react";
import type { FrameSurface } from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import { createPreviewLiveState } from "../runtime/liveState";
import { createPreviewSession } from "../runtime/session";
import type { PreviewControls } from "../runtime/types";
import type { CanvasResolution } from "../runtime/canvasSize";
import { useStagePresentation } from "./useStagePresentation";
import { DEFAULT_PLAY_TIMING_ROW, PLAY_TIMING_OPTIONS } from "../options/playTiming";
import { DEFAULT_JUDGE_TIMING_ROW, JUDGE_TIMING_OPTIONS } from "../options/judgeTiming";
import { DEFAULT_JUDGE_POSITION_ROW, JUDGE_POSITION_OPTIONS } from "../options/judgePosition";
import { DEFAULT_JUDGE_DISPLAY_ROW, JUDGE_DISPLAY_OPTIONS } from "../options/judgeDisplay";
import useChunithmChartSettingsStore from "@/hooks/useChunithmChartSettingsStore";

export interface ChartPreviewOptions {
  /** Directory of the engine packs and the resources every chart shares. */
  assetBase: string;
  stageBase: string;
  /** Selected song identity, whose chart, music and jacket the page loads. */
  musicId: number;
  /** Chart difficulty; the chart's highest when omitted or not in the chart. */
  difficulty?: number;
  initialSeconds: number;
  initialSpeedRow: number | null;
  musicUrl?: string | null;
  jacketUrl?: string | null;
  resolution: CanvasResolution;
}

/** Page ownership of the chart scene, stage, music and cancellable resource loading. */
export function useChartPreview(options: ChartPreviewOptions) {
  const {
    assetBase,
    stageBase,
    musicId,
    difficulty,
    initialSeconds,
    initialSpeedRow,
    musicUrl,
    jacketUrl,
    resolution,
  } = options;
  const stageOff =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("stage") === "off";
  const [settings] = useState(() => useChunithmChartSettingsStore.getState());
  const musicVolume = useChunithmChartSettingsStore((state) => state.musicVolume);
  const soundVolume = useChunithmChartSettingsStore((state) => state.soundVolume);
  const musicOffset = useChunithmChartSettingsStore((state) => state.musicOffset);
  const soundOffset = useChunithmChartSettingsStore((state) => state.soundOffset);
  const fpsLimit = useChunithmChartSettingsStore((state) => state.fpsLimit);
  const keyBindings = useChunithmChartSettingsStore((state) => state.keyBindings);
  const flickNeedsMotion = useChunithmChartSettingsStore((state) => state.flickNeedsMotion);
  const playSettingsRef = useRef({ keyBindings, flickNeedsMotion });
  const fpsLimitRef = useRef(fpsLimit);
  const offsetsRef = useRef({ musicOffset, soundOffset });
  const setOptions = useChunithmChartSettingsStore((state) => state.setOptions);
  const stage = useStagePresentation(
    stageOff ? null : stageBase,
    settings.fieldBrightness,
    settings.showBackground,
  );
  const preparePresentation = stage.prepare;
  const fieldMaskPresentation = stage.enabled ? "external" : undefined;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controls = useRef<PreviewControls | null>(null);
  const resolutionRef = useRef(resolution);
  const [playbackSpeed, setPlaybackSpeed] = useState(settings.playbackSpeed);
  const [alwaysKeepHiSpeed, setAlwaysKeepHiSpeed] = useState(settings.alwaysKeepHiSpeed);
  const playbackRef = useRef({ playbackSpeed, alwaysKeepHiSpeed });
  const speedRef = useRef(initialSpeedRow ?? settings.speedRow);
  const playTimingRef = useRef(settings.playTimingRow);
  const judgeTimingRef = useRef(settings.judgeTimingRow);
  const judgePositionRef = useRef(settings.judgePositionRow);
  const criticalDisplayRef = useRef(settings.criticalDisplayRow);
  const wallRef = useRef(settings.wallRawId);
  const dividerRef = useRef(settings.dividerRow);
  const volumeRef = useRef({ musicVolume, soundVolume });
  const secondsRef = useRef(initialSeconds);
  const initialTimeRef = useRef(initialSeconds);
  const liveRef = useRef<ReturnType<typeof createPreviewLiveState> | null>(null);
  if (!liveRef.current) liveRef.current = createPreviewLiveState();
  const live = liveRef.current;
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState<{ start: number; end: number | null; enabled: boolean } | null>(
    null,
  );
  const loopRef = useRef(loop);
  const updateLoop = (value: typeof loop) => {
    loopRef.current = value;
    setLoop(value);
    controls.current?.setLoop(
      value?.enabled && value.end !== null ? { start: value.start, end: value.end } : null,
    );
  };
  const [seeking, setSeeking] = useState(false);
  const [changingDifficulty, setChangingDifficulty] = useState(false);
  const difficultyRef = useRef(difficulty);
  const [mirror, setMirror] = useState(settings.mirror);
  const mirrorRef = useRef(mirror);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [speedOptions, setSpeedOptions] = useState<FrameSurface["speedOptions"]>([]);
  const [speedValue, setSpeedValue] = useState<string | null>(null);
  const [playTimingValue, setPlayTimingValue] = useState(String(DEFAULT_PLAY_TIMING_ROW));
  const [judgeTimingValue, setJudgeTimingValue] = useState(String(DEFAULT_JUDGE_TIMING_ROW));
  const [judgePositionValue, setJudgePositionValue] = useState(String(DEFAULT_JUDGE_POSITION_ROW));
  const [criticalDisplayValue, setCriticalDisplayValue] = useState(
    String(DEFAULT_JUDGE_DISPLAY_ROW),
  );
  const [fieldWallOptions, setFieldWallOptions] = useState<{ value: string; label: string }[]>([]);
  const [fieldWallValue, setFieldWallValue] = useState<string | null>(null);
  const [dividerOptions, setDividerOptions] = useState<{ value: string; label: string }[]>([]);
  const [dividerValue, setDividerValue] = useState<string | null>(null);
  const [difficultyOptions, setDifficultyOptions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [difficultyValue, setDifficultyValue] = useState<string | null>(null);
  const [playMode, setPlayMode] = useState(false);
  const playModeRef = useRef(playMode);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let publishedPlaying: boolean | undefined;
    let publishedSeeking: boolean | undefined;
    const start = () =>
      createPreviewSession({
        canvas,
        assetBase,
        musicId,
        difficulty: difficultyRef.current,
        initialSeconds: secondsRef.current,
        initialSpeedRow: speedRef.current,
        ...playbackRef.current,
        initialPlayTimingRow: playTimingRef.current,
        initialJudgeTimingRow: judgeTimingRef.current,
        initialJudgePositionRow: judgePositionRef.current,
        initialCriticalDisplayRow: criticalDisplayRef.current,
        mirror: mirrorRef.current,
        initialWallRawId: wallRef.current,
        initialDividerRow: dividerRef.current,
        musicUrl,
        jacketUrl,
        resolution: resolutionRef.current,
        fpsLimit: fpsLimitRef.current,
        ...offsetsRef.current,
        musicVolume: volumeRef.current.musicVolume,
        soundVolume: volumeRef.current.soundVolume,
        fieldMaskPresentation,
        preparePresentation,
        live,
        ui: {
          setStatus,
          setChangingDifficulty,
          setError,
          setPlaying(value) {
            if (publishedPlaying === value) return;
            publishedPlaying = value;
            setPlaying(value);
          },
          setSeeking(value) {
            if (publishedSeeking === value) return;
            publishedSeeking = value;
            setSeeking(value);
          },
          setDurationSeconds(value) {
            setDurationSeconds(value);
            const selected = loopRef.current;
            if (!selected) return;
            if (selected.start >= value) updateLoop(null);
            else if (selected.end !== null && selected.end > value)
              updateLoop({ ...selected, end: value });
          },
          setSpeedOptions,
          setSpeedValue,
          setPlayTimingValue,
          setJudgeTimingValue,
          setJudgePositionValue,
          setCriticalDisplayValue,
          setFieldWallOptions,
          setFieldWallValue,
          setDividerOptions,
          setDividerValue,
          setDifficultyOptions,
          setDifficultyValue,
        },
        setControls(value) {
          controls.current = value;
          value?.setPlaySettings(playSettingsRef.current);
          value?.setPlayMode(playModeRef.current);
          const loop = loopRef.current;
          value?.setLoop(
            loop?.enabled && loop.end !== null ? { start: loop.start, end: loop.end } : null,
          );
        },
      });
    let release: (() => void) | null = null;
    let recovering = false;
    let restored = false;
    const stop = () => {
      release?.();
      release = null;
    };
    const recover = () => {
      if (!recovering || !restored || document.visibilityState === "hidden") return;
      recovering = false;
      release = start();
    };
    const contextLost = (event: Event) => {
      // Cancelling the loss event permits the browser to restore this canvas's context.
      event.preventDefault();
      if (recovering) return;
      recovering = true;
      restored = false;
      secondsRef.current = live.time.getSnapshot();
      stop();
      setPlaying(false);
      setSeeking(false);
      setChangingDifficulty(false);
      setError(null);
      setStatus("loading");
    };
    const contextRestored = () => {
      restored = true;
      recover();
    };
    canvas.addEventListener("webglcontextlost", contextLost);
    canvas.addEventListener("webglcontextrestored", contextRestored);
    document.addEventListener("visibilitychange", recover);
    release = start();
    return () => {
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      document.removeEventListener("visibilitychange", recover);
      stop();
    };
  }, [assetBase, musicId, musicUrl, jacketUrl, live, preparePresentation, fieldMaskPresentation]);
  useEffect(() => {
    if (difficultyRef.current === difficulty) return;
    initialTimeRef.current = initialSeconds;
    difficultyRef.current = difficulty;
    updateLoop(null);
    controls.current?.selectDifficulty(difficulty, initialSeconds);
  }, [difficulty, initialSeconds]);
  useEffect(() => {
    if (initialTimeRef.current === initialSeconds) return;
    initialTimeRef.current = initialSeconds;
    controls.current?.seek(initialSeconds);
  }, [initialSeconds]);
  useEffect(() => {
    if (resolutionRef.current === resolution) return;
    resolutionRef.current = resolution;
    controls.current?.selectResolution(resolution);
  }, [resolution]);
  useEffect(() => {
    fpsLimitRef.current = fpsLimit;
    controls.current?.setFpsLimit(fpsLimit);
  }, [fpsLimit]);
  useEffect(() => {
    volumeRef.current = { musicVolume, soundVolume };
    controls.current?.setVolume(musicVolume, soundVolume);
  }, [musicVolume, soundVolume]);
  useEffect(() => {
    offsetsRef.current = { musicOffset, soundOffset };
    controls.current?.setAudioOffsets(musicOffset, soundOffset);
  }, [musicOffset, soundOffset]);
  useEffect(() => {
    playSettingsRef.current = { keyBindings, flickNeedsMotion };
    controls.current?.setPlaySettings(playSettingsRef.current);
  }, [keyBindings, flickNeedsMotion]);
  return {
    canvasRef,
    live,
    status,
    error,
    playing,
    seeking,
    changingDifficulty,
    mirror,
    durationSeconds,
    speedOptions,
    speedValue,
    playbackSpeed,
    alwaysKeepHiSpeed,
    selectPlaybackSpeed(value: number) {
      playbackRef.current.playbackSpeed = value;
      setPlaybackSpeed(value);
      setOptions({ playbackSpeed: value });
      controls.current?.selectPlaybackSpeed(value);
    },
    selectKeepHiSpeed(value: boolean) {
      playbackRef.current.alwaysKeepHiSpeed = value;
      setAlwaysKeepHiSpeed(value);
      setOptions({ alwaysKeepHiSpeed: value });
      controls.current?.selectKeepHiSpeed(value);
    },
    playTimingValue,
    judgeTimingValue,
    judgePositionValue,
    criticalDisplayValue,
    fieldWallOptions,
    fieldWallValue,
    dividerOptions,
    dividerValue,
    difficultyOptions,
    difficultyValue,
    playMode,
    selectPlayMode(value: boolean) {
      playModeRef.current = value;
      setPlayMode(value);
      controls.current?.setPlayMode(value);
    },
    stage: {
      ...stage,
      selectBackground(value: boolean) {
        setOptions({ showBackground: value });
        stage.selectBackground(value);
        controls.current?.refreshPresentation();
      },
      selectField(value: string) {
        setOptions({ fieldBrightness: value });
        stage.selectField(value);
        controls.current?.refreshPresentation();
      },
    },
    loop,
    markLoopPoint() {
      const at = live.time.getSnapshot();
      if (!loop) updateLoop({ start: at, end: null, enabled: false });
      else if (loop.end !== null) updateLoop(null);
      else if (Math.abs(at - loop.start) >= 0.1)
        updateLoop({
          start: Math.min(at, loop.start),
          end: Math.max(at, loop.start),
          enabled: true,
        });
    },
    toggleLoop() {
      if (loop?.end != null) updateLoop({ ...loop, enabled: !loop.enabled });
    },
    stepMeasure(direction: number) {
      const times = live.chart.getSnapshot()?.measureTimesMs ?? [];
      const now = live.time.getSnapshot() * 1000;
      const target =
        direction < 0
          ? [...times].reverse().find((time) => time < now - 1)
          : times.find((time) => time > now + 1);
      const boundary = direction < 0 ? 0 : durationSeconds;
      controls.current?.seek(
        target === undefined ? boundary : Math.min(target / 1000, durationSeconds),
      );
    },
    restartMeasure() {
      const times = live.chart.getSnapshot()?.measureTimesMs ?? [];
      const now = live.time.getSnapshot() * 1000;
      controls.current?.seek(([...times].reverse().find((time) => time <= now) ?? 0) / 1000);
    },
    captureFrame() {
      if (!controls.current) return Promise.reject(new Error("播放器尚未就绪"));
      return controls.current.captureFrame();
    },
    exportGif(
      range: { start: number; end: number },
      signal: AbortSignal,
      progress: (value: number) => void,
    ) {
      if (!controls.current) return Promise.reject(new Error("播放器尚未就绪"));
      return controls.current.exportGif(range, signal, progress);
    },
    toggle: () => controls.current?.toggle(),
    scrub: (seconds: number) => controls.current?.scrub(seconds),
    seek: (seconds: number) => controls.current?.seek(seconds),
    selectSpeed(value: string) {
      if (!speedOptions.some((option) => option.value === value)) return;
      speedRef.current = Number(value);
      setOptions({ speedRow: Number(value) });
      controls.current?.selectSpeed(value);
    },
    selectPlayTiming(value: string) {
      if (!PLAY_TIMING_OPTIONS.some((option) => option.value === value)) return;
      playTimingRef.current = Number(value);
      setOptions({ playTimingRow: Number(value) });
      controls.current?.selectPlayTiming(value);
    },
    selectJudgeTiming(value: string) {
      if (!JUDGE_TIMING_OPTIONS.some((option) => option.value === value)) return;
      judgeTimingRef.current = Number(value);
      setJudgeTimingValue(value);
      setOptions({ judgeTimingRow: Number(value) });
    },
    applyJudgeTiming(value: string) {
      controls.current?.selectJudgeTiming(value);
    },
    selectJudgePosition(value: string) {
      if (!JUDGE_POSITION_OPTIONS.some((option) => option.value === value)) return;
      judgePositionRef.current = Number(value);
      setOptions({ judgePositionRow: Number(value) });
      controls.current?.selectJudgePosition(value);
    },
    selectCriticalDisplay(value: string) {
      if (!JUDGE_DISPLAY_OPTIONS.some((option) => option.value === value)) return;
      criticalDisplayRef.current = Number(value);
      setOptions({ criticalDisplayRow: Number(value) });
      controls.current?.selectCriticalDisplay(value);
    },
    selectFieldWall(value: string) {
      if (!fieldWallOptions.some((option) => option.value === value)) return;
      wallRef.current = Number(value);
      setOptions({ wallRawId: Number(value) });
      controls.current?.selectFieldWall(value);
    },
    selectDivider(value: string) {
      if (!dividerOptions.some((option) => option.value === value)) return;
      dividerRef.current = Number(value);
      setOptions({ dividerRow: Number(value) });
      controls.current?.selectDivider(value);
    },
    selectMirror(value: boolean) {
      if (value === mirror) return;
      mirrorRef.current = value;
      controls.current?.selectMirror(value);
      setOptions({ mirror: value });
      setMirror(value);
    },
  };
}
