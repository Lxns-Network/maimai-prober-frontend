import type { PageTab } from "@/components/Page/pageTabs.ts";

export const systemSettingsTabs = [
  { id: "settings", name: "系统设置" },
  { id: "workers", name: "工作节点" },
] as const satisfies readonly PageTab[];
