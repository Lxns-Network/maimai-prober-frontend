/** Stage ticks the scenes have already run when the chart starts: the lead-in shown before the music. */
export const STAGE_LEAD_IN_TICKS = 223;

/** Fractional Stage frame at chart time; integer steps and display interpolation share this clock. */
export function stageFrameForSeconds(seconds: number): number {
  return Math.max(0, seconds * 60) + 1 + STAGE_LEAD_IN_TICKS;
}
