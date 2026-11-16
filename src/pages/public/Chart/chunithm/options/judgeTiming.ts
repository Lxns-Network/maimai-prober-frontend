import {
  AUTOPLAY_JUDGE_TIMING_ROW,
  JUDGE_TIMING_OFFSETS,
} from "@lxns-network/chunithm-chart-engine/chart/lifecycle/autoplayJudge";

export const DEFAULT_JUDGE_TIMING_ROW = AUTOPLAY_JUDGE_TIMING_ROW;
export const JUDGE_TIMING_OPTIONS = JUDGE_TIMING_OFFSETS.map((value, row) => ({
  value: String(row),
  label: value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1),
}));
