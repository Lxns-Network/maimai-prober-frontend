import type { PageTab } from "@/components/Page/pageTabs.ts";

export const scoresTabs = [
  { id: "list", name: "成绩列表" },
  { id: "bests", name: "分数构成" },
  { id: "backup", name: "备份成绩" },
] as const satisfies readonly PageTab[];
