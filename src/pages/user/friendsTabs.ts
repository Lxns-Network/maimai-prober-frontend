import type { PageTab } from "@/components/Page/pageTabs.ts";

export const friendsTabs = [
  { id: "friends", name: "我的好友" },
  { id: "requests", name: "好友申请" },
] as const satisfies readonly PageTab[];
