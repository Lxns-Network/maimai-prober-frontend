import { API_URL } from "@/main";
import { Button, Checkbox, Group, Text } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { CopyButtonWithIcon } from "./CopyButtonWithIcon.tsx";

const NOTICE_HIDDEN_KEY = "sync.wechatNoticeHidden";

/** Shows the WeChat transfer notice after copying, unless the user opted out of seeing it again. */
const openWechatNoticeModal = () => {
  if (localStorage.getItem(NOTICE_HIDDEN_KEY) === "true") return;

  let hidden = false;

  modals.openConfirmModal({
    title: "微信传分注意事项",
    centered: true,
    withCloseButton: false,
    children: (
      <>
        <Text size="sm">
          请将 OAuth 链接发送至安全的聊天（如文件传输助手）后，直接点击链接打开网页。不要将 OAuth
          链接粘贴到搜索框打开，否则可能会导致 OAuth 链接失效。
        </Text>
        <Checkbox
          mt="md"
          label="不再提示"
          onChange={(event) => {
            hidden = event.currentTarget.checked;
          }}
        />
      </>
    ),
    labels: { confirm: "我知道了", cancel: "" },
    cancelProps: { display: "none" },
    onClose: () => {
      if (hidden) localStorage.setItem(NOTICE_HIDDEN_KEY, "true");
    },
  });
};

export const WechatOAuthLink = ({
  game = "maimai",
  crawlToken,
}: {
  game: string;
  crawlToken: string | null;
}) => {
  const authLink = `${API_URL}/${game}/wechat/auth${crawlToken ? `?token=${window.btoa(crawlToken)}` : ""}`;
  const isMicroMessenger = /MicroMessenger/i.test(window.navigator.userAgent);

  return (
    <Group gap="xs">
      <CopyButtonWithIcon
        label="复制微信 OAuth 链接"
        content={authLink}
        onCopy={openWechatNoticeModal}
        style={{ flex: 1 }}
      />
      {isMicroMessenger && (
        <Button leftSection={<IconExternalLink size={18} />} onClick={() => window.open(authLink)}>
          微信内跳转
        </Button>
      )}
    </Group>
  );
};
