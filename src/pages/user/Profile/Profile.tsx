import { Page } from "@/components/Page/Page.tsx";
import { ProfileThirdPartySection } from "./thirdparty/ProfileThirdPartySection.tsx";
import { ProfileSection } from "./profile/ProfileSection.tsx";

export default function Profile() {
  return (
    <Page
      meta={{
        title: "账号详情",
        description: "查看你的 maimai DX 查分器账号详情与游戏数据",
      }}
      tabs={[
        { id: "profile", name: "账号详情", children: <ProfileSection /> },
        { id: "thirdparty", name: "第三方应用", children: <ProfileThirdPartySection /> },
      ]}
    />
  )
}