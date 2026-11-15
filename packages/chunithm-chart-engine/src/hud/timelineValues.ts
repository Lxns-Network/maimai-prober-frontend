import type { Timeline } from "../chart/timeline/reader";

/** Score, combo, gauge and judgment counts the HUD shows. */
export interface HudValues {
  score: number;
  combo: number;
  gauge: number;
  /** Justice critical, justice, attack and miss counts. */
  counts: [number, number, number, number];
}

/** Values shown before the first judgment. */
export const HUD_INITIAL_VALUES: Readonly<HudValues> = Object.freeze({
  score: 0,
  combo: 0,
  gauge: 0,
  counts: Object.freeze([0, 0, 0, 0]) as HudValues["counts"],
});

export function createHudValues(): HudValues {
  return { score: 0, combo: 0, gauge: 0, counts: [0, 0, 0, 0] };
}

const STEPS_PER_SECOND = 120;

/**
 * Reads, for a grid step, the values after every judgment made at or before that step. Each call
 * writes into and returns `out`.
 */
export function createHudValueReader(
  timeline: Timeline,
): (step: number, out: HudValues) => HudValues {
  const time = timeline.column("score", "time");
  const score = timeline.column("score", "score");
  const combo = timeline.column("score", "combo");
  const gauge = timeline.column("score", "gauge");
  const counts = [0, 1, 2, 3].map((i) => timeline.column("score", `judgeCounts${i}`));
  return (step, out) => {
    const limit = (step + 0.5) / STEPS_PER_SECOND;
    let lo = 0;
    let hi = time.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (time[mid] < limit) lo = mid + 1;
      else hi = mid;
    }
    const row = lo - 1;
    if (row < 0) {
      out.score = 0;
      out.combo = 0;
      out.gauge = 0;
      out.counts[0] = out.counts[1] = out.counts[2] = out.counts[3] = 0;
      return out;
    }
    out.score = score[row];
    out.combo = combo[row];
    out.gauge = gauge[row];
    for (let i = 0; i < 4; i++) out.counts[i] = counts[i][row];
    return out;
  };
}
