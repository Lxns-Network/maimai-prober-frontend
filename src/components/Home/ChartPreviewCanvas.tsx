import { useEffect, useRef } from "react";
import { MainRenderer, parseSimaiChart, TimingTimeline } from "@lxns-network/maimai-chart-engine";
import chartSource from "./chart-preview.txt?raw";
import classes from "./ChartPreview.module.css";

interface PreviewScene {
  renderer: MainRenderer;
  draw: () => void;
}

const MAX_PREVIEW_DPR = 3;

const previewRange = { startBeat: 12, endBeat: 36 };

export default function ChartPreviewCanvas({ playing }: { playing: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PreviewScene | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const chart = parseSimaiChart(chartSource, 5);
    const timeline = TimingTimeline.fromChart(chart);
    const renderer = new MainRenderer(canvas, { showStatistics: false });
    renderer.setHiSpeed(6);
    renderer.setSlideRotation(true);

    const startMs = timeline.msFromBeat(previewRange.startBeat);
    const durationMs = timeline.msFromBeat(previewRange.endBeat) - startMs;
    const draw = () => {
      const currentMs = startMs + (elapsedRef.current % durationMs);
      renderer.renderFrame(chart, timeline.beatFromMs(currentMs), 4);
    };
    const resize = () => {
      const width = canvas.getBoundingClientRect().width;
      renderer.resizeToSize(
        Math.max(1, Math.round(width * Math.min(window.devicePixelRatio || 1, MAX_PREVIEW_DPR))),
      );
      draw();
    };

    sceneRef.current = { renderer, draw };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("resize", resize);
    resize();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", resize);
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    let frame = 0;
    let previousTime: number | null = null;
    const animate = (time: number) => {
      if (previousTime !== null) elapsedRef.current += time - previousTime;
      previousTime = time;
      scene.draw();
      frame = requestAnimationFrame(animate);
    };
    const updatePlayback = () => {
      cancelAnimationFrame(frame);
      previousTime = null;
      const active = playing && document.visibilityState === "visible";
      scene.renderer.setIsPlaying(active);
      if (active) frame = requestAnimationFrame(animate);
      else scene.draw();
    };

    document.addEventListener("visibilitychange", updatePlayback);
    updatePlayback();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", updatePlayback);
    };
  }, [playing]);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={360}
      className={classes.canvas}
      role="img"
      aria-label="Oshama Scramble! DX MASTER 实时谱面预览"
    />
  );
}
