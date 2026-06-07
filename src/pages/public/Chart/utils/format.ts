export function formatChartTimeForFilename(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;

  return `${String(minutes).padStart(2, "0")}m${String(seconds).padStart(2, "0")}s${String(milliseconds).padStart(3, "0")}ms`;
}

/**
 * 将毫秒格式化为可读的时长字符串
 * @example formatDuration(3500) → "3.5 秒"
 * @example formatDuration(3500, "s") → "3.5s"
 */
export function formatDuration(durationMs: number, suffix: string = " 秒"): string {
  return `${(durationMs / 1000).toFixed(1)}${suffix}`;
}
