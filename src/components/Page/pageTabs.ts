import type { ReactNode } from "react";

/** 标签页的 `?tab=` 标识与名称，与内容分开定义，供页面、导航与全局搜索共同引用。 */
export interface PageTab<Id extends string = string> {
  id: Id;
  name: string;
  requiresLogin?: boolean;
}

export const visibleTabs = <T extends PageTab>(tabs: readonly T[], isLoggedOut: boolean) =>
  tabs.filter((tab) => !(isLoggedOut && tab.requiresLogin));

/** 按 `id` 为标签页附上内容；`content` 须覆盖 `tabs` 中的全部 `id`。 */
export const withTabContent = <Id extends string>(
  tabs: readonly PageTab<Id>[],
  content: Record<Id, ReactNode>,
) => tabs.map((tab) => ({ ...tab, children: content[tab.id] }));
