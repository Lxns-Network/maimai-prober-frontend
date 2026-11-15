/** Steps per second of the state grid. */
export const STEPS_PER_SECOND = 120;

/** Grid step whose canonical time is at or before `seconds`; negative and non-finite times map to 0. */
export function stepForSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  if (seconds <= 0) return 0;
  const step = Math.floor(seconds * STEPS_PER_SECOND);
  // Compare in seconds so multiplication cannot move an exact boundary or its predecessor.
  if (seconds < secondsForStep(step)) return step - 1;
  return seconds >= secondsForStep(step + 1) ? step + 1 : step;
}

/** The time a grid step represents. */
export function secondsForStep(step: number): number {
  return step / STEPS_PER_SECOND;
}
