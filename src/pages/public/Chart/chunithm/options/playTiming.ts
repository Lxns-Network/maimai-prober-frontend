import {
  playTimingForRowIndex,
  TIMING_ROWS,
} from "@lxns-network/chunithm-chart-engine/notes/tables";

export const DEFAULT_PLAY_TIMING_ROW = 20;

export const PLAY_TIMING_OPTIONS = TIMING_ROWS.map((value, index) => ({
  value: String(index),
  label: value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1),
}));

/** Converts the native 60 Hz option to seconds for the preview's audio-driven clock. */
export function playTimingSeconds(row: number): number {
  if (!Number.isInteger(row) || row < 0 || row >= TIMING_ROWS.length)
    throw new RangeError("Invalid play timing option");
  return Math.fround(playTimingForRowIndex(row)) / 60;
}
