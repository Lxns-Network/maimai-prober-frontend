import React from "react";
import {
  IconBell,
  IconCalendarStats,
  IconPlayerPlay,
  IconSettings2,
  IconUserCircle,
} from "@tabler/icons-react";
import { getNavItems, helpNavItem } from "@/components/Shell/Navbar/navItems.tsx";
import { SUPPORTED_YEARS } from "@/pages/(csr)/year-in-review/config";
import { profilePath } from "@/utils/profile.ts";

export interface SearchPage {
  label: string;
  description?: string;
  icon: React.ReactNode;
  to: string;
}

/** 须与各页面 `tabs` 的 `id` 和名称一致；与所属页面同名的标签页不单独列出。 */
const pageTabs: Record<string, { id: string; label: string; requiresLogin?: boolean }[]> = {
  "/sync": [
    { id: "proxy", label: "代理同步" },
    { id: "html", label: "上传 HTML", requiresLogin: true },
  ],
  "/user/profile": [
    { id: "profile", label: "账号详情" },
    { id: "thirdparty", label: "第三方应用" },
  ],
  "/user/scores": [
    { id: "list", label: "成绩列表" },
    { id: "bests", label: "分数构成" },
    { id: "backup", label: "备份成绩" },
  ],
  "/friends": [
    { id: "friends", label: "我的好友" },
    { id: "requests", label: "好友申请" },
  ],
  "/songs": [
    { id: "details", label: "曲目详情" },
    { id: "calendar", label: "更新日历" },
  ],
  "/developer": [
    { id: "info", label: "基本信息" },
    { id: "usage", label: "API 用量" },
  ],
  "/admin/panel": [
    { id: "users", label: "用户列表" },
    { id: "developers", label: "开发者列表" },
    { id: "oauth", label: "OAuth 应用" },
    { id: "notifications", label: "通知管理" },
  ],
  "/admin/settings": [
    { id: "settings", label: "系统设置" },
    { id: "workers", label: "工作节点" },
  ],
  "/user/settings": [
    { id: "general", label: "常规设置" },
    { id: "site", label: "站点设置" },
    { id: "security", label: "账号安全" },
  ],
};

/** 导航栏入口、用户菜单与其他独立页面，以及它们可直达的标签页；权限位在调用时从 token 读取。 */
export function getSearchPages(isLoggedOut: boolean, username?: string): SearchPage[] {
  const pages: SearchPage[] = [
    ...getNavItems(isLoggedOut).filter((item) => item.enabled),
    { label: "谱面预览", icon: <IconPlayerPlay stroke={1.5} />, to: "/chart" },
  ];
  if (!isLoggedOut) {
    if (username) {
      pages.push({
        label: "我的资料",
        icon: <IconUserCircle stroke={1.5} />,
        to: profilePath(username),
      });
    }
    pages.push(
      { label: "通知", icon: <IconBell stroke={1.5} />, to: "/notifications" },
      { label: "账号设置", icon: <IconSettings2 stroke={1.5} />, to: "/user/settings" },
      ...SUPPORTED_YEARS.map((year) => ({
        label: `${year} 年度总结`,
        icon: <IconCalendarStats stroke={1.5} />,
        to: `/year-in-review/${year}`,
      })),
    );
  }
  pages.push(helpNavItem);

  return pages.flatMap((page) => [
    page,
    ...(pageTabs[page.to] ?? [])
      .filter((tab) => tab.label !== page.label && !(tab.requiresLogin && isLoggedOut))
      .map((tab) => ({
        label: tab.label,
        description: page.label,
        icon: page.icon,
        to: `${page.to}?tab=${tab.id}`,
      })),
  ]);
}
