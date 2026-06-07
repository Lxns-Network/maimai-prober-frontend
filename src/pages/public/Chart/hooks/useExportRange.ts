import { useCallback, useState } from "react";
import type { ChartExportRange } from "../utils/exportChartGif";
import { clamp } from "../utils/math";

const DEFAULT_EXPORT_DURATION_MS = 8000;
export const MIN_EXPORT_DURATION_MS = 500;
export const MAX_EXPORT_DURATION_MS = 15000;

function fullRange(totalDurationMs: number): ChartExportRange {
  return { startMs: 0, endMs: Math.max(0, totalDurationMs) };
}

function createInitialRange(currentMs: number, totalDurationMs: number): ChartExportRange {
  if (totalDurationMs <= MIN_EXPORT_DURATION_MS) return fullRange(totalDurationMs);

  const startMs = clamp(currentMs, 0, totalDurationMs - MIN_EXPORT_DURATION_MS);
  const endMs = Math.min(startMs + DEFAULT_EXPORT_DURATION_MS, totalDurationMs);

  return { startMs, endMs };
}

function normalizeRange(range: ChartExportRange, totalDurationMs: number): ChartExportRange {
  if (totalDurationMs <= MIN_EXPORT_DURATION_MS) return fullRange(totalDurationMs);

  const startMs = clamp(range.startMs, 0, totalDurationMs - MIN_EXPORT_DURATION_MS);
  const maxEndMs = Math.min(totalDurationMs, startMs + MAX_EXPORT_DURATION_MS);
  const endMs = clamp(range.endMs, startMs + MIN_EXPORT_DURATION_MS, maxEndMs);

  return { startMs, endMs };
}

export function useExportRange(totalDurationMs: number) {
  const [range, setRange] = useState<ChartExportRange | null>(null);

  const start = useCallback(
    (currentMs: number) => {
      setRange(createInitialRange(currentMs, totalDurationMs));
    },
    [totalDurationMs],
  );

  const update = useCallback(
    (nextRange: ChartExportRange) => {
      setRange(normalizeRange(nextRange, totalDurationMs));
    },
    [totalDurationMs],
  );

  const clear = useCallback(() => {
    setRange(null);
  }, []);

  return { range, start, update, clear };
}
