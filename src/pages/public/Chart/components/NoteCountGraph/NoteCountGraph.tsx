import { useCallback, useMemo, useRef, useEffect } from "react";
import { useElementSize } from "@mantine/hooks";
import { useGameStore, playbackTimeRef } from "../../stores/useGameStore";
import { beatsToMs, msToBeats } from "../../utils/timeConversion";
import classes from "./NoteCountGraph.module.css";
import clsx from "clsx";
import { match, P } from "ts-pattern";
import {
  ChartDensityTimeline,
  type DensityNote,
} from "../ChartDensityTimeline/ChartDensityTimeline";
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

export function PlaybackTimeline({
  fullscreen,
  notes,
  durationMs: totalDurationMs,
  measureTimesMs,
  playing,
  currentTimeMs,
  getCurrentTimeMs,
  subscribeTime,
  onScrub,
  onSeek,
  scrubScheduling = "timeline",
  disabled = false,
}: {
  fullscreen?: boolean;
  notes: readonly DensityNote[];
  durationMs: number;
  measureTimesMs: readonly number[];
  playing: boolean;
  currentTimeMs: number;
  getCurrentTimeMs: () => number;
  subscribeTime?: (listener: () => void) => () => void;
  onScrub: (milliseconds: number) => void;
  onSeek: (milliseconds: number) => void;
  scrubScheduling?: "timeline" | "player";
  disabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const playheadLabelRef = useRef<HTMLDivElement>(null);
  const dragPointerRef = useRef<number | null>(null);
  const dragAnimationFrameRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const lastTargetRef = useRef(0);
  const dragNotesRef = useRef(notes);
  const measureAt = useCallback(
    (milliseconds: number) => {
      let low = 0;
      let high = measureTimesMs.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (measureTimesMs[middle] <= milliseconds) low = middle + 1;
        else high = middle;
      }
      return Math.max(0, low - 1);
    },
    [measureTimesMs],
  );
  const maxMeasure = measureAt(totalDurationMs);
  const progressPercent =
    totalDurationMs > 0 ? Math.min(100, Math.max(0, (currentTimeMs / totalDurationMs) * 100)) : 0;
  const updatePlayhead = useCallback(
    (milliseconds: number) => {
      const percent =
        totalDurationMs > 0
          ? Math.min(100, Math.max(0, (milliseconds / totalDurationMs) * 100))
          : 0;
      if (playheadRef.current)
        playheadRef.current.style.transform = `translateX(calc(${percent}cqw - 1px))`;
      if (playheadLabelRef.current) {
        playheadLabelRef.current.style.transform = `translateX(calc(${percent}cqw - 50%))`;
        const badge = playheadLabelRef.current.firstElementChild;
        const label = String(measureAt(milliseconds));
        if (badge && badge.textContent !== label) badge.textContent = label;
      }
      containerRef.current?.setAttribute("aria-valuenow", String(milliseconds));
    },
    [totalDurationMs, measureAt],
  );
  useEffect(() => {
    updatePlayhead(currentTimeMs);
    if (subscribeTime) return subscribeTime(() => updatePlayhead(getCurrentTimeMs()));
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      updatePlayhead(getCurrentTimeMs());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, currentTimeMs, getCurrentTimeMs, subscribeTime, updatePlayhead]);
  useEffect(
    () => () => {
      if (dragAnimationFrameRef.current !== null)
        cancelAnimationFrame(dragAnimationFrameRef.current);
    },
    [],
  );
  useEffect(() => {
    const chartChanged = dragNotesRef.current !== notes;
    dragNotesRef.current = notes;
    if (!disabled && !chartChanged) return;
    const pointer = dragPointerRef.current;
    dragPointerRef.current = null;
    if (dragAnimationFrameRef.current !== null) cancelAnimationFrame(dragAnimationFrameRef.current);
    dragAnimationFrameRef.current = null;
    pendingSeekRef.current = null;
    const element = containerRef.current;
    if (pointer !== null && element?.hasPointerCapture(pointer))
      element.releasePointerCapture(pointer);
  }, [disabled, notes]);
  const seekToPosition = useCallback(
    (clientX: number, commit: boolean) => {
      if (!containerRef.current || disabled || totalDurationMs <= 0) return;
      const rect = containerRef.current.getBoundingClientRect();
      const target = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * totalDurationMs;
      lastTargetRef.current = target;
      updatePlayhead(target);
      if (commit) onSeek(target);
      else onScrub(target);
    },
    [disabled, totalDurationMs, updatePlayhead, onSeek, onScrub],
  );
  const measurePercents = useMemo(
    () => measureTimesMs.map((time) => (time / totalDurationMs) * 100),
    [measureTimesMs, totalDurationMs],
  );
  const { ref: rulerRef, width: rulerWidth } = useElementSize();
  const tickStep = useMemo(
    () =>
      TICK_STEPS.find(
        (step) => maxMeasure > 0 && (rulerWidth * step) / maxMeasure >= MIN_TICK_SPACING_PX,
      ) ?? TICK_STEPS[TICK_STEPS.length - 1],
    [maxMeasure, rulerWidth],
  );
  const measureMarkers = useMemo(() => {
    if (maxMeasure <= 0) return [];
    const step =
      LABEL_STEPS.find(
        (candidate) => (rulerWidth * candidate) / maxMeasure >= MIN_LABEL_SPACING_PX,
      ) ?? LABEL_STEPS[LABEL_STEPS.length - 1];
    const markers: { measure: number; percent: number }[] = [];
    for (let measure = 0; measure <= maxMeasure; measure += step)
      markers.push({ measure, percent: measurePercents[measure] });
    return markers;
  }, [maxMeasure, measurePercents, rulerWidth]);
  const timeMarkerIntervalMs = pickTimeMarkerInterval(totalDurationMs, rulerWidth);
  if (totalDurationMs <= 0) return null;
  return (
    <div
      ref={containerRef}
      className={classes.container}
      role="slider"
      aria-label="谱面时间"
      aria-valuemin={0}
      aria-valuemax={totalDurationMs}
      aria-valuenow={currentTimeMs}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onPointerDown={(event) => {
        if (disabled || event.button !== 0 || dragPointerRef.current !== null) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        dragPointerRef.current = event.pointerId;
        seekToPosition(event.clientX, false);
      }}
      onPointerMove={(event) => {
        if (disabled || dragPointerRef.current !== event.pointerId) return;
        if (scrubScheduling === "player") {
          seekToPosition(event.clientX, false);
          return;
        }
        pendingSeekRef.current = event.clientX;
        if (dragAnimationFrameRef.current !== null) return;
        dragAnimationFrameRef.current = requestAnimationFrame(() => {
          dragAnimationFrameRef.current = null;
          if (pendingSeekRef.current !== null) seekToPosition(pendingSeekRef.current, false);
          pendingSeekRef.current = null;
        });
      }}
      onPointerUp={(event) => {
        if (dragPointerRef.current !== event.pointerId) return;
        dragPointerRef.current = null;
        if (dragAnimationFrameRef.current !== null)
          cancelAnimationFrame(dragAnimationFrameRef.current);
        dragAnimationFrameRef.current = null;
        pendingSeekRef.current = null;
        seekToPosition(event.clientX, true);
      }}
      onLostPointerCapture={(event) => {
        if (dragPointerRef.current !== event.pointerId) return;
        dragPointerRef.current = null;
        if (dragAnimationFrameRef.current !== null)
          cancelAnimationFrame(dragAnimationFrameRef.current);
        dragAnimationFrameRef.current = null;
        pendingSeekRef.current = null;
        if (!disabled) onSeek(lastTargetRef.current);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        let target: number;
        switch (event.key) {
          case "ArrowLeft":
            target = getCurrentTimeMs() - 1000;
            break;
          case "ArrowRight":
            target = getCurrentTimeMs() + 1000;
            break;
          case "Home":
            target = 0;
            break;
          case "End":
            target = totalDurationMs;
            break;
          default:
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        onSeek(Math.max(0, Math.min(totalDurationMs, target)));
      }}
    >
      <ChartDensityTimeline
        notes={notes}
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
          {measureAt(currentTimeMs)}
        </div>
      </div>
    </div>
  );
}

export function NoteCountGraph({ fullscreen }: { fullscreen?: boolean }) {
  const chartData = useGameStore((state) => state.chartData);
  const playing = useGameStore((state) => state.isPlaying);
  const preciseTime = useGameStore((state) => state.timeline.preciseTime);
  const totalMeasures = useGameStore((state) => state.timeline.totalMeasures);
  const beatsPerMeasure = useGameStore((state) => state.timeline.beatsPerMeasure);
  const resumeRef = useRef(false);
  const draggingRef = useRef(false);
  const resumeFrameRef = useRef<number | null>(null);
  useEffect(() => {
    draggingRef.current = false;
    resumeRef.current = false;
    return () => {
      if (resumeFrameRef.current !== null) cancelAnimationFrame(resumeFrameRef.current);
      resumeFrameRef.current = null;
    };
  }, [chartData]);
  const measureTimesMs = useMemo(
    () =>
      chartData
        ? Array.from({ length: totalMeasures }, (_, measure) =>
            beatsToMs(measure * beatsPerMeasure, chartData.bpmEvents, chartData.bpm),
          )
        : [],
    [chartData, totalMeasures, beatsPerMeasure],
  );
  const getCurrentTimeMs = useCallback(
    () => (chartData ? beatsToMs(playbackTimeRef.current, chartData.bpmEvents, chartData.bpm) : 0),
    [chartData],
  );
  if (!chartData) return null;
  const seek = (milliseconds: number) =>
    useGameStore
      .getState()
      .setPreciseTime(msToBeats(milliseconds, chartData.bpmEvents, chartData.bpm), true);
  return (
    <PlaybackTimeline
      fullscreen={fullscreen}
      notes={chartData.notes}
      durationMs={measureTimesMs[measureTimesMs.length - 1] ?? 0}
      measureTimesMs={measureTimesMs}
      playing={playing}
      currentTimeMs={beatsToMs(preciseTime, chartData.bpmEvents, chartData.bpm)}
      getCurrentTimeMs={getCurrentTimeMs}
      onScrub={(milliseconds) => {
        if (!draggingRef.current) {
          draggingRef.current = true;
          const pendingResume = resumeFrameRef.current !== null;
          if (resumeFrameRef.current !== null) cancelAnimationFrame(resumeFrameRef.current);
          resumeFrameRef.current = null;
          resumeRef.current = pendingResume || useGameStore.getState().isPlaying;
          if (resumeRef.current) useGameStore.getState().pause();
        }
        seek(milliseconds);
      }}
      onSeek={(milliseconds) => {
        seek(milliseconds);
        draggingRef.current = false;
        if (resumeRef.current) {
          resumeRef.current = false;
          resumeFrameRef.current = requestAnimationFrame(() => {
            resumeFrameRef.current = null;
            useGameStore.getState().play();
          });
        }
      }}
    />
  );
}
export default NoteCountGraph;
