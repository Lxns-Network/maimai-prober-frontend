import type { PageTab } from "@/components/Page/pageTabs.ts";

export const developerTabs = [
  { id: "info", name: "基本信息" },
  { id: "usage", name: "API 用量" },
] as const satisfies readonly PageTab[];
