import { Page } from "@/components/Page/Page.tsx";
import { withTabContent } from "@/components/Page/pageTabs.ts";
import { WorkersSection } from "./workers/WorkersSection.tsx";
import { SystemSettingsSection } from "./settings/SystemSettingsSection.tsx";
import { systemSettingsTabs } from "./systemSettingsTabs.ts";

export function Settings() {
  return (
    <Page
      meta={{
        title: "系统设置",
        description: "管理 maimai DX 查分器的运行配置",
      }}
      tabs={withTabContent(systemSettingsTabs, {
        settings: <SystemSettingsSection />,
        workers: <WorkersSection />,
      })}
    />
  );
}
