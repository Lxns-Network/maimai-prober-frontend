import type { PageTab } from "@/components/Page/pageTabs.ts";

export const syncTabs = [
  { id: "proxy", name: "代理同步" },
  { id: "html", name: "上传 HTML", requiresLogin: true },
] as const satisfies readonly PageTab[];
