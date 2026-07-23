export const TIME_MARKER_INTERVALS_MS = [30000, 60000, 120000, 300000, 600000];
const MIN_TIME_LABEL_SPACING_PX = 36;

// 取第一个标签间距不重叠的时间刻度间隔。
export function pickTimeMarkerInterval(durationMs: number, widthPx: number): number {
  for (const interval of TIME_MARKER_INTERVALS_MS) {
    const count = durationMs / interval;
    if (count <= 1 || (widthPx > 0 && widthPx / count >= MIN_TIME_LABEL_SPACING_PX)) {
      return interval;
    }
  }
  return TIME_MARKER_INTERVALS_MS[TIME_MARKER_INTERVALS_MS.length - 1];
}
