/** Display rows from PlayOptionJudgeCriticalTableRecord. */
export const JUDGE_DISPLAY_OPTIONS = [
  { value: "0", label: "仅判定" },
  { value: "1", label: "全部显示" },
  { value: "2", label: "仅 FAST/LATE" },
  { value: "3", label: "关闭" },
] as const;

export const DEFAULT_JUDGE_DISPLAY_ROW = 0;
