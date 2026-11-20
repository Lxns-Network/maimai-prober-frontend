import { useEffect, useRef, useCallback } from "react";
import { useGameStore, playbackTimeRef } from "../../stores/useGameStore";
import { useGameSettingsStore, type GameSettingsState } from "../../stores/useGameSettingsStore";
import type { MainRenderer } from "@lxns-network/maimai-chart-engine";
import type { PreviewAudioController } from "../../hooks/usePreviewAudio";
import { DebugOverlay } from "./DebugOverlay";
import { beatsToMs } from "../../utils/timeConversion";
import classes from "./ChartCanvas.module.css";
import clsx from "clsx";
import { syncBackgroundVideoFrame } from "./backgroundVideoSync";
import { useBackgroundVideoSource } from "./hooks/useBackgroundVideoSource";
import { useFrameCaptureEvents } from "./hooks/useFrameCaptureEvents";
import { applyCurrentRendererSettings, useRendererSettings } from "./hooks/useRendererSettings";
import { useWakeLock } from "./hooks/useWakeLock";
import { useInstallBenchmarkConsole } from "../../bench/installBenchmarkConsole";
import { CHART_BENCH_ENABLED } from "../../bench/benchEnabled";
import { useChartProfiling } from "./hooks/useChartProfiling";
import { loadChartRenderer } from "../../utils/loadChartRenderer";
import { notifyChart } from "../../utils/chartNotification";

export function ChartCanvas({
  previewAudio,
  backend,
}: {
  previewAudio: PreviewAudioController;
  backend: GameSettingsState["rendererBackend"];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MainRenderer | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);

  const animationFrameRef = useRef<number | null>(null);

  const fpsRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const { setOverlayProfiling, subscribeFrameProfile, reportFrameProfile, syncRendererProfiling } =
    useChartProfiling(rendererRef);

  const previewAudioRef = useRef({
    syncFrame: previewAudio.syncFrame,
    getClockSource: previewAudio.getClockSource,
  });

  useEffect(() => {
    previewAudioRef.current = {
      syncFrame: previewAudio.syncFrame,
      getClockSource: previewAudio.getClockSource,
    };
  }, [previewAudio]);

  const isFullscreen = useGameStore((s) => s.isFullscreen);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const chartData = useGameStore((s) => s.chartData);

  const renderFrame = useCallback(
    (beatsOverride?: number) => {
      const renderer = rendererRef.current;
      const chart = useGameStore.getState().chartData;
      const timeline = useGameStore.getState().timeline;
      const playing = useGameStore.getState().isPlaying;

      if (!renderer) return;

      if (!chart) {
        renderer.renderEmptyStage();
        return;
      }
      const currentBeats = beatsOverride ?? timeline.preciseTime;
      const currentMs = beatsToMs(currentBeats, chart.bpmEvents, chart.bpm);

      const settingsState = useGameSettingsStore.getState();
      syncBackgroundVideoFrame({
        renderer,
        video: bgVideoRef.current,
        chart,
        timeline,
        currentBeats,
        currentMs,
        playing,
        showVideo: settingsState.showVideo,
        musicOffset: settingsState.musicOffset,
        playbackSpeed: useGameStore.getState().playbackSpeed,
      });

      renderer.renderFrame(chart, currentBeats, timeline.beatsPerMeasure);

      if (CHART_BENCH_ENABLED) reportFrameProfile(renderer);
    },
    [reportFrameProfile],
  );

  useFrameCaptureEvents(canvasRef);
  useWakeLock(isPlaying);
  useInstallBenchmarkConsole(rendererRef, subscribeFrameProfile);
  useBackgroundVideoSource({ videoRef: bgVideoRef, chartData, renderFrame });
  useRendererSettings({
    rendererRef,
    isFullscreen,
    renderFrame,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;
    const fallback = (message: string) => {
      if (!active) return;
      notifyChart("已切换到 Canvas 2D", message, "red");
      useGameSettingsStore.getState().setRendererBackend("2d");
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      fallback("WebGL2 绘图上下文已丢失。");
    };
    if (backend === "webgl2") canvas.addEventListener("webglcontextlost", contextLost);
    const handleResize = () => {
      rendererRef.current?.resize(useGameStore.getState().isFullscreen);
      renderFrame(playbackTimeRef.current);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    const dprMediaQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprMediaQuery.addEventListener("change", handleResize);
    void loadChartRenderer(backend)
      .then((createRenderer) => {
        if (!active) return;
        const renderer = createRenderer(canvas);
        rendererRef.current = renderer;
        renderer.setIsPlaying(useGameStore.getState().isPlaying);
        applyCurrentRendererSettings(renderer);
        syncRendererProfiling();
        handleResize();
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : String(error);
        if (backend === "webgl2") fallback(message);
        else notifyChart("无法创建渲染器", message, "red");
      });
    return () => {
      active = false;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost);
      dprMediaQuery.removeEventListener("change", handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [backend, renderFrame, syncRendererProfiling]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setIsPlaying(isPlaying);
    }
    if (!isPlaying) bgVideoRef.current?.pause();
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || !chartData) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    const animate = (timestamp: number) => {
      const frame = previewAudioRef.current.syncFrame(timestamp);
      if (!frame) return;

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

      renderFrame(frame.currentBeats);

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, chartData, renderFrame]);

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
      <video
        ref={bgVideoRef}
        muted
        crossOrigin={backend === "webgl2" ? "anonymous" : undefined}
        playsInline
        preload="auto"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: "none",
          top: 0,
          left: 0,
        }}
      />
      <canvas
        ref={canvasRef}
        data-renderer={backend}
        className={clsx(classes.canvas, {
          [classes.fullscreen]: isFullscreen,
        })}
      />
      {import.meta.env.DEV && (
        <DebugOverlay
          canvasRef={canvasRef}
          rendererRef={rendererRef}
          fpsRef={fpsRef}
          getClockSource={previewAudio.getClockSource}
          onProfilingChange={setOverlayProfiling}
        />
      )}
    </div>
  );
}

export default ChartCanvas;
