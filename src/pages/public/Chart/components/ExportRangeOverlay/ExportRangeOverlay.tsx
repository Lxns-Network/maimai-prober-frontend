import { useCallback, useEffect, useRef } from "react";
import type { ChartExportRange } from "../../utils/exportChartGif";
import { MIN_EXPORT_DURATION_MS, MAX_EXPORT_DURATION_MS } from "../../hooks/useExportRange";
import { clamp } from "../../utils/math";
import { formatDuration } from "../../utils/format";
import classes from "./ExportRangeOverlay.module.css";

type ExportRangeOverlayProps = {
  range: ChartExportRange;
  totalDurationMs: number;
  onChange: (range: ChartExportRange) => void;
  onPreview?: (ms: number) => void;
};

export function ExportRangeOverlay({
  range,
  totalDurationMs,
  onChange,
  onPreview,
}: ExportRangeOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rootWidthRef = useRef(0);
  const draggingHandleRef = useRef<"start" | "end" | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const totalDurationMsRef = useRef(totalDurationMs);
  totalDurationMsRef.current = totalDurationMs;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;

  const startPercent = totalDurationMs > 0 ? (range.startMs / totalDurationMs) * 100 : 0;
  const endPercent = totalDurationMs > 0 ? (range.endMs / totalDurationMs) * 100 : 0;
  const durationMs = Math.max(0, range.endMs - range.startMs);

  const updateHandle = useCallback((clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    const width = rootWidthRef.current;
    const durationMs = totalDurationMsRef.current;
    if (!rect || width <= 0 || durationMs <= 0) return;

    const x = clamp(clientX - rect.left, 0, width);
    const targetMs = (x / width) * durationMs;

    const handle = draggingHandleRef.current;
    if (!handle) return;

    const currentRange = rangeRef.current;
    let newRange: ChartExportRange;

    if (handle === "start") {
      newRange = {
        startMs: Math.max(
          currentRange.endMs - MAX_EXPORT_DURATION_MS,
          Math.min(targetMs, currentRange.endMs - MIN_EXPORT_DURATION_MS),
        ),
        endMs: currentRange.endMs,
      };
    } else {
      newRange = {
        startMs: currentRange.startMs,
        endMs: Math.min(
          currentRange.startMs + MAX_EXPORT_DURATION_MS,
          Math.max(targetMs, currentRange.startMs + MIN_EXPORT_DURATION_MS),
        ),
      };
    }

    onChangeRef.current(newRange);
    onPreviewRef.current?.(handle === "start" ? newRange.startMs : newRange.endMs);
  }, []);

  const startDragging = (handle: "start" | "end", clientX: number) => {
    rootWidthRef.current = rootRef.current?.getBoundingClientRect().width ?? 0;
    draggingHandleRef.current = handle;
    updateHandle(clientX);
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingHandleRef.current) return;
      event.preventDefault();
      updateHandle(event.clientX);
    };

    const handlePointerUp = () => {
      draggingHandleRef.current = null;
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [updateHandle]);

  return (
    <div
      ref={rootRef}
      className={classes.overlay}
      onPointerDown={(event) => event.preventDefault()}
    >
      <div className={classes.shade} style={{ left: 0, width: `${startPercent}%` }} />
      <div
        className={classes.shade}
        style={{ left: `${endPercent}%`, width: `${100 - endPercent}%` }}
      />
      <div
        className={classes.selection}
        style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
      >
        <div className={classes.durationLabel}>{formatDuration(durationMs)}</div>
      </div>
      <div
        className={classes.handle}
        style={{ left: `${startPercent}%` }}
        onPointerDown={(event) => {
          event.preventDefault();
          startDragging("start", event.clientX);
        }}
      >
        <div className={classes.handleGrip} />
      </div>
      <div
        className={classes.handle}
        style={{ left: `${endPercent}%` }}
        onPointerDown={(event) => {
          event.preventDefault();
          startDragging("end", event.clientX);
        }}
      >
        <div className={classes.handleGrip} />
      </div>
    </div>
  );
}
