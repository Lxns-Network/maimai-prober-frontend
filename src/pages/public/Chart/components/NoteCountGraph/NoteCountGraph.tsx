import { useCallback, useMemo, useRef, useEffect } from "react";
import { useElementSize } from "@mantine/hooks";
import { useGameStore, playbackTimeRef } from "../../stores/useGameStore";
import { beatsToMs, msToBeats } from "../../utils/timeConversion";
import classes from "./NoteCountGraph.module.css";
import clsx from "clsx";
import { match, P } from "ts-pattern";
import { ChartDensityTimeline } from "../ChartDensityTimeline/ChartDensityTimeline";
import { pickTimeMarkerInterval } from "../ChartDensityTimeline/timeMarkers";

const TICK_STEPS = [1, 5, 10, 50, 100];
const MIN_TICK_SPACING_PX = 2;
const LABEL_STEPS = [5, 10, 20, 50, 100, 200, 500];
const MIN_LABEL_SPACING_PX = 20;

function getLabelTransform(percent: number): string {
  if (percent === 0) return "translateX(0)";
  if (percent >= 99) return "translateX(-100%)";
  return "translateX(-50%)";
}

export function NoteCountGraph({ fullscreen }: { fullscreen?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadLabelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const wasPlayingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);
  const dragAnimationFrameRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const lastSeekTimeRef = useRef<number>(0);

  const chartData = useGameStore((s) => s.chartData);
  const isPlaying = useGameStore((s) => s.isPlaying);
  const preciseTime = useGameStore((s) => s.timeline.preciseTime);
  const currentMeasure = useGameStore((s) => s.timeline.currentMeasure);
  const totalMeasures = useGameStore((s) => s.timeline.totalMeasures);
  const beatsPerMeasure = useGameStore((s) => s.timeline.beatsPerMeasure);
  const pause = useGameStore((s) => s.pause);
  const setPreciseTime = useGameStore((s) => s.setPreciseTime);

  const SEEK_THROTTLE_MS = 32;

  const { totalDurationMs, maxBeats, maxMeasure } = useMemo(() => {
    if (!chartData) {
      return { totalDurationMs: 0, maxBeats: 0, maxMeasure: 0 };
    }

    const maxMeas = Math.max(0, totalMeasures - 1);
    const beats = maxMeas * beatsPerMeasure;

    const durationMs = beatsToMs(beats, chartData.bpmEvents, chartData.bpm);

    return {
      totalDurationMs: durationMs,
      maxBeats: beats,
      maxMeasure: maxMeas,
    };
  }, [chartData, totalMeasures, beatsPerMeasure]);

  const progressPercent = useMemo(() => {
    if (!chartData || totalDurationMs <= 0) return 0;
    const currentMs = beatsToMs(preciseTime, chartData.bpmEvents, chartData.bpm);
    return Math.min(100, Math.max(0, (currentMs / totalDurationMs) * 100));
  }, [chartData, preciseTime, totalDurationMs]);

  // 播放时 rAF 直接改 DOM style，避免 setState 链路触发整图重渲染。
  useEffect(() => {
    if (!isPlaying || !chartData || totalDurationMs <= 0) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    let lastBadgeMeasure = -1;
    const updatePlayhead = () => {
      const currentBeats = playbackTimeRef.current;
      const currentMs = beatsToMs(currentBeats, chartData.bpmEvents, chartData.bpm);
      const percent = Math.min(100, Math.max(0, (currentMs / totalDurationMs) * 100));
      const measure = Math.floor(currentBeats / beatsPerMeasure);

      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(calc(${percent}cqw - 1px))`;
      }
      if (playheadLabelRef.current) {
        playheadLabelRef.current.style.transform = `translateX(calc(${percent}cqw - 50%))`;
        const badge = playheadLabelRef.current.firstElementChild;
        if (badge && measure !== lastBadgeMeasure) {
          lastBadgeMeasure = measure;
          badge.textContent = String(measure);
        }
      }

      animationFrameRef.current = requestAnimationFrame(updatePlayhead);
    };

    animationFrameRef.current = requestAnimationFrame(updatePlayhead);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [isPlaying, chartData, totalDurationMs, beatsPerMeasure]);

  const updatePlayheadVisual = useCallback((percent: number, measure: number) => {
    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(calc(${percent}cqw - 1px))`;
    }
    if (playheadLabelRef.current) {
      playheadLabelRef.current.style.transform = `translateX(calc(${percent}cqw - 50%))`;
      const badge = playheadLabelRef.current.firstElementChild;
      if (badge) {
        badge.textContent = String(measure);
      }
    }
  }, []);

  const calculateSeekPosition = useCallback(
    (clientX: number) => {
      if (!containerRef.current || !chartData || totalDurationMs <= 0) return null;

      const rect = containerRef.current.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const percent = (clickX / rect.width) * 100;
      const targetMs = (percent / 100) * totalDurationMs;
      const targetBeats = msToBeats(targetMs, chartData.bpmEvents, chartData.bpm);
      const clampedBeats = Math.max(0, Math.min(maxBeats, targetBeats));
      const measure = Math.floor(clampedBeats / beatsPerMeasure);

      return { percent, beats: clampedBeats, measure };
    },
    [chartData, totalDurationMs, maxBeats, beatsPerMeasure],
  );

  // 拖动 seek 节流（30fps），落在 throttle 窗口内的最后一次会通过 pendingSeekRef 兜底。
  const throttledSeekToStore = useCallback(
    (beats: number) => {
      const now = performance.now();
      if (now - lastSeekTimeRef.current >= SEEK_THROTTLE_MS) {
        lastSeekTimeRef.current = now;
        setPreciseTime(beats, true);
        pendingSeekRef.current = null;
      } else {
        pendingSeekRef.current = beats;
      }
    },
    [setPreciseTime],
  );

  // 拖动时的 seek 处理
  const seekToPosition = useCallback(
    (clientX: number, immediate = false) => {
      const pos = calculateSeekPosition(clientX);
      if (!pos) return;

      updatePlayheadVisual(pos.percent, pos.measure);
      playbackTimeRef.current = pos.beats;

      // immediate 用于点击 / 拖动结束（直接落 store）；拖动过程走 throttle。
      if (immediate) {
        setPreciseTime(pos.beats, true);
        pendingSeekRef.current = null;
      } else {
        throttledSeekToStore(pos.beats);
      }
    },
    [calculateSeekPosition, updatePlayheadVisual, setPreciseTime, throttledSeekToStore],
  );

  const startDragging = useCallback(
    (clientX: number) => {
      isDraggingRef.current = true;
      wasPlayingRef.current = useGameStore.getState().isPlaying;
      if (wasPlayingRef.current) {
        pause();
      }
      seekToPosition(clientX, true);
    },
    [pause, seekToPosition],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      startDragging(e.clientX);
    },
    [startDragging],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      startDragging(e.touches[0].clientX);
    },
    [startDragging],
  );

  useEffect(() => {
    let lastClientX = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      lastClientX = e.clientX;

      // rAF coalescing：mousemove 频率远高于 60fps，把同一帧的更新合并掉。
      if (dragAnimationFrameRef.current === null) {
        dragAnimationFrameRef.current = requestAnimationFrame(() => {
          dragAnimationFrameRef.current = null;
          if (isDraggingRef.current) {
            seekToPosition(lastClientX, false);
          }
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      e.preventDefault();
      lastClientX = e.touches[0].clientX;

      if (dragAnimationFrameRef.current === null) {
        dragAnimationFrameRef.current = requestAnimationFrame(() => {
          dragAnimationFrameRef.current = null;
          if (isDraggingRef.current) {
            seekToPosition(lastClientX, false);
          }
        });
      }
    };

    const handleEnd = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      if (dragAnimationFrameRef.current !== null) {
        cancelAnimationFrame(dragAnimationFrameRef.current);
        dragAnimationFrameRef.current = null;
      }

      // 拖动期间 throttle 可能丢掉最后一次落点，松手时强制落。
      if (pendingSeekRef.current !== null) {
        setPreciseTime(pendingSeekRef.current, true);
        pendingSeekRef.current = null;
      }

      if (wasPlayingRef.current) {
        wasPlayingRef.current = false;
        requestAnimationFrame(() => {
          useGameStore.getState().play();
        });
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);
    document.addEventListener("touchcancel", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
      document.removeEventListener("touchcancel", handleEnd);

      if (dragAnimationFrameRef.current !== null) {
        cancelAnimationFrame(dragAnimationFrameRef.current);
      }
    };
  }, [seekToPosition, setPreciseTime]);

  // 小节按时间定位，变速谱才能跟 playhead 对齐。
  const measurePercents = useMemo(() => {
    if (!chartData || totalDurationMs <= 0 || maxMeasure <= 0) return [];
    const arr: number[] = [];
    for (let m = 0; m <= maxMeasure; m++) {
      const timeMs = beatsToMs(m * beatsPerMeasure, chartData.bpmEvents, chartData.bpm);
      arr.push((timeMs / totalDurationMs) * 100);
    }
    return arr;
  }, [chartData, totalDurationMs, maxMeasure, beatsPerMeasure]);

  const { ref: rulerRef, width: rulerWidth } = useElementSize();

  const tickStep = useMemo(() => {
    for (const step of TICK_STEPS) {
      if (maxMeasure > 0 && (rulerWidth * step) / maxMeasure >= MIN_TICK_SPACING_PX) return step;
    }
    return TICK_STEPS[TICK_STEPS.length - 1];
  }, [maxMeasure, rulerWidth]);

  const measureMarkers = useMemo(() => {
    if (maxMeasure <= 0) return [];

    let step = LABEL_STEPS[LABEL_STEPS.length - 1];
    for (const candidate of LABEL_STEPS) {
      if ((rulerWidth * candidate) / maxMeasure >= MIN_LABEL_SPACING_PX) {
        step = candidate;
        break;
      }
    }

    const markers: { measure: number; percent: number }[] = [];
    for (let m = 0; m <= maxMeasure; m += step) {
      markers.push({
        measure: m,
        percent: measurePercents[m] ?? 0,
      });
    }
    return markers;
  }, [maxMeasure, measurePercents, rulerWidth]);

  const timeMarkerIntervalMs = pickTimeMarkerInterval(totalDurationMs, rulerWidth);

  if (!chartData || totalDurationMs <= 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={classes.container}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      <ChartDensityTimeline
        notes={chartData.notes}
        durationMs={totalDurationMs}
        className={classes.graphArea}
      />

      <div ref={rulerRef} className={classes.measureRuler}>
        <div className={classes.measureTimeMarkerLines}>
          {(() => {
            if (totalDurationMs <= 0) return null;
            return Array.from({
              length: Math.ceil(totalDurationMs / timeMarkerIntervalMs) + 1,
            }).map((_, i) => {
              const timeMs = i * timeMarkerIntervalMs;
              const percent = (timeMs / totalDurationMs) * 100;
              if (percent > 100 || percent === 0) return null;
              return (
                <div
                  key={`bottom-line-${i}`}
                  className={classes.measureTimeMarkerLine}
                  style={{ left: `${percent}%`, top: 0, bottom: 0 }}
                />
              );
            });
          })()}
        </div>

        <div className={classes.measureMarkerLines}>
          {Array.from({ length: maxMeasure + 1 }).map((_, m) => {
            if (m % tickStep !== 0) {
              return null;
            }
            const percent = measurePercents[m] ?? 0;
            const isMajor = m % 10 === 0;
            const isMedium = m % 5 === 0;
            return (
              <div
                key={m}
                className={clsx(
                  classes.measureTick,
                  isMajor
                    ? classes.measureTickMajor
                    : isMedium
                      ? classes.measureTickMedium
                      : classes.measureTickSmall,
                )}
                style={{
                  // 1px 线钉到整数像素,避免小数位置抗锯齿导致虚实不一
                  left:
                    rulerWidth > 0
                      ? `${Math.round((percent / 100) * rulerWidth)}px`
                      : `${percent}%`,
                  height: match([isMajor, isMedium] as const)
                    .with([true, P._], () => "6px")
                    .with([false, true], () => "4px")
                    .otherwise(() => "2px"),
                }}
              />
            );
          })}
        </div>

        <div className={classes.measureLabelsContainer}>
          {measureMarkers.map(({ measure, percent }) => {
            const transform = getLabelTransform(percent);

            return (
              <div
                key={measure}
                className={classes.measureLabel}
                style={{ left: `${percent}%`, transform }}
              >
                {measure}
              </div>
            );
          })}
        </div>
      </div>

      <div
        ref={playheadRef}
        className={clsx(classes.playhead, {
          [classes.fullscreen]: fullscreen,
        })}
        style={{ transform: `translateX(calc(${progressPercent}cqw - 1px))` }}
      />
      <div
        ref={playheadLabelRef}
        className={classes.playheadLabel}
        style={{ transform: `translateX(calc(${progressPercent}cqw - 50%))` }}
      >
        <div
          className={clsx(classes.playheadBadge, {
            [classes.fullscreen]: fullscreen,
          })}
        >
          {currentMeasure}
        </div>
      </div>
    </div>
  );
}

export default NoteCountGraph;
