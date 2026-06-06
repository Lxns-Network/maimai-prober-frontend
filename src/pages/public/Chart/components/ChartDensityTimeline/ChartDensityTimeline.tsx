import { useMemo, type CSSProperties } from "react";
import type { Note } from "@lxns-network/maimai-chart-engine";
import clsx from "clsx";
import { match, P } from "ts-pattern";
import classes from "./ChartDensityTimeline.module.css";

type NoteCountKey = "tap" | "hold" | "slide" | "touch" | "break";

type NoteCountData = Record<NoteCountKey, number> & {
  startMs: number;
  total: number;
};

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

const DEFAULT_BUCKET_DURATION_MS = 500;
const DEFAULT_BAR_MAX_HEIGHT = 32;
const TIME_MARKER_INTERVAL_MS = 30000;

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

function classifyNote(note: Note): NoteCountKey | null {
  return match(note.type)
    .returnType<NoteCountKey | null>()
    .with("break", () => "break")
    .with(P.union("tap", "simultaneous"), () => "tap")
    .with(P.union("hold-start", "hold-start-simultaneous"), () => "hold")
    .with("slide", () => "slide")
    .with(P.union("touch", "touch-hold-start"), () => "touch")
    .with(P.union("hold-end", "hold-end-simultaneous", "touch-hold-end"), () => null)
    .exhaustive();
}

function createEmptyBucket(startMs: number): NoteCountData {
  return {
    startMs,
    tap: 0,
    hold: 0,
    slide: 0,
    touch: 0,
    break: 0,
    total: 0,
  };
}

function calculateNoteCounts(
  notes: Note[],
  windowStartMs: number,
  durationMs: number,
  bucketDurationMs: number,
): NoteCountData[] {
  if (durationMs <= 0) return [];

  const windowEndMs = windowStartMs + durationMs;
  const firstBucketIndex = Math.floor(windowStartMs / bucketDurationMs);
  const lastBucketIndex = Math.floor(windowEndMs / bucketDurationMs);
  const bucketCount = lastBucketIndex - firstBucketIndex + 1;
  const buckets: NoteCountData[] = Array.from({ length: bucketCount }, (_, i) =>
    createEmptyBucket((firstBucketIndex + i) * bucketDurationMs),
  );

  for (const note of notes) {
    if (note.timingMs < windowStartMs || note.timingMs > windowEndMs) continue;

    const absoluteBucketIndex = Math.floor(note.timingMs / bucketDurationMs);
    const bucket = buckets[absoluteBucketIndex - firstBucketIndex];
    if (!bucket) continue;

    const bucketKey = classifyNote(note);
    if (!bucketKey) continue;

    bucket[bucketKey]++;
    bucket.total++;
  }

  return buckets;
}

function getMaxCount(buckets: NoteCountData[]): number {
  let max = 0;
  for (const bucket of buckets) {
    max = Math.max(max, bucket.total);
  }
  return max || 1;
}

function getTimeMarkers(windowStartMs: number, durationMs: number) {
  if (durationMs <= 0) return [];

  const windowEndMs = windowStartMs + durationMs;
  const firstMarkerMs =
    Math.ceil(windowStartMs / TIME_MARKER_INTERVAL_MS) * TIME_MARKER_INTERVAL_MS;
  const markers: { timeMs: number; percent: number }[] = [];

  for (let timeMs = firstMarkerMs; timeMs <= windowEndMs; timeMs += TIME_MARKER_INTERVAL_MS) {
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
  const buckets = useMemo(
    () => calculateNoteCounts(notes, windowStartMs, durationMs, bucketDurationMs),
    [notes, windowStartMs, durationMs, bucketDurationMs],
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
            bucketDurationMs,
          )
        : null,
    [
      hasScaleOverride,
      notes,
      effectiveScaleWindowStartMs,
      effectiveScaleDurationMs,
      bucketDurationMs,
    ],
  );
  const maxCount = useMemo(() => getMaxCount(scaleBuckets ?? buckets), [scaleBuckets, buckets]);
  const timeMarkers = useMemo(
    () => getTimeMarkers(windowStartMs, durationMs),
    [windowStartMs, durationMs],
  );

  if (durationMs <= 0 || buckets.length === 0) return null;

  return (
    <div className={clsx(classes.timeline, className)} style={style}>
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

          const heightRatio = bucket.total / maxCount;
          const height = Math.max(2, heightRatio * barMaxHeight);
          const leftPercent = ((bucket.startMs - windowStartMs) / durationMs) * 100;
          const widthPercent = (bucketDurationMs / durationMs) * 100;

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
