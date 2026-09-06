import { useEffect, useRef } from "react";
import { MainRenderer, parseSimaiChart, TimingTimeline } from "@lxns-network/maimai-chart-engine";
import chartSource from "./chart-preview.txt?raw";
import classes from "./ChartPreview.module.css";

interface PreviewScene {
  renderer: MainRenderer;
  draw: () => void;
}

/** 预览固定 60fps 出帧；阈值留 1ms 容差，避免 60Hz 屏上 rAF 抖动导致掉帧。 */
const FRAME_INTERVAL_MS = 1000 / 60 - 1;

/** chart_id=10363 MASTER 原谱 128–152 拍；片段数据保留了前后小节供入场与滑条渲染。 */
const previewRange = { startBeat: 12, endBeat: 36 };

/** 无音频的首页展示；不读取或修改完整谱面预览的播放状态。 */
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
        Math.max(1, Math.round(width * Math.min(window.devicePixelRatio || 1, 2))),
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
    let lastDrawTime = 0;
    const animate = (time: number) => {
      if (previousTime !== null) elapsedRef.current += time - previousTime;
      previousTime = time;
      if (time - lastDrawTime >= FRAME_INTERVAL_MS) {
        scene.draw();
        lastDrawTime = time;
      }
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
