import type { PageTab } from "@/components/Page/pageTabs.ts";

export const songsTabs = [
  { id: "details", name: "曲目详情" },
  { id: "calendar", name: "更新日历" },
] as const satisfies readonly PageTab[];
