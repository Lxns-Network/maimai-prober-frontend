import { useMemo, type CSSProperties } from "react";
import { useElementSize } from "@mantine/hooks";
import type { Note } from "@lxns-network/maimai-chart-engine";
import clsx from "clsx";
import {
  DEFAULT_BUCKET_DURATION_MS,
  calculateNoteCounts,
  getMaxCount,
  type NoteCountKey,
} from "../../utils/chartDensity";
import { pickTimeMarkerInterval } from "./timeMarkers";
import classes from "./ChartDensityTimeline.module.css";

type ChartDensityTimelineProps = {
  notes: Note[];
  durationMs: number;
  windowStartMs?: number;
  scaleWindowStartMs?: number;
  scaleDurationMs?: number;
  bucketDurationMs?: number;
  barMaxHeight?: number;
  showTimeLabels?: boolean;
  showTimeMarkers?: boolean;
  className?: string;
  style?: CSSProperties;
};

const DEFAULT_BAR_MAX_HEIGHT = 32;
const MIN_BAR_WIDTH_PX = 2;
const FALLBACK_MAX_BUCKETS = 600;
const WIDTH_QUANTIZE_PX = 64;

const NOTE_COLORS: Record<NoteCountKey, string> = {
  tap: "#FFD700",
  hold: "#FF8C00",
  slide: "#00CED1",
  touch: "#0080FF",
  break: "#ff69b4",
};
const NOTE_COLOR_ENTRIES = Object.entries(NOTE_COLORS) as [NoteCountKey, string][];

function getLabelTransform(percent: number): string {
  if (percent === 0) return "translateX(0)";
  if (percent >= 99) return "translateX(-100%)";
  return "translateX(-50%)";
}

function formatTimeLabel(timeMs: number): string {
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getTimeMarkers(windowStartMs: number, durationMs: number, intervalMs: number) {
  if (durationMs <= 0) return [];

  const windowEndMs = windowStartMs + durationMs;
  const firstMarkerMs = Math.ceil(windowStartMs / intervalMs) * intervalMs;
  const markers: { timeMs: number; percent: number }[] = [];

  for (let timeMs = firstMarkerMs; timeMs <= windowEndMs; timeMs += intervalMs) {
    const percent = ((timeMs - windowStartMs) / durationMs) * 100;
    if (percent < 0 || percent > 100) continue;
    markers.push({ timeMs, percent });
  }

  return markers;
}

export function ChartDensityTimeline({
  notes,
  durationMs,
  windowStartMs = 0,
  scaleWindowStartMs,
  scaleDurationMs,
  bucketDurationMs = DEFAULT_BUCKET_DURATION_MS,
  barMaxHeight = DEFAULT_BAR_MAX_HEIGHT,
  showTimeLabels = true,
  showTimeMarkers = true,
  className,
  style,
}: ChartDensityTimelineProps) {
  const { ref: rootRef, width: rootWidth } = useElementSize();
  // 宽度量化,避免拖拽窗口时每像素都重算分桶。
  const quantizedWidth = Math.ceil(rootWidth / WIDTH_QUANTIZE_PX) * WIDTH_QUANTIZE_PX;
  const maxBuckets =
    quantizedWidth > 0
      ? Math.max(1, Math.floor(quantizedWidth / MIN_BAR_WIDTH_PX))
      : FALLBACK_MAX_BUCKETS;
  const effectiveBucketDurationMs = Math.max(bucketDurationMs, durationMs / maxBuckets);

  const buckets = useMemo(
    () => calculateNoteCounts(notes, windowStartMs, durationMs, effectiveBucketDurationMs),
    [notes, windowStartMs, durationMs, effectiveBucketDurationMs],
  );
  const hasScaleOverride = scaleWindowStartMs !== undefined || scaleDurationMs !== undefined;
  const effectiveScaleWindowStartMs = scaleWindowStartMs ?? windowStartMs;
  const effectiveScaleDurationMs = scaleDurationMs ?? durationMs;

  const scaleBuckets = useMemo(
    () =>
      hasScaleOverride
        ? calculateNoteCounts(
            notes,
            effectiveScaleWindowStartMs,
            effectiveScaleDurationMs,
            effectiveBucketDurationMs,
          )
        : null,
    [
      hasScaleOverride,
      notes,
      effectiveScaleWindowStartMs,
      effectiveScaleDurationMs,
      effectiveBucketDurationMs,
    ],
  );
  const maxCount = useMemo(() => getMaxCount(scaleBuckets ?? buckets), [scaleBuckets, buckets]);
  const timeMarkers = useMemo(
    () => getTimeMarkers(windowStartMs, durationMs, pickTimeMarkerInterval(durationMs, rootWidth)),
    [windowStartMs, durationMs, rootWidth],
  );

  if (durationMs <= 0 || buckets.length === 0) return null;

  return (
    <div ref={rootRef} className={clsx(classes.timeline, className)} style={style}>
      {showTimeMarkers && (
        <div className={classes.timeMarkerLines}>
          {timeMarkers.map(({ timeMs, percent }) => {
            if (percent === 0) return null;
            return (
              <div
                key={`line-${timeMs}`}
                className={classes.timeMarkerLine}
                style={{ left: `${percent}%` }}
              />
            );
          })}
        </div>
      )}

      {showTimeLabels && (
        <div className={classes.timeLabels}>
          {timeMarkers.map(({ timeMs, percent }) => {
            const transform = getLabelTransform(percent);

            return (
              <div
                key={timeMs}
                className={classes.timeLabel}
                style={{ left: `${percent}%`, transform }}
              >
                {formatTimeLabel(timeMs)}
              </div>
            );
          })}
        </div>
      )}

      <div className={classes.graphBars}>
        {buckets.map((bucket) => {
          if (bucket.total === 0) {
            return null;
          }

          const windowEndMs = windowStartMs + durationMs;
          const visibleStartMs = Math.max(bucket.startMs, windowStartMs);
          const visibleEndMs = Math.min(bucket.startMs + effectiveBucketDurationMs, windowEndMs);
          if (visibleEndMs <= visibleStartMs) {
            return null;
          }

          const heightRatio = bucket.total / maxCount;
          const height = Math.max(2, heightRatio * barMaxHeight);
          const leftPercent = ((visibleStartMs - windowStartMs) / durationMs) * 100;
          const widthPercent = ((visibleEndMs - visibleStartMs) / durationMs) * 100;

          return (
            <div
              key={bucket.startMs}
              className={classes.graphBar}
              style={{
                left: `${leftPercent}%`,
                width: `${widthPercent}%`,
                height: `${height}px`,
              }}
            >
              {NOTE_COLOR_ENTRIES.map(([key, color]) => {
                const ratio = bucket[key] / bucket.total;
                if (ratio === 0) return null;
                return (
                  <div key={key} style={{ flex: ratio, width: "100%", backgroundColor: color }} />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
