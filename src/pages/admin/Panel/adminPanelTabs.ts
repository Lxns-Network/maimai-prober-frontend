import type { PageTab } from "@/components/Page/pageTabs.ts";

export const adminPanelTabs = [
  { id: "users", name: "用户列表" },
  { id: "developers", name: "开发者列表" },
  { id: "oauth", name: "OAuth 应用" },
  { id: "notifications", name: "通知管理" },
] as const satisfies readonly PageTab[];
