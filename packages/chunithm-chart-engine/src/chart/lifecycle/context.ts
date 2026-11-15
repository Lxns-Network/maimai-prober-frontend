import { AUTOPLAY_JUDGE_TIMING_ROW, autoplayThreshold, judgeTimingOffset } from "./autoplayJudge";

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

export function lifecycleContext(bound: {
  config: DataView;
  difficulty: number;
}): LifecycleContext {
  return {
    config: bound.config,
    difficulty: bound.difficulty,
    offset: judgeTimingOffset(AUTOPLAY_JUDGE_TIMING_ROW),
    threshold: autoplayThreshold(bound.config, AUTOPLAY_JUDGE_TIMING_ROW),
  };
}
