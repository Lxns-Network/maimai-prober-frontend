import {
  laneRows,
  type ControlChange,
  type SurfaceSample,
} from "@lxns-network/chunithm-chart-engine/chart/play/input";
import { createSliderLights } from "@lxns-network/chunithm-chart-engine/chart/play/sliderLights";
import type { ControllerLightWriter } from "../input/controllers/adapter";
import { exportPreviewGif } from "./exportGif";
import { createAbortScope } from "@lxns-network/chunithm-chart-engine/assets/abort";
import { createPreviewAudio, type PreviewMusic } from "./audio";
import { loadEffectResourceList } from "@lxns-network/chunithm-chart-engine/effects/textures";
import { stepForSeconds } from "@lxns-network/chunithm-chart-engine/loop/audioClock";
import { isMusicOutputPending } from "@lxns-network/chunithm-chart-engine/audio/music";
import { readFieldPack, type FieldPackData } from "@lxns-network/chunithm-chart-engine/field";
import type { Pack } from "@lxns-network/chunithm-chart-engine/assets/packFormat";
import { createFrameHost } from "@lxns-network/chunithm-chart-engine/render/frameHost";
import type { FrameHost } from "@lxns-network/chunithm-chart-engine/render/frameTypes";
import type {
  LoopRange,
  PlaySettings,
  PreviewControls,
  PreviewSessionInput,
  PreviewWarmState,
} from "./types";
import type { CanvasResolution } from "./canvasSize";
import { createPreviewViewport } from "./viewport";
import { loadChartInput, readChartSong } from "../assets/chartInput";
import { loadPreviewEffects } from "../rendering/loadEffects";
import { createField, createFieldCamera, type Field } from "../rendering/field";
import { createHudHost, loadHudResources, type HudHost } from "../rendering/hud";
import {
  createNoteHost,
  openPageChartSession,
  readNotePack,
  type NoteHost,
} from "../rendering/notes";
import type {
  ChartSession,
  LoadedChart,
} from "@lxns-network/chunithm-chart-engine/chart/worker/loadChart";
import {
  DEFAULT_PLAY_TIMING_ROW,
  PLAY_TIMING_OPTIONS,
  playTimingSeconds,
} from "../options/playTiming";
import { DEFAULT_JUDGE_POSITION_ROW, JUDGE_POSITION_OPTIONS } from "../options/judgePosition";
import { DEFAULT_JUDGE_DISPLAY_ROW, JUDGE_DISPLAY_OPTIONS } from "../options/judgeDisplay";
import { DEFAULT_JUDGE_TIMING_ROW, JUDGE_TIMING_OPTIONS } from "../options/judgeTiming";
import { createChartOverview } from "./chartOverview";
import {
  compileJudgeTimingIni,
  JUDGE_TIMING_BYTES,
} from "@lxns-network/chunithm-chart-engine/chart/bind/config";
import type { ChartInput } from "../rendering/notes";
import {
  createPlaySession,
  type PlaySession,
} from "@lxns-network/chunithm-chart-engine/chart/play/session";
import type { Judgment } from "@lxns-network/chunithm-chart-engine/chart/play/player";
import { bindBrowserControls } from "../input/browserControls";

const EFFECT_LIST = "effects/resources.json";
/**
 * Poll period on a hidden page, in milliseconds: two polls fit in the 250 ms of cues the SFX player
 * schedules ahead.
 */
const HIDDEN_POLL_MILLISECONDS = 100;
/** Highest difficulty row the judge-window binding distinguishes. */
const MAX_BIND_DIFFICULTY = 3;
/**
 * Steps a note stays drawable past its automatic run while a player plays: the latest a player can
 * judge it, past the widest late window of an AIR, is later than the automatic play judges it.
 */
const LIVE_SLACK_STEPS = 60;
/**
 * Display states of the result text, each plain, with FAST and with LATE; the last row shows only
 * FAST or LATE, and its plain state shows nothing.
 */
const RESULT_TEXT = {
  critical: [0, 8, 9],
  justice: [1, 2, 3],
  attack: [4, 5, 6],
  miss: 7,
  timingOnly: [12, 10, 11],
} as const;

/** The judge-timing configuration a chart input carries, compiled. */
function judgeConfig(bytes: Uint8Array): DataView {
  return bytes.byteLength === JUDGE_TIMING_BYTES
    ? new DataView(bytes.slice().buffer)
    : compileJudgeTimingIni(bytes);
}

/**
 * Runs the page with engine notes and interface over the scene's field, driven by the music clock.
 * Returns the cleanup.
 */
export function createPreviewSession(input: PreviewSessionInput): () => void {
  const { canvas, live, ui } = input;
  const lifetime = new AbortController();
  const signal = lifetime.signal;
  const valid = () => !signal.aborted;
  const startedAt = performance.now();
  const phases: Record<string, number> = {};
  const mark = (phase: string) => {
    if (!import.meta.env.DEV) return;
    phases[phase] = Math.round(performance.now() - startedAt);
    canvas.setAttribute("data-chart-startup", JSON.stringify(phases));
  };

  let frameHost: FrameHost | null = null;

  let wallRawId = 0;
  let dividerRow = input.initialDividerRow ?? 2;
  let dividerColor = 0;
  let dividerOptions: FieldPackData["dividers"] | null = null;
  let field: Field | null = null;
  let notes: NoteHost | null = null;
  let chartSession: ChartSession | null = null;
  let chartInput: Awaited<ReturnType<typeof loadChartInput>> | null = null;
  let effectHost: Awaited<ReturnType<typeof loadPreviewEffects>> | undefined;
  let requestedDifficulty = input.difficulty;
  let requestedChartSeconds = input.initialSeconds;
  let pendingDifficulty = false;
  let changingDifficulty = false;
  let changeRevision = 0;
  let changeController: AbortController | null = null;
  let timingController: AbortController | null = null;
  let judgeTimingRow = input.initialJudgeTimingRow ?? DEFAULT_JUDGE_TIMING_ROW;
  let appliedJudgeTimingRow = judgeTimingRow;
  let hud: HudHost | null = null;
  let hudStartedAt = 0;
  let music: PreviewMusic | null = null;
  let audio: ReturnType<typeof createPreviewAudio> | null = null;
  let releasePresentation: (() => void) | null = null;
  let speedRow = 0;
  let mirror = input.mirror;
  let playbackSpeed = input.playbackSpeed ?? 1;
  let audibleRate = playbackSpeed;
  let alwaysKeepHiSpeed = input.alwaysKeepHiSpeed ?? false;
  let playTimingRow = input.initialPlayTimingRow ?? DEFAULT_PLAY_TIMING_ROW;
  let playTiming = playTimingSeconds(playTimingRow);
  let judgePositionRow = input.initialJudgePositionRow ?? DEFAULT_JUDGE_POSITION_ROW;
  if (!JUDGE_POSITION_OPTIONS[judgePositionRow])
    throw new RangeError("Invalid initial judge position option");
  let criticalDisplayRow = input.initialCriticalDisplayRow ?? DEFAULT_JUDGE_DISPLAY_ROW;
  if (!JUDGE_DISPLAY_OPTIONS[criticalDisplayRow])
    throw new RangeError("Invalid initial critical display option");
  let durationSeconds = Infinity;
  let seconds = input.initialSeconds;
  /** Whether the player plays the chart instead of watching the automatic play. */
  let playMode = false;
  let surface: SurfaceSample | null = null;
  let play: PlaySession | null = null;
  let lightWriter: ControllerLightWriter | null = null;
  let sliderLights: ReturnType<typeof createSliderLights> | undefined;
  const bindLights = () => {
    sliderLights =
      playMode && lightWriter ? createSliderLights(lightWriter, dividerRow) : undefined;
  };
  /** Chart and judge row the next computed chart was requested with. */
  let liveInput: { chart: ChartInput; judgeTimingRow: number } | null = null;
  /** The music at its last poll, for placing key and touch events on the chart's clock. */
  const clock = { performance: 0, seconds: 0, rate: 1, playing: false };
  let playSettings: PlaySettings | null = null;
  let desiredPlaying = false;
  let loopRange: LoopRange | null = null;
  /** Where a drag of the timeline is, and whether playback picks up there once it is let go. */
  let scrubbing: { seconds: number; resume: boolean } | null = null;
  let frame = 0;
  let hiddenTimer: ReturnType<typeof setInterval> | null = null;
  let fpsLimit = input.fpsLimit ?? 0;
  let nextDrawTime = 0;
  let ready = false;
  const capture = import.meta.env.DEV && new URLSearchParams(window.location.search).has("capture");
  /** Set once a recording drives the frames, which stops the animation loop for good. */
  let capturing = false;
  const warmState: PreviewWarmState = { playing: false, busy: true, blockedUntil: 0 };
  let previousFrameTime = 0;
  let displayInterval = 1000 / 60;
  let fpsSampleStart: number | null = null;
  let renderedFrames = 0;
  let frameCallbacks = 0;
  let frameWorkMs = 0;
  let maximumFrameWorkMs = 0;
  const resetFps = () => {
    fpsSampleStart = null;
    renderedFrames = 0;
    frameCallbacks = 0;
    frameWorkMs = maximumFrameWorkMs = 0;
    live.setFrameStats(null);
  };
  const readWarmState = () => {
    warmState.playing = desiredPlaying;
    warmState.busy =
      !ready ||
      capturing ||
      changingDifficulty ||
      scrubbing !== null ||
      document.visibilityState === "hidden";
    return warmState;
  };
  const draw = (at: number, textSeconds = (performance.now() - hudStartedAt) / 1000) => {
    if (!frameHost) return;
    viewport.apply();
    const clamped = Math.max(
      0,
      Math.min(
        at,
        Number.isFinite(durationSeconds) ? durationSeconds : (notes?.timeline.duration ?? Infinity),
      ),
    );
    const chartSeconds = clamped - playTiming;
    frameHost.render(
      clamped,
      speedRow,
      chartSeconds,
      alwaysKeepHiSpeed ? 1 / audibleRate : 1,
      audibleRate,
    );
    hud?.draw(stepForSeconds(chartSeconds), textSeconds);
    live.setSeconds(clamped);
    if (import.meta.env.DEV) canvas.setAttribute("data-chart-frame", String(clamped));
  };
  /** The loop's draw: a hidden page keeps polling the music without rendering unseen frames. */
  const present = (at: number) => {
    if (document.visibilityState === "hidden") return;
    draw(at);
    if (!desiredPlaying) {
      resetFps();
      return;
    }
    if (import.meta.env.DEV) renderedFrames++;
  };
  const playStep = (at: number) => stepForSeconds(at - playTiming);
  const restartPlayAt = (at: number) => {
    clock.playing = false;
    browserControls.releaseAll();
    sliderLights?.reset();
    play?.restart(playStep(at));
  };
  /** Display state of a judgment's result text, under the critical display option. */
  const resultText = (judgment: Judgment): number | null => {
    const { grade } = judgment;
    const timing = !judgment.timing || grade === 4 ? 0 : judgment.timing < 0 ? 1 : 2;
    if (grade === 0) return RESULT_TEXT.miss;
    if (grade === 1) return RESULT_TEXT.attack[timing];
    if (grade === 2) return RESULT_TEXT.justice[timing];
    // The critical display option: its text, its text with FAST/LATE, FAST/LATE alone, or nothing.
    const state = [
      RESULT_TEXT.critical[0],
      RESULT_TEXT.critical[timing],
      RESULT_TEXT.timingOnly[timing],
    ][criticalDisplayRow];
    return state === undefined || state === RESULT_TEXT.timingOnly[0] ? null : state;
  };
  /** The play of a newly computed chart, judging with the lane layout on screen. */
  const liveFor = (chart: LoadedChart) => {
    const requested = liveInput ?? { chart: chartInput!, judgeTimingRow: appliedJudgeTimingRow };
    sliderLights?.reset();
    const next = createPlaySession({
      chart,
      config: judgeConfig(requested.chart.config),
      difficulty: Math.min(requested.chart.difficulty, MAX_BIND_DIFFICULTY),
      judgeTimingRow: requested.judgeTimingRow,
      sounds: () => audio?.liveSounds ?? null,
      get sliderLights() {
        return sliderLights;
      },
      text: resultText,
      options: () => ({
        surface,
        get flickNeedsMotion() {
          return playSettings?.flickNeedsMotion ?? true;
        },
      }),
    });
    if (mirror !== requested.chart.mirror && chart.mirrored)
      next.selectScore(chart.mirrored.score, 0);
    next.stats.subscribe(() => live.setPlayStats(next.playing ? next.stats.getSnapshot() : null));
    play = next;
    if (playMode) {
      next.setPlaying(true, playStep(seconds));
      hud?.readValuesFrom(next.hudValues);
    }
    return next.live;
  };
  /** Passes control changes an event made at `timeStamp` to a running play. */
  const send = (changes: ControlChange[], timeStamp: number) => {
    if (!changes.length || !play || !clock.playing || !desiredPlaying) return;
    const at = clock.seconds + ((timeStamp - clock.performance) / 1000) * clock.rate - playTiming;
    for (const change of changes) play.control(change, at);
    request(false);
  };
  /** Lets go of every key and touch and pauses a play the page lost focus during. */
  const focusLost = () => {
    for (const change of browserControls.releaseAll())
      if (clock.playing) play?.control(change, clock.seconds - playTiming);
    if (playMode && desiredPlaying) controls.toggle();
  };
  const browserControls = bindBrowserControls(canvas, signal, {
    keyBindings: () =>
      playMode && play && !capturing ? (playSettings?.keyBindings ?? null) : null,
    keyboardPlaying: () => clock.playing && desiredPlaying,
    touchProjection: () => (play ? (notes?.viewProjection ?? null) : null),
    onChange: send,
    toggle: () => controls.toggle(),
    onBlur: focusLost,
  });
  const release = () => {
    resetFps();
    changeController?.abort();
    viewport.dispose();
    document.removeEventListener("visibilitychange", visibilityChanged);
    if (hiddenTimer !== null) clearInterval(hiddenTimer);
    hiddenTimer = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lightWriter?.(null);
    lightWriter = null;
    sliderLights = undefined;
    input.setControls(null);
    releasePresentation?.();
    releasePresentation = null;
    hud?.dispose();
    hud = null;
    field?.dispose();
    field = null;
    notes?.dispose();
    notes = null;
    chartSession?.dispose();
    chartSession = null;
    audio?.dispose();
    audio = null;
    music = null;
    frameHost?.dispose();
    frameHost = null;
  };
  const fail = (cause: unknown) => {
    if (!valid()) return;
    if (cause instanceof DOMException && cause.name === "AbortError") return;
    // Context loss can interrupt a draw before the browser dispatches its loss event.
    if (canvas.getContext("webgl2")?.isContextLost()) return;
    lifetime.abort();
    release();
    ui.setPlaying(false);
    ui.setSeeking(false);
    ui.setError(cause instanceof Error ? cause.message : String(cause));
    ui.setStatus("error");
  };
  const tick = (timestamp: number) => {
    frame = 0;
    if (!valid() || !ready || capturing || changingDifficulty) return;
    const started = performance.now();
    if (desiredPlaying && previousFrameTime) {
      const gap = timestamp - previousFrameTime;
      if (gap > 0 && gap < displayInterval) displayInterval = gap;
      if (gap > displayInterval * 1.5) warmState.blockedUntil = started + 200;
    }
    previousFrameTime = desiredPlaying ? timestamp : 0;
    try {
      if (music && audio?.running && scrubbing) {
        const state = music.poll();
        audibleRate = state.position.playbackRate;
        ui.setSeeking(state.transitioning);
        if (state.needsFrame) request();
        present(scrubbing.seconds);
      } else if (music && audio?.running) {
        const state = music.poll();
        audibleRate = state.position.playbackRate;
        if (
          loopRange &&
          desiredPlaying &&
          !state.transitioning &&
          (state.position.phase === "ended" || state.position.bufferSeconds >= loopRange.end)
        ) {
          music.seek(loopRange.start);
          music.play();
          audio?.pauseSfx();
          frameHost?.resetBackgroundHistory();
          seconds = loopRange.start;
          restartPlayAt(seconds);
          present(seconds);
          request();
          return;
        }
        if (play?.playing) audio?.trackLiveSfx(state, playTiming);
        else audio?.updateSfx(state, playTiming);
        clock.performance = state.position.performanceTime;
        clock.seconds = state.position.bufferSeconds;
        clock.rate = state.position.playbackRate ?? 1;
        clock.playing = state.intendedPlaying && state.position.phase === "playing";
        if (
          !state.transitioning &&
          state.requestedSeconds === null &&
          state.position.bufferSeconds >= durationSeconds
        ) {
          music.pause();
          audio?.pauseSfx();
          desiredPlaying = false;
          ui.setPlaying(false);
          seconds = durationSeconds;
          if (play?.playing) play.advance(playStep(seconds), true);
          sliderLights?.reset();
          present(seconds);
          if (state.position.phase === "playing" || hud?.scrolling) request();
          return;
        }
        desiredPlaying = state.intendedPlaying;
        ui.setPlaying(state.intendedPlaying);
        ui.setSeeking(state.transitioning);
        seconds = state.requestedSeconds ?? state.position.bufferSeconds;
        if (play?.playing && desiredPlaying && !state.transitioning)
          play.advance(playStep(seconds));
        if (!fpsLimit || !desiredPlaying || state.transitioning || timestamp >= nextDrawTime) {
          present(seconds);
          if (fpsLimit) {
            const interval = 1000 / fpsLimit;
            nextDrawTime =
              nextDrawTime > 0 && timestamp >= nextDrawTime
                ? timestamp + interval - ((timestamp - nextDrawTime) % interval)
                : timestamp + interval;
          }
        }
        if (state.needsFrame) request(false);
      } else present(scrubbing?.seconds ?? seconds);
      if (hud?.scrolling) request(false);
    } catch (cause) {
      if (isMusicOutputPending(cause)) request();
      else fail(cause);
    } finally {
      const now = performance.now();
      const workMs = now - started;
      const budget = fpsLimit ? Math.max(displayInterval, 1000 / fpsLimit) : displayInterval;
      if (workMs > budget * 0.7) warmState.blockedUntil = now + 200;
      if (
        import.meta.env.DEV &&
        valid() &&
        desiredPlaying &&
        document.visibilityState !== "hidden"
      ) {
        if (fpsSampleStart === null) {
          fpsSampleStart = now;
          renderedFrames = 0;
        } else {
          frameCallbacks++;
          frameWorkMs += workMs;
          maximumFrameWorkMs = Math.max(maximumFrameWorkMs, workMs);
          const elapsed = now - fpsSampleStart;
          if (elapsed >= 1000) {
            live.setFrameStats({
              fps: Math.round((renderedFrames * 1000) / elapsed),
              callbacksPerSecond: Math.round((frameCallbacks * 1000) / elapsed),
              averageWorkMs: frameWorkMs / frameCallbacks,
              maximumWorkMs: maximumFrameWorkMs,
              width: canvas.width,
              height: canvas.height,
            });
            fpsSampleStart = now;
            renderedFrames = frameCallbacks = 0;
            frameWorkMs = maximumFrameWorkMs = 0;
          }
        }
      }
    }
  };
  const request = (redraw = true) => {
    if (redraw) nextDrawTime = 0;
    if (valid() && !frame && !capturing) frame = requestAnimationFrame(tick);
  };
  const viewport = createPreviewViewport(
    canvas,
    input.resolution ?? "auto",
    () => !ready || capturing,
    request,
  );
  /**
   * Animation frames stop on a hidden page while the music plays on, so a timer polls the music
   * there for looping, the end of the chart and SFX scheduling. Showing the page draws again.
   */
  const visibilityChanged = () => {
    resetFps();
    if (hiddenTimer !== null) clearInterval(hiddenTimer);
    hiddenTimer = null;
    if (document.visibilityState !== "hidden") {
      request();
      return;
    }
    if (playMode) focusLost();
    hiddenTimer = setInterval(() => {
      if (!desiredPlaying) return;
      // A frame requested by the previous poll never ran; left queued, they all run on return.
      if (frame) cancelAnimationFrame(frame);
      tick(performance.now());
    }, HIDDEN_POLL_MILLISECONDS);
  };
  document.addEventListener("visibilitychange", visibilityChanged);

  const changeJudgeTiming = async () => {
    timingController?.abort();
    timingController = null;
    if (
      !ready ||
      !chartInput ||
      !notes ||
      !hud ||
      !audio ||
      capturing ||
      changingDifficulty ||
      appliedJudgeTimingRow === judgeTimingRow
    )
      return;
    const row = judgeTimingRow;
    const controller = new AbortController();
    timingController = controller;
    const scope = createAbortScope([signal, controller.signal]);
    const worker = openPageChartSession(chartInput);
    const cancel = () => worker.dispose();
    scope.signal.addEventListener("abort", cancel, { once: true });
    try {
      const next = await worker.compute(speedRow, scope.signal, row);
      if (scope.signal.aborted) return;
      await effectHost?.ensureEffects(next.effects);
      if (next.mirrored) await effectHost?.ensureEffects(next.mirrored.effects);
      if (scope.signal.aborted) return;
      // Export keeps its original timeline for the whole capture.
      if (capturing) return;
      liveInput = { chart: chartInput, judgeTimingRow: row };
      notes.replaceChart(next, chartInput.mirror);
      notes.selectMirror(mirror);
      hud.replaceChart(chartInput.song, next.timeline);
      audio.replaceSfx(next.timeline);
      live.setChart(createChartOverview(next.timeline, next.score));
      appliedJudgeTimingRow = row;
      if (capture)
        Object.assign((window as unknown as { __chartCapture: object }).__chartCapture, {
          timeline: next.timeline,
        });
      request();
    } catch (cause) {
      if (!scope.signal.aborted) throw cause;
    } finally {
      scope.signal.removeEventListener("abort", cancel);
      worker.dispose();
      scope.dispose();
      if (timingController === controller) timingController = null;
    }
  };

  const changeDifficulty = async () => {
    if (!ready || !chartInput || !notes || !hud || !audio || !music || capturing) return;
    pendingDifficulty = false;
    timingController?.abort();
    timingController = null;
    const timingRow = judgeTimingRow;
    const original = chartInput;
    const difficulty = original.difficulties.some(
      (item) => Number(item.value) === requestedDifficulty,
    )
      ? requestedDifficulty!
      : Number(original.difficulties[original.difficulties.length - 1].value);
    changeController?.abort();
    const revision = ++changeRevision;
    const controller = new AbortController();
    changeController = controller;
    const scope = createAbortScope([signal, controller.signal]);
    changingDifficulty = true;
    sliderLights?.reset();
    resetFps();
    ui.setChangingDifficulty(true);
    desiredPlaying = false;
    clock.playing = false;
    scrubbing = null;
    music.pause();
    audio.pauseSfx();
    ui.setPlaying(false);
    ui.setSeeking(false);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    const nextInput = {
      ...original,
      difficulty,
      mirror,
      song: readChartSong(original.bytes, difficulty),
    };
    const worker = openPageChartSession(nextInput);
    const cancelWorker = () => worker.dispose();
    scope.signal.addEventListener("abort", cancelWorker, { once: true });
    try {
      const next = await worker.compute(speedRow, scope.signal, timingRow);
      if (scope.signal.aborted) return;
      await effectHost?.ensureEffects(next.effects);
      if (next.mirrored) await effectHost?.ensureEffects(next.mirrored.effects);
      if (scope.signal.aborted) return;
      await audio.connectSfx(next.timeline);
      if (scope.signal.aborted) return;
      seconds = Math.min(requestedChartSeconds, durationSeconds);
      browserControls.releaseAll();
      liveInput = { chart: nextInput, judgeTimingRow: timingRow };
      notes.replaceChart(next, nextInput.mirror);
      notes.selectMirror(mirror);
      hud.replaceChart(nextInput.song, next.timeline);
      chartInput = nextInput;
      appliedJudgeTimingRow = timingRow;
      live.setChart(createChartOverview(next.timeline, next.score));
      if (capture)
        Object.assign((window as unknown as { __chartCapture: object }).__chartCapture, {
          timeline: next.timeline,
        });
      ui.setDifficultyValue(String(difficulty));
      music.seek(seconds);
      frameHost?.resetBackgroundHistory();
      draw(seconds);
    } catch (cause) {
      if (!scope.signal.aborted) fail(cause);
    } finally {
      scope.signal.removeEventListener("abort", cancelWorker);
      worker.dispose();
      scope.dispose();
      if (revision === changeRevision && valid()) {
        changeController = null;
        changingDifficulty = false;
        ui.setChangingDifficulty(false);
        void changeJudgeTiming().catch(fail);
        request();
      }
    }
  };

  const controls: PreviewControls = {
    setControllerLights(writer) {
      if (lightWriter === writer) return;
      lightWriter?.(null);
      lightWriter = writer;
      bindLights();
    },
    controllerInput(sample, receivedAt) {
      if (playMode && !!surface !== !!sample) browserControls.setEnabled(!sample);
      const previousTouch = surface?.touch;
      surface = sample;
      if (!playMode || !sample) return;
      if (clock.playing && desiredPlaying && !scrubbing) {
        const at =
          clock.seconds + ((receivedAt - clock.performance) / 1000) * clock.rate - playTiming;
        play?.surface(sample, at);
      } else {
        play?.seedSurface(sample);
        if (
          sliderLights &&
          sample.touch !== previousTouch &&
          !desiredPlaying &&
          !scrubbing &&
          !capturing &&
          !changingDifficulty
        ) {
          const [front, rear] = laneRows(sample.touch);
          sliderLights.reset(front | rear);
        }
      }
    },
    selectDifficulty(value, at = 0) {
      requestedDifficulty = value;
      requestedChartSeconds = at;
      pendingDifficulty = true;
      void changeDifficulty().catch(fail);
    },
    setLoop(range) {
      loopRange = range;
    },
    captureFrame() {
      if (changingDifficulty) return Promise.reject(new Error("播放器正在切换难度"));
      draw(scrubbing?.seconds ?? seconds);
      return new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("无法获取当前帧"))),
          "image/png",
        ),
      );
    },
    async exportGif(range, exportSignal, progress) {
      if (!ready || !music || capturing || changingDifficulty) throw new Error("播放器尚未就绪");
      if (
        range.start < 0 ||
        range.end > durationSeconds ||
        range.end - range.start < 0.5 ||
        (range.end - range.start) / playbackSpeed > 15
      )
        throw new RangeError("请选择至少 0.5 秒谱面、播放时长不超过 15 秒的导出范围");
      const active = music;
      const restoreSeconds = live.time.getSnapshot();
      const resume = desiredPlaying;
      const restoreRate = audibleRate;
      const exportTextSeconds = (performance.now() - hudStartedAt) / 1000;
      capturing = true;
      sliderLights?.reset();
      resetFps();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      let restoreLive: (() => void) | undefined;
      const exportScope = createAbortScope([signal, exportSignal]);
      try {
        desiredPlaying = false;
        active.pause();
        audio?.pauseSfx();
        ui.setPlaying(false);
        await new Promise<void>((resolve, reject) => {
          let pendingFrame = 0;
          const finish = (cause?: unknown) => {
            if (pendingFrame) cancelAnimationFrame(pendingFrame);
            exportScope.signal.removeEventListener("abort", abort);
            if (cause === undefined) resolve();
            else reject(cause);
          };
          const abort = () =>
            finish(exportScope.signal.reason ?? new DOMException("Aborted", "AbortError"));
          const pause = () => {
            pendingFrame = 0;
            try {
              if (!audio?.running || !active.poll().needsFrame) {
                finish();
                return;
              }
            } catch (cause) {
              if (!isMusicOutputPending(cause)) {
                finish(cause);
                return;
              }
            }
            pendingFrame = requestAnimationFrame(pause);
          };
          exportScope.signal.addEventListener("abort", abort, { once: true });
          if (exportScope.signal.aborted) abort();
          else pause();
        });
        audibleRate = playbackSpeed;
        frameHost?.resetBackgroundHistory();
        if (play?.playing) {
          restoreLive = notes?.showRecorded();
          hud?.readValuesFrom(null);
        }
        return await exportPreviewGif(
          canvas,
          range,
          playbackSpeed,
          exportScope.signal,
          progress,
          (at) => draw(at, exportTextSeconds + (at - range.start) / playbackSpeed),
        );
      } finally {
        exportScope.dispose();
        capturing = false;
        audibleRate = restoreRate;
        if (valid()) {
          restoreLive?.();
          if (restoreLive && play?.playing) hud?.readValuesFrom(play.hudValues);
          seconds = restoreSeconds;
          frameHost?.resetBackgroundHistory();
          active.seek(restoreSeconds);
          if (resume && !pendingDifficulty) active.play();
          else active.pause();
          desiredPlaying = resume && !pendingDifficulty;
          ui.setPlaying(desiredPlaying);
          draw(restoreSeconds);
          if (pendingDifficulty) void changeDifficulty().catch(fail);
          else {
            void changeJudgeTiming().catch(fail);
            request();
          }
        }
      }
    },
    toggle() {
      if (!music || !audio || changingDifficulty || capturing) return;
      resetFps();
      if (scrubbing) {
        seconds = scrubbing.seconds;
        scrubbing = null;
        frameHost?.resetBackgroundHistory();
        restartPlayAt(seconds);
        music.seek(seconds);
        live.setSeconds(seconds);
      }
      desiredPlaying = !desiredPlaying;
      if (desiredPlaying && playMode && !surface) canvas.focus({ preventScroll: true });
      if (desiredPlaying && (live.time.getSnapshot() >= durationSeconds || play?.finished)) {
        seconds = 0;
        restartPlayAt(seconds);
        music.seek(seconds);
        frameHost?.resetBackgroundHistory();
        live.setSeconds(seconds);
      }
      ui.setPlaying(desiredPlaying);
      const active = music;
      if (desiredPlaying)
        void active
          .activate()
          .then(() => {
            if (!valid()) return;
            if (desiredPlaying) {
              active.play();
              try {
                const state = active.poll();
                audibleRate = state.position.playbackRate;
                if (play?.playing) audio?.trackLiveSfx(state, playTiming);
                else audio?.updateSfx(state, playTiming);
              } catch (cause) {
                if (!isMusicOutputPending(cause)) throw cause;
              }
            }
            request();
          })
          .catch(fail);
      else {
        seconds = live.time.getSnapshot();
        clock.playing = false;
        sliderLights?.reset();
        for (const change of browserControls.releaseAll())
          play?.control(change, seconds - playTiming);
        active.seek(seconds);
        active.pause();
        audio.pauseSfx();
        request();
      }
    },
    scrub(target) {
      if (!music || !Number.isFinite(target) || target < 0 || target > durationSeconds) return;
      if (!scrubbing) {
        scrubbing = { seconds: target, resume: desiredPlaying };
        sliderLights?.reset();
        if (desiredPlaying) music.pause();
        desiredPlaying = false;
        ui.setPlaying(false);
        audio?.pauseSfx();
      }
      scrubbing.seconds = target;
      frameHost?.resetBackgroundHistory();
      live.setSeconds(target);
      request();
    },
    seek(target) {
      if (
        (!music || changingDifficulty || pendingDifficulty) &&
        Number.isFinite(target) &&
        target >= 0 &&
        target <= durationSeconds
      ) {
        requestedChartSeconds = target;
        if (!music) seconds = target;
        return;
      }
      const resume = scrubbing?.resume ?? false;
      scrubbing = null;
      if (!music || !Number.isFinite(target) || target < 0 || target > durationSeconds) {
        if (resume && music) {
          desiredPlaying = true;
          ui.setPlaying(true);
          music.play();
        }
        request();
        return;
      }
      seconds = target;
      restartPlayAt(target);
      frameHost?.resetBackgroundHistory();
      music.seek(target);
      if (resume && target < durationSeconds) {
        desiredPlaying = true;
        ui.setPlaying(true);
        music.play();
      }
      live.setSeconds(target);
      request();
    },
    selectPlaybackSpeed(value) {
      music?.setPlaybackRate(value);
      playbackSpeed = value;
      if (!audio?.running) audibleRate = value;
      request();
    },
    selectKeepHiSpeed(value) {
      alwaysKeepHiSpeed = value;
      request();
    },
    selectSpeed(value) {
      if (!frameHost?.speedOptions.some((row) => row.value === value)) return;
      speedRow = Number(value);
      ui.setSpeedValue(value);
      hud?.selectSpeed(speedRow);
      request();
    },
    selectMirror(value) {
      const chart = notes?.chart;
      sliderLights?.reset();
      if (chart && chartInput)
        play?.selectScore(
          value === chartInput.mirror ? chart.score : (chart.mirrored?.score ?? chart.score),
          playStep(seconds),
        );
      notes?.selectMirror(value);
      hud?.selectMirror(value);
      mirror = value;
      request();
    },
    selectJudgeTiming(value) {
      if (!JUDGE_TIMING_OPTIONS.some((option) => option.value === value)) return;
      judgeTimingRow = Number(value);
      ui.setJudgeTimingValue(value);
      void changeJudgeTiming().catch(fail);
    },
    selectPlayTiming(value) {
      if (!PLAY_TIMING_OPTIONS.some((option) => option.value === value)) return;
      const row = Number(value);
      if (row === playTimingRow) return;
      playTimingRow = row;
      playTiming = playTimingSeconds(row);
      ui.setPlayTimingValue(value);
      audio?.pauseSfx();
      request();
    },
    selectJudgePosition(value) {
      const row = JUDGE_POSITION_OPTIONS.findIndex((option) => option.value === value);
      if (row < 0 || row === judgePositionRow) return;
      judgePositionRow = row;
      ui.setJudgePositionValue(value);
      request();
    },
    selectCriticalDisplay(value) {
      const row = JUDGE_DISPLAY_OPTIONS.findIndex((option) => option.value === value);
      if (row < 0 || row === criticalDisplayRow) return;
      criticalDisplayRow = row;
      ui.setCriticalDisplayValue(value);
      request();
    },
    selectFieldWall(value) {
      if (!field) return;
      const rawId = Number(value);
      if (!Number.isInteger(rawId) || rawId < 0 || rawId > 16)
        throw new RangeError("FieldWall rawId must be 0..16");
      wallRawId = rawId;
      ui.setFieldWallValue(value);
      request();
    },
    selectDivider(value) {
      if (!dividerOptions?.rows.some((row) => row.value === value)) return;
      dividerRow = Number(value);
      sliderLights?.selectDivider(dividerRow);
      ui.setDividerValue(value);
      request();
    },
    selectResolution(value) {
      viewport.selectResolution(value);
    },
    setFpsLimit(value) {
      fpsLimit = value;
      resetFps();
      request();
    },
    setAudioOffsets(nextMusicOffset, nextSoundOffset) {
      audio?.setOffsets(nextMusicOffset, nextSoundOffset, scrubbing?.seconds ?? seconds);
      if (music) {
        durationSeconds = music.durationSeconds;
        seconds = Math.min(seconds, durationSeconds);
        if (scrubbing) scrubbing.seconds = Math.min(scrubbing.seconds, durationSeconds);
        ui.setDurationSeconds(durationSeconds);
      }
      request();
    },
    setVolume(musicVolume, soundVolume) {
      audio?.setVolume(musicVolume, soundVolume);
    },
    refreshPresentation() {
      request();
    },
    setPlayMode(value) {
      if (value === playMode) return;
      playMode = value;
      bindLights();
      if (!value) lightWriter?.(null);
      browserControls.releaseAll();
      browserControls.setEnabled(value && !surface);
      if (value && desiredPlaying && !surface) canvas.focus({ preventScroll: true });
      audio?.pauseSfx();
      if (value && notes && effectHost)
        void effectHost
          .ensureEffects(notes.effects, true)
          .then(() => request())
          .catch(fail);
      notes?.setLiveSlack(value ? LIVE_SLACK_STEPS : 0);
      play?.setPlaying(value, playStep(scrubbing?.seconds ?? seconds));
      hud?.readValuesFrom(value && play ? play.hudValues : null);
      live.setPlayStats(value && play ? play.stats.getSnapshot() : null);
      request();
    },
    setPlaySettings(value) {
      if (playSettings?.keyBindings !== value.keyBindings)
        send(browserControls.releaseAll(), performance.now());
      playSettings = value;
    },
  };
  input.setControls(controls);
  ui.setStatus("loading");
  ui.setError(null);
  ui.setPlaying(false);
  ui.setSeeking(false);
  live.setSeconds(input.initialSeconds);

  void (async () => {
    const initialRow = input.initialSpeedRow ?? 28;
    const base = input.assetBase;
    const search = new URLSearchParams(window.location.search);
    const effectsOff = import.meta.env.DEV && search.get("effect_diagnostic") === "off";
    const wallOverride =
      import.meta.env.DEV && search.get("wall") !== null ? Number(search.get("wall")) : null;
    const chartReady = loadChartInput({
      assetBase: base,
      musicId: input.musicId,
      difficulty: input.difficulty,
      mirror: input.mirror,
      signal,
    });
    chartReady.then(
      (chart) => {
        if (!valid()) return;
        ui.setDifficultyOptions(chart.difficulties);
        ui.setDifficultyValue(String(chart.difficulty));
      },
      () => {},
    );
    const firstReady = chartReady.then((chart) => {
      if (!valid()) throw new DOMException("The page was left", "AbortError");
      chartSession = openPageChartSession(chart);
      return chartSession.compute(initialRow, signal, judgeTimingRow).finally(() => {
        chartSession?.dispose();
        chartSession = null;
      });
    });
    let notePack: Promise<Pack> | null = readNotePack(base, signal);
    const fieldReady = notePack.then(readFieldPack);
    const effectList = new URL(EFFECT_LIST, base).href;
    const effectManifest = effectsOff ? undefined : loadEffectResourceList(effectList, signal);
    const hudReady = loadHudResources({
      base,
      song: chartReady.then((chart) => chart.song),
      jacketUrl: input.jacketUrl
        ? Promise.resolve(input.jacketUrl)
        : chartReady.then((chart) => chart.jacketUrl),
      signal,
    });

    const musicAddress = input.musicUrl
      ? Promise.resolve(input.musicUrl)
      : chartReady.then((chart) => chart.musicUrl);
    audio = createPreviewAudio({
      assetBase: base,
      musicAddress,
      signal,
      initialSeconds: input.initialSeconds,
      playbackSpeed,
      musicOffset: input.musicOffset ?? 0,
      soundOffset: input.soundOffset ?? 0,
      musicVolume: input.musicVolume ?? 0.8,
      soundVolume: input.soundVolume ?? 0.6,
    });
    const musicReady = audio.ready;
    for (const pending of [
      chartReady,
      firstReady,
      notePack,
      fieldReady,
      hudReady,
      musicReady,
      effectManifest,
    ])
      pending?.catch(() => {});
    void chartReady.then(
      () => mark("chart-input"),
      () => {},
    );
    void firstReady.then(
      () => mark("bake"),
      () => {},
    );
    void hudReady.then(
      () => mark("hud-resources"),
      () => {},
    );

    const data: FieldPackData = await fieldReady;
    if (!valid()) return;
    dividerOptions = data.dividers;
    dividerRow = input.initialDividerRow ?? data.dividers.defaultRow;
    if (!data.dividers.rows.some((row) => Number(row.value) === dividerRow))
      throw new RangeError("Invalid initial field divider option");
    sliderLights?.selectDivider(dividerRow);
    dividerColor = data.dividers.defaultColor;
    const host = createFrameHost({
      canvas,
      environment: data.camera.environment,
      speedOptions: data.speedOptions,
      evaluateCamera: createFieldCamera(data),
    });
    frameHost = host;
    const maskShown = input.fieldMaskPresentation !== "external";
    wallRawId = wallOverride ?? input.initialWallRawId ?? 0;

    mark("scene");
    if (input.preparePresentation)
      void input
        .preparePresentation(
          host,
          chartReady.then((chart) => chart.stage),
          signal,
          (color) => {
            dividerColor = color;
            request();
          },
          musicReady.then((music) => music.durationSeconds),
          readWarmState,
        )
        .then((releasePrepared) => {
          if (!valid()) releasePrepared();
          else {
            releasePresentation = releasePrepared;
            request();
          }
        })
        .catch(fail);
    ui.setSpeedOptions(host.speedOptions);
    const selected = host.speedOptions.find((item) => Number(item.value) === initialRow);
    if (!selected) throw new RangeError("speedRow is outside the scene's option rows");
    speedRow = initialRow;
    ui.setSpeedValue(selected.value);
    ui.setPlayTimingValue(String(playTimingRow));
    ui.setJudgeTimingValue(String(judgeTimingRow));
    ui.setJudgePositionValue(String(judgePositionRow));
    ui.setCriticalDisplayValue(String(criticalDisplayRow));
    ui.setFieldWallOptions(
      data.wall.positions.map((item) => ({
        value: String(item.rawId),
        label: String(item.number),
      })),
    );
    ui.setFieldWallValue(String(wallRawId));
    ui.setDividerOptions(data.dividers.rows.map((row) => ({ ...row })));
    ui.setDividerValue(String(dividerRow));

    if (!valid()) return;

    const effectsReady = effectsOff
      ? undefined
      : firstReady.then(async (first) => {
          return loadPreviewEffects({
            canvas,
            scene: host,
            effectList,
            manifest: effectManifest,
            effects: first.effects,
            playMode,
            signal,
            textureOverride: search.get("texture"),
          });
        });
    void effectsReady?.then(
      () => mark("effects"),
      () => mark("effects-failed"),
    );
    const chart = await chartReady;
    liveInput = { chart, judgeTimingRow };
    const noteHost = await createNoteHost({
      live: liveFor,
      liveEffects: () => (!capturing && play?.playing ? play.effects : null),
      canvas,
      field: data,
      scene: host,
      speedRow,
      chart,
      first: firstReady,
      session: chartSession ?? undefined,
      takePack: () => {
        const pack = notePack!;
        notePack = null;
        return pack;
      },
      effects: effectsReady,
      judgePositionOffset: () => JUDGE_POSITION_OPTIONS[judgePositionRow].offset,
      criticalDisplayRow: () => criticalDisplayRow,
      base,
      signal,
      onChange: request,
    });
    if (!valid()) {
      noteHost.dispose();
      return;
    }
    notes = noteHost;
    if (playMode) notes.setLiveSlack(LIVE_SLACK_STEPS);
    if (mirror !== input.mirror) notes.selectMirror(mirror);
    live.setChart(createChartOverview(noteHost.timeline, noteHost.score));
    mark("notes");
    const layer = await createField({
      gl: canvas.getContext("webgl2") as WebGL2RenderingContext,
      data,
      textures: noteHost.textures,
    });
    if (!valid()) {
      layer.dispose();
      return;
    }
    field = layer;
    host.setScenery((camera, seconds, speedRow, speedMultiplier) =>
      layer.draws({
        score: noteHost!.score,
        seconds,
        speedRow,
        speedMultiplier,
        camera,
        environment: data.camera.environment,
        wallRawId,
        maskShown,
        dividerRow,
        dividerColor,
      }),
    );
    mark("field");
    const resources = await hudReady;
    if (!valid()) return;
    hud = createHudHost({
      canvas,
      scene: host,
      resources,
      speedRow,
      mirror,
      timeline: noteHost.timeline,
      onChange: request,
    });
    // The note host made the play while it was built.
    const created = play as PlaySession | null;
    if (playMode && created) hud.readValuesFrom(created.hudValues);
    hudStartedAt = performance.now();
    mark("hud");
    void resources.jacket.then(
      () => mark("jacket"),
      () => mark("jacket-failed"),
    );
    const loadedMusic = await musicReady;
    if (!valid()) return;
    music = loadedMusic;
    durationSeconds = music.durationSeconds;
    seconds = Math.min(seconds, durationSeconds);
    music.seek(seconds);
    music.setPlaybackRate(playbackSpeed);
    audibleRate = playbackSpeed;
    ui.setDurationSeconds(durationSeconds);
    mark("music");
    viewport.resize();
    ready = true;
    draw(seconds);
    draw(seconds);
    mark("first-frame");
    await Promise.all([
      audio.connectSfx(noteHost.timeline),
      effectsReady?.then(async (loaded) => {
        if (!valid()) return;
        effectHost = loaded;
        if (playMode) {
          await loaded.ensureEffects(noteHost.effects, true);
          request();
        }
      }),
    ]);
    if (!valid()) return;
    mark("sfx");
    chartInput = chart;
    ui.setStatus("ready");
    if (pendingDifficulty) void changeDifficulty().catch(fail);
    else void changeJudgeTiming().catch(fail);
    if (capture)
      Object.assign(window, {
        __chartCapture: {
          durationSeconds,
          timeline: noteHost.timeline,
          musicUrl: new URL(await musicAddress, window.location.href).href,
          sfxUrl: audio.sfxUrl,
          begin(value: CanvasResolution) {
            capturing = true;
            if (frame) cancelAnimationFrame(frame);
            frame = 0;
            viewport.selectResolution(value);
          },
          draw(at: number) {
            seconds = at;
            draw(at);
          },
        },
      });
  })().catch(fail);

  return () => {
    lifetime.abort();
    release();
  };
}
