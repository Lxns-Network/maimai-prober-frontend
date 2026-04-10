import { Page } from "@/components/Page/Page.tsx";
import { WorkersSection } from "./workers/WorkersSection.tsx";
import { SystemSettingsSection } from "./settings/SystemSettingsSection.tsx";

export function Settings() {
  return (
    <Page
      meta={{
        title: "系统设置",
        description: "管理 maimai DX 查分器的运行配置",
      }}
      tabs={[
        { id: "settings", name: "系统设置", children: <SystemSettingsSection /> },
        { id: "workers", name: "工作节点", children: <WorkersSection /> },
      ]}
    />
  );
}
