import React from "react";
import { checkPermission, UserPermission } from "@/utils/session.ts";
import { profilePath } from "@/utils/profile.ts";
import type { PageTab } from "@/components/Page/pageTabs.ts";
import { syncTabs } from "@/pages/user/syncTabs.ts";
import { profileTabs } from "@/pages/user/Profile/profileTabs.ts";
import { scoresTabs } from "@/pages/user/Scores/scoresTabs.ts";
import { friendsTabs } from "@/pages/user/friendsTabs.ts";
import { songsTabs } from "@/pages/user/songsTabs.ts";
import { settingsTabs } from "@/pages/user/settingsTabs.ts";
import { developerTabs } from "@/pages/developer/developerTabs.ts";
import { adminPanelTabs } from "@/pages/admin/Panel/adminPanelTabs.ts";
import { systemSettingsTabs } from "@/pages/admin/Settings/systemSettingsTabs.ts";
import {
  IconAward,
  IconBell,
  IconChartBar,
  IconCloudUpload,
  IconCode,
  IconDoorEnter,
  IconGavel,
  IconHelp,
  IconHome,
  IconMusic,
  IconSettings2,
  IconTable,
  IconTransferIn,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";

export interface NavItem {
  label: string;
  icon: React.ReactNode;
  to: string;
  enabled: boolean;
  divider?: boolean;
  tabs?: readonly PageTab[];
}

/** 权限位在调用时从 token 读取，登录态或权限变化后需重新调用。 */
export function getNavItems(isLoggedOut: boolean): NavItem[] {
  return [
    { label: "首页", icon: <IconHome stroke={1.5} />, to: "/", enabled: true },
    {
      label: "同步游戏数据",
      icon: <IconCloudUpload stroke={1.5} />,
      to: "/sync",
      enabled: true,
      tabs: syncTabs,
    },
    {
      label: "账号详情",
      icon: <IconUserCircle stroke={1.5} />,
      to: "/user/profile",
      enabled: !isLoggedOut,
      tabs: profileTabs,
    },
    {
      label: "成绩管理",
      icon: <IconChartBar stroke={1.5} />,
      to: "/user/scores",
      enabled: !isLoggedOut,
      tabs: scoresTabs,
    },
    {
      label: "好友",
      icon: <IconUsers stroke={1.5} />,
      to: "/friends",
      enabled: !isLoggedOut,
      tabs: friendsTabs,
    },
    {
      label: "曲目查询",
      icon: <IconMusic stroke={1.5} />,
      to: "/songs",
      enabled: true,
      tabs: songsTabs,
    },
    { label: "收藏品查询", icon: <IconAward stroke={1.5} />, to: "/collections", enabled: true },
    {
      label: "登录账号",
      icon: <IconDoorEnter stroke={1.5} />,
      to: "/login",
      enabled: isLoggedOut,
      divider: true,
    },
    {
      label: "新用户注册",
      icon: <IconTransferIn stroke={1.5} />,
      to: "/register",
      enabled: isLoggedOut,
    },
    {
      label: "曲目别名投票",
      icon: <IconGavel stroke={1.5} />,
      to: "/alias/vote",
      enabled: !isLoggedOut,
      divider: true,
    },
    {
      label: "开发者面板",
      icon: <IconCode stroke={1.5} />,
      to: "/developer",
      enabled: !isLoggedOut && checkPermission(UserPermission.Developer),
      tabs: developerTabs,
    },
    {
      label: "申请成为开发者",
      icon: <IconCode stroke={1.5} />,
      to: "/developer/apply",
      enabled: !(isLoggedOut || checkPermission(UserPermission.Developer)),
    },
    {
      label: "管理面板",
      icon: <IconTable stroke={1.5} />,
      to: "/admin/panel",
      enabled: checkPermission(UserPermission.Administrator),
      divider: true,
      tabs: adminPanelTabs,
    },
    {
      label: "系统设置",
      icon: <IconSettings2 stroke={1.5} />,
      to: "/admin/settings",
      enabled: checkPermission(UserPermission.Administrator),
      tabs: systemSettingsTabs,
    },
  ];
}

export const helpNavItem = {
  label: "帮助文档",
  icon: <IconHelp stroke={1.5} />,
  to: "/docs",
};

/** 侧边栏底部用户菜单中的页面入口；图标为组件，由使用方决定尺寸。 */
export const userMenuItems = {
  profile: { label: "资料", icon: IconUserCircle, to: profilePath },
  notifications: { label: "通知", icon: IconBell, to: "/notifications" },
  settings: { label: "设置", icon: IconSettings2, to: "/user/settings", tabs: settingsTabs },
};
