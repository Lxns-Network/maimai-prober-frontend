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
import type { LoopRange, PreviewSessionInput } from "./types";
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
import type { ChartSession } from "@lxns-network/chunithm-chart-engine/chart/worker/loadChart";
import {
  DEFAULT_PLAY_TIMING_ROW,
  PLAY_TIMING_OPTIONS,
  playTimingSeconds,
} from "../options/playTiming";
import { DEFAULT_JUDGE_POSITION_ROW, JUDGE_POSITION_OPTIONS } from "../options/judgePosition";
import { DEFAULT_JUDGE_DISPLAY_ROW, JUDGE_DISPLAY_OPTIONS } from "../options/judgeDisplay";
import { createChartOverview } from "./chartOverview";

const EFFECT_LIST = "effects/resources.json";

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
  let dividerRow = 2;
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
  let desiredPlaying = false;
  let loopRange: LoopRange | null = null;
  /** Where a drag of the timeline is, and whether playback picks up there once it is let go. */
  let scrubbing: { seconds: number; resume: boolean } | null = null;
  let frame = 0;
  let fpsLimit = input.fpsLimit ?? 0;
  let nextDrawTime = 0;
  let ready = false;
  const capture = import.meta.env.DEV && new URLSearchParams(window.location.search).has("capture");
  /** Set once a recording drives the frames, which stops the animation loop for good. */
  let capturing = false;
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
  const release = () => {
    changeController?.abort();
    viewport.dispose();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
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
    try {
      if (music && audio?.running && scrubbing) {
        const state = music.poll();
        audibleRate = state.position.playbackRate;
        ui.setSeeking(state.transitioning);
        if (state.needsFrame) request();
        draw(scrubbing.seconds);
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
          draw(seconds);
          request();
          return;
        }
        audio?.updateSfx(state, playTiming);
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
          draw(seconds);
          if (state.position.phase === "playing" || hud?.scrolling) request();
          return;
        }
        desiredPlaying = state.intendedPlaying;
        ui.setPlaying(state.intendedPlaying);
        ui.setSeeking(state.transitioning);
        seconds = state.requestedSeconds ?? state.position.bufferSeconds;
        if (!fpsLimit || !desiredPlaying || state.transitioning || timestamp >= nextDrawTime) {
          draw(seconds);
          if (fpsLimit) {
            const interval = 1000 / fpsLimit;
            nextDrawTime =
              nextDrawTime > 0 && timestamp >= nextDrawTime
                ? timestamp + interval - ((timestamp - nextDrawTime) % interval)
                : timestamp + interval;
          }
        }
        if (state.needsFrame) request(false);
      } else draw(scrubbing?.seconds ?? seconds);
      if (hud?.scrolling) request(false);
    } catch (cause) {
      if (isMusicOutputPending(cause)) request();
      else fail(cause);
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

  const changeDifficulty = async () => {
    if (!ready || !chartInput || !notes || !hud || !audio || !music || capturing) return;
    pendingDifficulty = false;
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
    ui.setChangingDifficulty(true);
    desiredPlaying = false;
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
      const next = await worker.compute(speedRow, scope.signal);
      if (scope.signal.aborted) return;
      await effectHost?.ensureEffects(next.effects);
      if (next.mirrored) await effectHost?.ensureEffects(next.mirrored.effects);
      if (scope.signal.aborted) return;
      notes.replaceChart(next, nextInput.mirror);
      notes.selectMirror(mirror);
      hud.replaceChart(nextInput.song, next.timeline);
      await audio.connectSfx(next.timeline);
      if (scope.signal.aborted) return;
      chartInput = nextInput;
      live.setChart(createChartOverview(next.timeline, next.score));
      if (capture)
        Object.assign((window as unknown as { __chartCapture: object }).__chartCapture, {
          timeline: next.timeline,
        });
      ui.setDifficultyValue(String(difficulty));
      seconds = Math.min(requestedChartSeconds, durationSeconds);
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
        request();
      }
    }
  };

  input.setControls({
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
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
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
          seconds = restoreSeconds;
          frameHost?.resetBackgroundHistory();
          active.seek(restoreSeconds);
          if (resume && !pendingDifficulty) active.play();
          else active.pause();
          desiredPlaying = resume && !pendingDifficulty;
          ui.setPlaying(desiredPlaying);
          draw(restoreSeconds);
          if (pendingDifficulty) void changeDifficulty().catch(fail);
          else request();
        }
      }
    },
    toggle() {
      if (!music || !audio || changingDifficulty) return;
      if (scrubbing) {
        seconds = scrubbing.seconds;
        scrubbing = null;
        frameHost?.resetBackgroundHistory();
        music.seek(seconds);
        live.setSeconds(seconds);
      }
      desiredPlaying = !desiredPlaying;
      if (desiredPlaying && live.time.getSnapshot() >= durationSeconds) {
        seconds = 0;
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
                audio?.updateSfx(state, playTiming);
              } catch (cause) {
                if (!isMusicOutputPending(cause)) throw cause;
              }
            }
            request();
          })
          .catch(fail);
      else {
        seconds = live.time.getSnapshot();
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
      notes?.selectMirror(value);
      hud?.selectMirror(value);
      mirror = value;
      request();
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
      ui.setDividerValue(value);
      request();
    },
    selectResolution(value) {
      viewport.selectResolution(value);
    },
    setFpsLimit(value) {
      fpsLimit = value;
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
  });
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
      return chartSession.compute(initialRow, signal).finally(() => {
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
            signal,
            textureOverride: search.get("texture"),
          });
        });
    void effectsReady?.then(
      () => mark("effects"),
      () => mark("effects-failed"),
    );
    const chart = await chartReady;
    const noteHost = await createNoteHost({
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
    host.setScenery((camera) =>
      layer.draws({
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
    await audio.connectSfx(noteHost.timeline);
    effectHost = await effectsReady;
    if (!valid()) return;
    mark("sfx");
    chartInput = chart;
    ui.setStatus("ready");
    if (pendingDifficulty) void changeDifficulty().catch(fail);
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
