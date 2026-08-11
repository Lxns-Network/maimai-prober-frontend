import { useEffect, useRef, useCallback } from "react";
import { useGameStore, playbackTimeRef } from "../../stores/useGameStore";
import { useGameSettingsStore } from "../../stores/useGameSettingsStore";
import {
  useCanvasDebugInfoStore,
  type CanvasDebugInfo,
} from "../../stores/useCanvasDebugInfoStore";
import { MainRenderer } from "@lxns-network/maimai-chart-engine";
import { usePreviewAudio } from "../../hooks/usePreviewAudio";
import { beatsToMs } from "../../utils/timeConversion";
import classes from "./ChartCanvas.module.css";
import clsx from "clsx";
import { syncBackgroundVideoFrame } from "./backgroundVideoSync";
import { useBackgroundVideoSource } from "./hooks/useBackgroundVideoSource";
import { useFrameCaptureEvents } from "./hooks/useFrameCaptureEvents";
import { applyCurrentRendererSettings, useRendererSettings } from "./hooks/useRendererSettings";
import { useWakeLock } from "./hooks/useWakeLock";

export function ChartCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MainRenderer | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement>(null);
  const canvasDebugInfoRef = useRef<CanvasDebugInfo | null>(null);
  const setCanvasDebugInfo = useCanvasDebugInfoStore((state) => state.setDebugInfo);

  const animationFrameRef = useRef<number | null>(null);

  const fpsRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(0);
  const lastRenderTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);
  const lastDebugInfoTimeRef = useRef<number>(0);

  const previewAudio = usePreviewAudio();
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

  const renderFrame = useCallback((beatsOverride?: number) => {
    const renderer = rendererRef.current;
    const chart = useGameStore.getState().chartData;
    const playing = useGameStore.getState().isPlaying;
    const timeline = useGameStore.getState().timeline;

    if (!renderer) return;

    if (!chart) {
      renderer.clear();
      renderer.renderJudgmentLine();
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

    renderer.renderFrame(chart, currentBeats);
  }, []);

  const updateCanvasDebugInfo = useCallback(
    (force: boolean = false) => {
      if (!import.meta.env.DEV) return;

      const now = performance.now();
      if (!force && now - lastDebugInfoTimeRef.current < 250) return;
      lastDebugInfoTimeRef.current = now;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const gameState = useGameStore.getState();
      const fps = fpsRef.current;
      const previousHistory = canvasDebugInfoRef.current?.fpsHistory ?? [];
      const fpsHistory =
        gameState.isPlaying && fps > 0 ? [...previousHistory, fps].slice(-80) : previousHistory;
      const nextDebugInfo = {
        cssWidth: Math.round(rect.width),
        cssHeight: Math.round(rect.height),
        backingWidth: canvas.width,
        backingHeight: canvas.height,
        canvasDpr: rect.width > 0 ? canvas.width / rect.width : 0,
        deviceDpr: window.devicePixelRatio || 1,
        clockSource: previewAudioRef.current.getClockSource(),
        fps,
        fpsHistory,
      };

      canvasDebugInfoRef.current = nextDebugInfo;
      setCanvasDebugInfo(nextDebugInfo);
    },
    [setCanvasDebugInfo],
  );

  useEffect(() => {
    return () => {
      setCanvasDebugInfo(null);
    };
  }, [setCanvasDebugInfo]);

  useFrameCaptureEvents(canvasRef);
  useWakeLock(isPlaying);
  useBackgroundVideoSource({ videoRef: bgVideoRef, chartData, renderFrame });
  useRendererSettings({
    rendererRef,
    isFullscreen,
    renderFrame,
    updateCanvasDebugInfo,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new MainRenderer(canvas);
    renderer.setIsPlaying(useGameStore.getState().isPlaying);
    applyCurrentRendererSettings(renderer);
    rendererRef.current = renderer;

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
  }, [renderFrame, updateCanvasDebugInfo]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    updateCanvasDebugInfo(true);
    const intervalId = window.setInterval(() => updateCanvasDebugInfo(), 250);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [updateCanvasDebugInfo]);

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
        className={clsx(classes.canvas, {
          [classes.fullscreen]: isFullscreen,
        })}
      />
    </div>
  );
}

export default ChartCanvas;
