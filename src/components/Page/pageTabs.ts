import type { ReactNode } from "react";

/** `id` 即 `?tab=` 参数值；不含内容，以便导航与全局搜索引用。 */
export interface PageTab<Id extends string = string> {
  id: Id;
  name: string;
  requiresLogin?: boolean;
}

export const visibleTabs = <T extends PageTab>(tabs: readonly T[], isLoggedOut: boolean) =>
  tabs.filter((tab) => !(isLoggedOut && tab.requiresLogin));

export const withTabContent = <Id extends string>(
  tabs: readonly PageTab<Id>[],
  content: Record<Id, ReactNode>,
) => tabs.map((tab) => ({ ...tab, children: content[tab.id] }));
