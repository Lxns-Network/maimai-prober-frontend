import { Page } from "@/components/Page/Page.tsx";
import { withTabContent } from "@/components/Page/pageTabs.ts";
import { AdminUsersSection } from "@/pages/admin/Panel/users/AdminUsersSection.tsx";
import { AdminDevelopersSection } from "@/pages/admin/Panel/developers/AdminDevelopersSection.tsx";
import { AdminOAuthAppsSection } from "@/pages/admin/Panel/oauth/AdminOAuthAppsSection.tsx";
import { AdminNotificationsSection } from "@/pages/admin/Panel/notifications/AdminNotificationsSection.tsx";
import { adminPanelTabs } from "./adminPanelTabs.ts";

export function Panel() {
  return (
    <Page
      meta={{
        title: "管理面板",
        description: "管理 maimai DX 查分器的用户和开发者",
      }}
      tabs={withTabContent(adminPanelTabs, {
        users: <AdminUsersSection />,
        developers: <AdminDevelopersSection />,
        oauth: <AdminOAuthAppsSection />,
        notifications: <AdminNotificationsSection />,
      })}
    />
  );
}
