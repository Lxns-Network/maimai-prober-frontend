import React from "react";
import { visibleTabs, type PageTab } from "@/components/Page/pageTabs.ts";
import { yearInReviewLinks } from "@/components/Profile/yearInReviewLinks.ts";
import { getNavItems, helpNavItem, userMenuItems } from "@/components/Shell/Navbar/navItems.tsx";

export interface SearchPage {
  label: string;
  description?: string;
  icon: React.ReactNode;
  to: string;
}

/** 侧边栏、用户菜单与个人档案中的年度总结入口，以及它们可直达的标签页；权限位在调用时从 token 读取。 */
export function getSearchPages(isLoggedOut: boolean, username?: string): SearchPage[] {
  const { profile, notifications, settings } = userMenuItems;
  const pages: (SearchPage & { tabs?: readonly PageTab[] })[] = getNavItems(isLoggedOut).filter(
    (item) => item.enabled,
  );
  if (!isLoggedOut) {
    if (username) {
      pages.push({ ...profile, icon: <profile.icon stroke={1.5} />, to: profile.to(username) });
    }
    pages.push(
      { ...notifications, icon: <notifications.icon stroke={1.5} /> },
      { ...settings, icon: <settings.icon stroke={1.5} /> },
      ...yearInReviewLinks.map((link) => ({ ...link, icon: <link.icon stroke={1.5} /> })),
    );
  }
  pages.push(helpNavItem);

  return pages.flatMap(({ label, icon, to, tabs }) => [
    { label, icon, to },
    ...visibleTabs(tabs ?? [], isLoggedOut)
      .filter((tab) => tab.name !== label)
      .map((tab) => ({ label: tab.name, description: label, icon, to: `${to}?tab=${tab.id}` })),
  ]);
}
