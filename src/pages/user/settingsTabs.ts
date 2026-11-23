import type { PageTab } from "@/components/Page/pageTabs.ts";

export const settingsTabs = [
  { id: "general", name: "常规设置" },
  { id: "site", name: "站点设置" },
  { id: "security", name: "账号安全" },
] as const satisfies readonly PageTab[];
