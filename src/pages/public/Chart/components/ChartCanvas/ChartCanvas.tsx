import { useEffect, useRef, useCallback, useState } from "react";
import { useGameStore, playbackTimeRef, audioMasterTimeMsRef } from "../../stores/useGameStore";
import { useGameSettingsStore } from "../../stores/useGameSettingsStore";
import { MainRenderer } from "../../renderers/MainRenderer";
import { useAudio } from "../../hooks/useAudio";
import { useMusicPlayer } from "../../hooks/useMusicPlayer";
import { ANSWER_SOUND_BASE_OFFSET_MS } from "../../utils/constants";
import { DebugOverlay, type CanvasDebugInfo } from "./DebugOverlay";
import classes from "./ChartCanvas.module.css";
import clsx from "clsx";

type BpmEvent = { timing: number; bpm: number };

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

function msToBeats(ms: number, bpmEvents: BpmEvent[] | null, defaultBpm: number): number {
  if (!bpmEvents || bpmEvents.length === 0) {
    return (ms * defaultBpm) / 60000;
  }

  let remainingMs = ms;
  let totalBeats = 0;
  let lastBeat = 0;
  let currentBpm = bpmEvents[0].bpm;

  for (const event of bpmEvents) {
    const segmentBeats = event.timing - lastBeat;
    const segmentMs = (60000 * segmentBeats) / currentBpm;

    if (remainingMs <= segmentMs) {
      totalBeats += (remainingMs * currentBpm) / 60000;
      return totalBeats;
    }

    remainingMs -= segmentMs;
    totalBeats += segmentBeats;
    lastBeat = event.timing;
    currentBpm = event.bpm;
  }

  totalBeats += (remainingMs * currentBpm) / 60000;
  return totalBeats;
}

function formatChartTimeForFilename(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;

  return `${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s${String(milliseconds).padStart(3, "0")}ms`;
}

function getChartIdForFilename(): string {
  return new URLSearchParams(window.location.search).get("chart_id") ?? "unknown";
}

export function ChartCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MainRenderer | null>(null);
  const [canvasDebugInfo, setCanvasDebugInfo] = useState<CanvasDebugInfo | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackStartMsRef = useRef<number>(0);

  const fpsRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const lastDebugInfoTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const answerSound = useAudio({ autoInit: true });
  const answerSoundRefs = useRef({
    schedule: answerSound.schedule,
    reset: answerSound.reset,
    setEnabled: answerSound.setEnabled,
    setVolume: answerSound.setVolume,
    setTimingOffset: answerSound.setTimingOffset,
    resume: answerSound.resume,
  });

  useEffect(() => {
    answerSoundRefs.current = {
      schedule: answerSound.schedule,
      reset: answerSound.reset,
      setEnabled: answerSound.setEnabled,
      setVolume: answerSound.setVolume,
      setTimingOffset: answerSound.setTimingOffset,
      resume: answerSound.resume,
    };
  }, [answerSound]);

  useMusicPlayer();

  const isFullscreen = useGameStore((s) => s.isFullscreen);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const chartData = useGameStore((s) => s.chartData);
  const totalMeasures = useGameStore((s) => s.timeline.totalMeasures);
  const beatsPerMeasure = useGameStore((s) => s.timeline.beatsPerMeasure);
  const playbackSpeed = useGameStore((s) => s.playbackSpeed);
  const setPreciseTime = useGameStore((s) => s.setPreciseTime);
  const pause = useGameStore((s) => s.pause);

  const hiSpeed = useGameSettingsStore((s) => s.hiSpeed);
  const alwaysKeepHiSpeed = useGameSettingsStore((s) => s.alwaysKeepHiSpeed);
  const slideRotation = useGameSettingsStore((s) => s.slideRotation);
  const mirrorMode = useGameSettingsStore((s) => s.mirrorMode);
  const judgmentLineDesign = useGameSettingsStore((s) => s.judgmentLineDesign);
  const pinkSlideStart = useGameSettingsStore((s) => s.pinkSlideStart);
  const highlightExNotes = useGameSettingsStore((s) => s.highlightExNotes);
  const normalColorBreakSlide = useGameSettingsStore((s) => s.normalColorBreakSlide);
  const showFireworks = useGameSettingsStore((s) => s.showFireworks);
  const showHitEffect = useGameSettingsStore((s) => s.showHitEffect);
  const soundEnabled = useGameSettingsStore((s) => s.soundEnabled);
  const soundVolume = useGameSettingsStore((s) => s.soundVolume);
  const soundOffset = useGameSettingsStore((s) => s.soundOffset);

  const getPlaybackMs = useCallback((timestamp: number) => {
    const elapsed = (timestamp - playbackStartTimeRef.current) * playbackSpeedRef.current;
    return playbackStartMsRef.current + elapsed;
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current;
    wakeLockRef.current = null;

    if (!wakeLock) {
      return;
    }

    try {
      await wakeLock.release();
    } catch {
      // 忽略已经释放的 wake lock
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!isPlaying || document.visibilityState !== "visible" || wakeLockRef.current) {
      return;
    }

    const wakeLockApi = navigator.wakeLock;
    if (!wakeLockApi) {
      return;
    }

    try {
      const wakeLock = await wakeLockApi.request("screen");
      wakeLockRef.current = wakeLock;
      wakeLock.addEventListener?.("release", () => {
        if (wakeLockRef.current === wakeLock) {
          wakeLockRef.current = null;
        }
      });
    } catch {
      // 浏览器/系统可能拒绝 wake lock，预览继续工作即可
    }
  }, [isPlaying]);

  const resyncAnswerSound = useCallback(
    (currentMs: number, speed: number = playbackSpeedRef.current) => {
      if (!chartData || !soundEnabled) {
        return;
      }

      answerSoundRefs.current.reset(currentMs);
      answerSoundRefs.current.schedule(chartData.notes, currentMs, speed);
    },
    [chartData, soundEnabled],
  );

  const renderFrame = useCallback((beatsOverride?: number) => {
    const renderer = rendererRef.current;
    const chart = useGameStore.getState().chartData;
    const timeline = useGameStore.getState().timeline;
    const playing = useGameStore.getState().isPlaying;
    const sound = useGameSettingsStore.getState().soundEnabled;

    if (!renderer) return;

    if (!chart) {
      renderer.clear();
      renderer.renderJudgmentLine();
      return;
    }
    const currentBeats = beatsOverride ?? timeline.preciseTime;

    const measure = Math.floor(currentBeats / timeline.beatsPerMeasure);
    const beatInMeasure = currentBeats - measure * timeline.beatsPerMeasure;
    const beat = Math.floor(beatInMeasure) + 1;
    const fraction = beatInMeasure - Math.floor(beatInMeasure);

    let divisor = 4;
    if (chart.divisorEvents) {
      for (const event of chart.divisorEvents) {
        if (event.timing <= currentBeats) divisor = event.divisor;
        else break;
      }
    }

    renderer.setBeatDisplayInfo(measure, beat, fraction, divisor);
    const currentMs = beatsToMs(currentBeats, chart.bpmEvents, chart.bpm);

    renderer.clear();
    renderer.renderJudgmentLine();
    renderer.renderFireworks(chart.notes, currentBeats, chart.bpmEvents);
    renderer.renderNotes(chart.notes, currentBeats, chart.bpmEvents);

    if (sound && playing) {
      answerSoundRefs.current.schedule(chart.notes, currentMs, playbackSpeedRef.current);
    }
  }, []);

  const updateCanvasDebugInfo = useCallback((force: boolean = false) => {
    if (!import.meta.env.DEV) return;

    const now = performance.now();
    if (!force && now - lastDebugInfoTimeRef.current < 250) return;
    lastDebugInfoTimeRef.current = now;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const gameState = useGameStore.getState();
    setCanvasDebugInfo((previous) => {
      const fps = fpsRef.current;
      const previousHistory = previous?.fpsHistory ?? [];
      const fpsHistory =
        gameState.isPlaying && fps > 0 ? [...previousHistory, fps].slice(-80) : previousHistory;

      return {
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height),
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        canvasDpr: rect.width > 0 ? canvas.width / rect.width : 0,
        deviceDpr: window.devicePixelRatio || 1,
        clockSource: audioMasterTimeMsRef.current !== null ? "audio" : "raf",
        fps,
        fpsHistory,
      };
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new MainRenderer(canvas, chartData?.bpm ?? 120);
    renderer.setIsPlaying(useGameStore.getState().isPlaying);
    rendererRef.current = renderer;

    const settingsState = useGameSettingsStore.getState();
    renderer.setHiSpeed(settingsState.hiSpeed);
    renderer.setAlwaysKeepHiSpeed(useGameSettingsStore.getState().alwaysKeepHiSpeed);
    renderer.setSlideRotation(settingsState.slideRotation);
    renderer.setMirrorMode(settingsState.mirrorMode);
    renderer.setJudgmentLineDesign(settingsState.judgmentLineDesign);
    renderer.setPinkSlideStart(settingsState.pinkSlideStart);
    renderer.setHighlightExNotes(settingsState.highlightExNotes);
    renderer.setNormalColorBreakSlide(settingsState.normalColorBreakSlide);
    renderer.setShowFireworks(settingsState.showFireworks);
    renderer.setShowHitEffect(settingsState.showHitEffect);
    renderer.setPlaybackSpeed(useGameStore.getState().playbackSpeed);

    const handleResize = () => {
      renderer.resize(useGameStore.getState().isFullscreen);
      updateCanvasDebugInfo(true);
      renderFrame(playbackTimeRef.current);
    };

    handleResize();

    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    const dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprMediaQuery.addEventListener("change", handleResize);

    return () => {
      resizeObserver.disconnect();
      dprMediaQuery.removeEventListener("change", handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [renderFrame, chartData?.bpm, updateCanvasDebugInfo]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.resize(isFullscreen);
    updateCanvasDebugInfo(true);
    renderFrame(playbackTimeRef.current);
  }, [isFullscreen, renderFrame, updateCanvasDebugInfo]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    updateCanvasDebugInfo(true);
    const intervalId = window.setInterval(() => updateCanvasDebugInfo(), 250);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [updateCanvasDebugInfo]);

  useEffect(() => {
    const notify = (title: string, message: string, color: string) => {
      window.dispatchEvent(
        new CustomEvent("maimai-chart-notify", { detail: { title, message, color } }),
      );
    };

    const exportFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.toBlob((blob) => {
        if (!blob) return;
        const chart = useGameStore.getState().chartData;
        const currentMs = chart
          ? beatsToMs(playbackTimeRef.current, chart.bpmEvents, chart.bpm)
          : 0;
        const chartId = getChartIdForFilename();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `maimai-chart-${chartId}-${formatChartTimeForFilename(currentMs)}.png`;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }, "image/png");
      notify("已保存", "当前帧已下载为 PNG", "green");
    };

    const copyFrame = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          notify("已复制", "当前帧已复制到剪贴板", "green");
        } catch {
          notify("复制失败", "剪贴板不可用", "red");
        }
      }, "image/png");
    };

    window.addEventListener("maimai-chart-export-frame", exportFrame);
    window.addEventListener("maimai-chart-copy-frame", copyFrame);
    return () => {
      window.removeEventListener("maimai-chart-export-frame", exportFrame);
      window.removeEventListener("maimai-chart-copy-frame", copyFrame);
    };
  }, []);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setIsPlaying(isPlaying);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      void requestWakeLock();
      return;
    }

    void releaseWakeLock();
  }, [isPlaying, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
        return;
      }

      void releaseWakeLock();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    return () => {
      void releaseWakeLock();
    };
  }, [releaseWakeLock]);

  useEffect(() => {
    if (isPlaying) return;

    const currentChart = useGameStore.getState().chartData;
    if (!currentChart) {
      answerSoundRefs.current.reset(undefined, true);
      return;
    }

    const currentMs = beatsToMs(playbackTimeRef.current, currentChart.bpmEvents, currentChart.bpm);
    answerSoundRefs.current.reset(currentMs, true);
  }, [isPlaying]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setHiSpeed(hiSpeed);
      renderFrame(playbackTimeRef.current);
    }
  }, [hiSpeed, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setAlwaysKeepHiSpeed(alwaysKeepHiSpeed);
      renderFrame(playbackTimeRef.current);
    }
  }, [alwaysKeepHiSpeed, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setPlaybackSpeed(playbackSpeed);
      renderFrame(playbackTimeRef.current);
    }
  }, [playbackSpeed, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setSlideRotation(slideRotation);
      renderFrame(playbackTimeRef.current);
    }
  }, [slideRotation, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setMirrorMode(mirrorMode);
      renderFrame(playbackTimeRef.current);
    }
  }, [mirrorMode, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setJudgmentLineDesign(judgmentLineDesign);
      renderFrame(playbackTimeRef.current);
    }
  }, [judgmentLineDesign, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setPinkSlideStart(pinkSlideStart);
      renderFrame(playbackTimeRef.current);
    }
  }, [pinkSlideStart, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setHighlightExNotes(highlightExNotes);
      renderFrame(playbackTimeRef.current);
    }
  }, [highlightExNotes, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setNormalColorBreakSlide(normalColorBreakSlide);
      renderFrame(playbackTimeRef.current);
    }
  }, [normalColorBreakSlide, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowFireworks(showFireworks);
      renderFrame(playbackTimeRef.current);
    }
  }, [showFireworks, renderFrame]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setShowHitEffect(showHitEffect);
      renderFrame(playbackTimeRef.current);
    }
  }, [showHitEffect, renderFrame]);

  useEffect(() => {
    if (rendererRef.current && chartData) {
      rendererRef.current.setBpm(chartData.bpm);
    }
  }, [chartData]);

  useEffect(() => {
    answerSoundRefs.current.setEnabled(soundEnabled);

    if (!chartData || !isPlaying) {
      return;
    }

    const currentMs = beatsToMs(playbackTimeRef.current, chartData.bpmEvents, chartData.bpm);
    resyncAnswerSound(currentMs);
  }, [soundEnabled, chartData, isPlaying, resyncAnswerSound]);

  useEffect(() => {
    answerSoundRefs.current.setVolume(soundVolume);
  }, [soundVolume]);

  useEffect(() => {
    answerSoundRefs.current.setTimingOffset(ANSWER_SOUND_BASE_OFFSET_MS + soundOffset);

    if (!chartData || !isPlaying || !soundEnabled) {
      return;
    }

    const currentMs = beatsToMs(playbackTimeRef.current, chartData.bpmEvents, chartData.bpm);
    resyncAnswerSound(currentMs);
  }, [soundOffset, chartData, isPlaying, soundEnabled, resyncAnswerSound]);

  // 切速度时重锚 startTime/startMs，避免外推位置跳变。
  const playbackSpeedRef = useRef(playbackSpeed);
  useEffect(() => {
    if (isPlaying && chartData) {
      const currentBeats = playbackTimeRef.current;
      playbackStartTimeRef.current = performance.now();
      playbackStartMsRef.current = beatsToMs(currentBeats, chartData.bpmEvents, chartData.bpm);

      if (soundEnabled) {
        resyncAnswerSound(playbackStartMsRef.current, playbackSpeed);
      }
    }
    playbackSpeedRef.current = playbackSpeed;
  }, [playbackSpeed, isPlaying, chartData, soundEnabled, resyncAnswerSound]);

  useEffect(() => {
    if (!isPlaying || !chartData || !soundEnabled) return;

    const intervalId = window.setInterval(() => {
      if (!useGameStore.getState().isPlaying || !useGameSettingsStore.getState().soundEnabled) {
        return;
      }

      const currentMs = getPlaybackMs(performance.now());
      answerSoundRefs.current.schedule(chartData.notes, currentMs, playbackSpeedRef.current);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPlaying, chartData, soundEnabled, getPlaybackMs]);

  useEffect(() => {
    if (!isPlaying || !chartData) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    answerSoundRefs.current.resume();

    const totalBeats = totalMeasures * beatsPerMeasure;
    const totalDurationMs = beatsToMs(totalBeats, chartData.bpmEvents, chartData.bpm);

    let lastSeekVersion = useGameStore.getState().seekVersion;

    // 延迟到第一次 rAF 回调里捕获 anchor。如果在 useEffect 里立即用 performance.now() 作为
    // anchor，首帧 timestamp 会比它晚一个 vsync 周期（60Hz ≈ 16ms，144Hz ≈ 7ms，外加 React
    // effect 调度延迟），导致 getPlaybackMs(timestamp) 出现可见瞬移。seek 路径下面用的就是
    // rAF timestamp，所以是精确的。
    let anchorInitialized = false;

    const animate = (timestamp: number) => {
      if (!anchorInitialized) {
        anchorInitialized = true;
        const currentPreciseTime = useGameStore.getState().timeline.preciseTime;
        playbackStartTimeRef.current = timestamp;
        playbackStartMsRef.current = beatsToMs(
          currentPreciseTime,
          chartData.bpmEvents,
          chartData.bpm,
        );
        // 传入当前时间，避免播放之前已经过去的 note 音效
        answerSoundRefs.current.reset(playbackStartMsRef.current, true);
      }

      // 帧数限制：跳过帧的时间累积到 accumulatedTimeRef，攒够目标间隔才渲染
      const limit = useGameSettingsStore.getState().fpsLimit;
      if (limit > 0 && lastRenderTimeRef.current > 0) {
        accumulatedTimeRef.current += timestamp - lastRenderTimeRef.current;
        lastRenderTimeRef.current = timestamp;
        if (accumulatedTimeRef.current < 1000 / limit) {
          animationFrameRef.current = requestAnimationFrame(animate);
          return;
        }
        accumulatedTimeRef.current -= 1000 / limit;
      }
      lastRenderTimeRef.current = timestamp;

      // FPS 统计
      if (lastFrameTimeRef.current > 0) {
        const delta = timestamp - lastFrameTimeRef.current;
        frameTimesRef.current.push(delta);
        if (frameTimesRef.current.length > 60) {
          frameTimesRef.current.shift();
        }
        const avgDelta =
          frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length;
        fpsRef.current = Math.round(1000 / avgDelta);
        if (rendererRef.current) {
          rendererRef.current.setFps(fpsRef.current);
        }
      }
      lastFrameTimeRef.current = timestamp;

      const storeState = useGameStore.getState();
      if (storeState.seekVersion !== lastSeekVersion) {
        lastSeekVersion = storeState.seekVersion;
        playbackStartTimeRef.current = timestamp;
        playbackStartMsRef.current = beatsToMs(
          storeState.timeline.preciseTime,
          chartData.bpmEvents,
          chartData.bpm,
        );
        // seek 后让出音频主时钟，本帧走 rAF 新锚点；syncAudio 重定位完成后会再发布
        audioMasterTimeMsRef.current = null;
        // 传入当前时间，避免播放之前已经过去的 note 音效
        answerSoundRefs.current.reset(playbackStartMsRef.current, true);
      }

      // 音频实际在跑时以 AudioContext 时钟为主，否则回落 rAF 外推。
      // 顺手把 rAF anchor 重新对齐到音频时间，让 lead-in/暂停/音乐结束后
      // 回落到 rAF 路径时不会出现位置跳变。
      const audioMs = audioMasterTimeMsRef.current;
      let currentMs: number;
      if (audioMs !== null) {
        currentMs = audioMs;
        playbackStartTimeRef.current = timestamp;
        playbackStartMsRef.current = audioMs;
      } else {
        currentMs = getPlaybackMs(timestamp);
      }

      if (currentMs >= totalDurationMs + 500) {
        setPreciseTime(totalBeats);
        pause();
        return;
      }

      const currentBeats = msToBeats(currentMs, chartData.bpmEvents, chartData.bpm);
      playbackTimeRef.current = currentBeats;

      renderFrame(currentBeats);

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [
    isPlaying,
    chartData,
    totalMeasures,
    beatsPerMeasure,
    pause,
    setPreciseTime,
    renderFrame,
    getPlaybackMs,
  ]);

  // 暂停态：进度条拖动时实时预览（rAF 节流，只在时间变了重渲染）。
  useEffect(() => {
    if (isPlaying) return;

    let previewAnimationFrameId: number | null = null;
    let lastPreviewedTime = -1;

    const updatePreview = () => {
      const currentTime = playbackTimeRef.current;
      if (currentTime !== lastPreviewedTime) {
        lastPreviewedTime = currentTime;
        renderFrame(currentTime);
      }
      previewAnimationFrameId = requestAnimationFrame(updatePreview);
    };

    renderFrame(playbackTimeRef.current);
    previewAnimationFrameId = requestAnimationFrame(updatePreview);

    return () => {
      if (previewAnimationFrameId) {
        cancelAnimationFrame(previewAnimationFrameId);
      }
    };
  }, [isPlaying, renderFrame]);

  return (
    <div
      ref={containerRef}
      className={clsx(classes.container, {
        [classes.fullscreen]: isFullscreen,
      })}
    >
      <canvas
        ref={canvasRef}
        className={clsx(classes.canvas, {
          [classes.fullscreen]: isFullscreen,
        })}
      />
      {import.meta.env.DEV && canvasDebugInfo && <DebugOverlay debugInfo={canvasDebugInfo} />}
    </div>
  );
}

export default ChartCanvas;
