import { API_URL } from "../../main.tsx";
import { Button, Group } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { CopyButtonWithIcon } from "./CopyButtonWithIcon.tsx";

export const WechatOAuthLink = ({ game = 'maimai', crawlToken }: { game: string, crawlToken: string | null }) => {
  const authLink = `${API_URL}/${game}/wechat/auth${crawlToken ? `?token=${window.btoa(crawlToken)}` : ''}`;
  const isMicroMessenger = /MicroMessenger/i.test(window.navigator.userAgent);

  return (
    <Group gap="xs">
      <CopyButtonWithIcon
        label="复制微信 OAuth 链接"
        content={authLink}
        style={{ flex: 1 }}
      />
      {isMicroMessenger && (
        <Button
          leftSection={<IconExternalLink size={18} />}
          onClick={() => window.open(authLink)}
        >
          微信内跳转
        </Button>
      )}
    </Group>
  );
};