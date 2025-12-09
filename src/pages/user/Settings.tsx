import { Page } from "@/components/Page/Page.tsx";
import { GeneralSettingsSection } from "./Settings/GeneralSettingsSection.tsx";
import { SecuritySettingsSection } from "./Settings/SecuritySettingsSection.tsx";

export default function Settings() {
  return (
    <Page
      meta={{
        title: "账号设置",
        description: "设置你的 maimai DX 查分器账号",
      }}
      tabs={[
        { id: "general", name: "常规设置", children: <GeneralSettingsSection /> },
        { id: "security", name: "账号安全", children: <SecuritySettingsSection /> },
      ]}
    />
  )
}
