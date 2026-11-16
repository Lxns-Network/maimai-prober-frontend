import {
  AUTOPLAY_JUDGE_TIMING_ROW,
  JUDGE_TIMING_OFFSETS,
  autoplayThreshold,
  judgeTimingOffset,
} from "./autoplayJudge";

/** Chart-wide inputs every note lifecycle reads. */
export interface LifecycleContext {
  config: DataView;
  /** Difficulty row the judge windows are bound for. */
  difficulty: number;
  /** Judge timing offset in frames. */
  offset: number;
  /** Frame delta at which automatic checkers commit. */
  threshold: number;
}

export function lifecycleContext(
  bound: {
    config: DataView;
    difficulty: number;
  },
  judgeTimingRow = AUTOPLAY_JUDGE_TIMING_ROW,
): LifecycleContext {
  if (
    !Number.isInteger(judgeTimingRow) ||
    judgeTimingRow < 0 ||
    judgeTimingRow >= JUDGE_TIMING_OFFSETS.length
  )
    throw new RangeError("Invalid judge timing option");
  return {
    config: bound.config,
    difficulty: bound.difficulty,
    offset: judgeTimingOffset(judgeTimingRow),
    threshold: autoplayThreshold(bound.config, judgeTimingRow),
  };
}
