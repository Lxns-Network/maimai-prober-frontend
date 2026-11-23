import type { PageTab } from "@/components/Page/pageTabs.ts";

export const profileTabs = [
  { id: "profile", name: "账号详情" },
  { id: "thirdparty", name: "第三方应用" },
] as const satisfies readonly PageTab[];
