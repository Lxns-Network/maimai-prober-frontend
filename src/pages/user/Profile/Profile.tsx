import { Page } from "@/components/Page/Page.tsx";
import { withTabContent } from "@/components/Page/pageTabs.ts";
import { ProfileThirdPartySection } from "./thirdparty/ProfileThirdPartySection.tsx";
import { ProfileSection } from "./profile/ProfileSection.tsx";
import { profileTabs } from "./profileTabs.ts";

export default function Profile() {
  return (
    <Page
      meta={{
        title: "账号详情",
        description: "查看你的 maimai DX 查分器账号详情与游戏数据",
      }}
      tabs={withTabContent(profileTabs, {
        profile: <ProfileSection />,
        thirdparty: <ProfileThirdPartySection />,
      })}
    />
  );
}
