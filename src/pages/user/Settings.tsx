import { Page } from "@/components/Page/Page.tsx";
import { withTabContent } from "@/components/Page/pageTabs.ts";
import { GeneralSettingsSection } from "./Settings/GeneralSettingsSection.tsx";
import { SecuritySettingsSection } from "./Settings/SecuritySettingsSection.tsx";
import { SiteSettingsSection } from "./Settings/SiteSettingsSection.tsx";
import { settingsTabs } from "./settingsTabs.ts";

export default function Settings() {
  return (
    <Page
      meta={{
        title: "账号设置",
        description: "设置你的 maimai DX 查分器账号",
      }}
      tabs={withTabContent(settingsTabs, {
        general: <GeneralSettingsSection />,
        site: <SiteSettingsSection />,
        security: <SecuritySettingsSection />,
      })}
    />
  );
}
