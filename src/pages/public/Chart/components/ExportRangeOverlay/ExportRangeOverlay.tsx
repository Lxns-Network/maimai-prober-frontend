import { useCallback, useEffect, useRef } from "react";
import type { ChartExportRange } from "../../utils/exportChartGif";
import { MIN_EXPORT_DURATION_MS, MAX_EXPORT_DURATION_MS } from "../../hooks/useExportRange";
import { clamp } from "../../utils/math";
import { formatDuration } from "../../utils/format";
import classes from "./ExportRangeOverlay.module.css";

type DragMode = "start" | "end" | "selection" | "viewport";

type ExportRangeOverlayProps = {
  range: ChartExportRange;
  totalDurationMs: number;
  onChange: (range: ChartExportRange) => void;
  onPreview?: (ms: number) => void;
  /** 非空时启用空白区域拖拽视口；选区和手柄仍用于调整导出范围。 */
  onViewportPan?: (deltaMs: number) => void;
};

export function ExportRangeOverlay({
  range,
  totalDurationMs,
  onChange,
  onPreview,
  onViewportPan,
}: ExportRangeOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rootWidthRef = useRef(0);
  const draggingModeRef = useRef<DragMode | null>(null);
  const handleDragOffsetMsRef = useRef(0);
  const selectionDragOffsetMsRef = useRef(0);
  const viewportDragClientXRef = useRef(0);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const totalDurationMsRef = useRef(totalDurationMs);
  totalDurationMsRef.current = totalDurationMs;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPreviewRef = useRef(onPreview);
  onPreviewRef.current = onPreview;
  const onViewportPanRef = useRef(onViewportPan);
  onViewportPanRef.current = onViewportPan;

  const startPercent = totalDurationMs > 0 ? (range.startMs / totalDurationMs) * 100 : 0;
  const endPercent = totalDurationMs > 0 ? (range.endMs / totalDurationMs) * 100 : 0;
  const durationMs = Math.max(0, range.endMs - range.startMs);

  const updateDragging = useCallback((clientX: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    const width = rootWidthRef.current;
    const durationMs = totalDurationMsRef.current;
    if (!rect || width <= 0 || durationMs <= 0) return;

    const x = clamp(clientX - rect.left, 0, width);
    const pointerMs = (x / width) * durationMs;

    const mode = draggingModeRef.current;
    if (!mode) return;

    if (mode === "viewport") {
      const deltaX = clientX - viewportDragClientXRef.current;
      viewportDragClientXRef.current = clientX;
      onViewportPanRef.current?.(-(deltaX / width) * durationMs);
      return;
    }

    const currentRange = rangeRef.current;
    const targetMs =
      mode === "start" || mode === "end" ? pointerMs - handleDragOffsetMsRef.current : pointerMs;
    let newRange: ChartExportRange;

    if (mode === "start") {
      newRange = {
        startMs: Math.max(
          currentRange.endMs - MAX_EXPORT_DURATION_MS,
          Math.min(targetMs, currentRange.endMs - MIN_EXPORT_DURATION_MS),
        ),
        endMs: currentRange.endMs,
      };
    } else if (mode === "selection") {
      const rangeDurationMs = currentRange.endMs - currentRange.startMs;
      const startMs = clamp(
        targetMs - selectionDragOffsetMsRef.current,
        0,
        durationMs - rangeDurationMs,
      );

      newRange = {
        startMs,
        endMs: startMs + rangeDurationMs,
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
    onPreviewRef.current?.(mode === "end" ? newRange.endMs : newRange.startMs);
  }, []);

  const startDragging = (mode: DragMode, clientX: number) => {
    rootWidthRef.current = rootRef.current?.getBoundingClientRect().width ?? 0;
    draggingModeRef.current = mode;

    if (mode === "selection") {
      const rect = rootRef.current?.getBoundingClientRect();
      const width = rootWidthRef.current;
      const durationMs = totalDurationMsRef.current;
      if (rect && width > 0 && durationMs > 0) {
        const x = clamp(clientX - rect.left, 0, width);
        selectionDragOffsetMsRef.current = (x / width) * durationMs - rangeRef.current.startMs;
      }
    } else if (mode === "viewport") {
      viewportDragClientXRef.current = clientX;
    } else if (mode === "start" || mode === "end") {
      const rect = rootRef.current?.getBoundingClientRect();
      const width = rootWidthRef.current;
      const durationMs = totalDurationMsRef.current;
      if (rect && width > 0 && durationMs > 0) {
        const x = clamp(clientX - rect.left, 0, width);
        const pointerMs = (x / width) * durationMs;
        const currentRange = rangeRef.current;
        const handleMs = mode === "start" ? currentRange.startMs : currentRange.endMs;
        handleDragOffsetMsRef.current = pointerMs - handleMs;
        onPreviewRef.current?.(handleMs);
      }
      return;
    }

    updateDragging(clientX);
  };

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!draggingModeRef.current) return;
      event.preventDefault();
      updateDragging(event.clientX);
    };

    const handlePointerUp = () => {
      draggingModeRef.current = null;
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("pointercancel", handlePointerUp);

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [updateDragging]);

  const pannable = Boolean(onViewportPan);

  return (
    <div
      ref={rootRef}
      className={`${classes.overlay} ${pannable ? classes.overlayPannable : ""}`}
      onPointerDown={(event) => {
        if (!pannable) return;
        event.preventDefault();
        if (!draggingModeRef.current) {
          startDragging("viewport", event.clientX);
        }
      }}
    >
      <div className={classes.shade} style={{ left: 0, width: `${startPercent}%` }} />
      <div
        className={classes.shade}
        style={{ left: `${endPercent}%`, width: `${100 - endPercent}%` }}
      />
      <div
        className={classes.selection}
        style={{
          left: `${startPercent}%`,
          width: `${endPercent - startPercent}%`,
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          startDragging("selection", event.clientX);
        }}
      >
        <div className={classes.durationLabel}>{formatDuration(durationMs)}</div>
      </div>
      <div
        className={`${classes.handle} ${classes.startHandle}`}
        style={{ left: `${startPercent}%` }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          startDragging("start", event.clientX);
        }}
      >
        <div className={classes.handleGrip} />
      </div>
      <div
        className={`${classes.handle} ${classes.endHandle}`}
        style={{ left: `${endPercent}%` }}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          startDragging("end", event.clientX);
        }}
      >
        <div className={classes.handleGrip} />
      </div>
    </div>
  );
}
