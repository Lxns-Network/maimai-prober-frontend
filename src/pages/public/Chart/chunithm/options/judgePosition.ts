/** The basic preset's rows from PlayOptionJudgePosTableRecord, in track-depth units. */
export const JUDGE_POSITION_OPTIONS = [
  { value: "0", label: "下", offset: 0 },
  { value: "1", label: "中", offset: -40 },
  { value: "2", label: "上", offset: -80 },
  { value: "3", label: "天", offset: -100 },
] as const;

export const DEFAULT_JUDGE_POSITION_ROW = 0;
