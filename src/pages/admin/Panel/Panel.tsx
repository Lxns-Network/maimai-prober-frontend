import { Page } from "@/components/Page/Page.tsx";
import { AdminUsersSection } from "@/pages/admin/Panel/users/AdminUsersSection.tsx";
import { AdminDevelopersSection } from "@/pages/admin/Panel/developers/AdminDevelopersSection.tsx";

export function Panel() {
  return (
    <Page
      meta={{
        title: "管理面板",
        description: "管理 maimai DX 查分器的用户和开发者",
      }}
      tabs={[
        { id: "users", name: "用户列表", children: <AdminUsersSection /> },
        { id: "developers", name: "开发者列表", children: <AdminDevelopersSection />},
      ]}
    />
  );
}