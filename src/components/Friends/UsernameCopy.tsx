import { ActionIcon, CopyButton, Group, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy, IconLink } from "@tabler/icons-react";
import { profileUrl } from "@/utils/profile";

interface UsernameCopyProps {
  username: string;
  size?: "xs" | "sm";
}

export const UsernameCopy = ({ username, size = "sm" }: UsernameCopyProps) => (
  <Group gap={6} wrap="nowrap">
    <Text size={size} c="dimmed" style={{ flexShrink: 0 }}>
      我的用户名
    </Text>
    <Text size={size} fw={600} truncate="end" title={username} miw={0}>
      {username}
    </Text>
    <Group gap={0} wrap="nowrap" style={{ flexShrink: 0 }}>
      <CopyButton value={username}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "已复制" : "复制用户名"} withArrow>
            <ActionIcon
              variant="subtle"
              size="sm"
              color={copied ? "teal" : "gray"}
              aria-label={copied ? "已复制用户名" : "复制我的用户名"}
              onClick={copy}
            >
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
      <CopyButton value={profileUrl(username)}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "已复制" : "复制好友链接"} withArrow>
            <ActionIcon
              variant="subtle"
              size="sm"
              color={copied ? "teal" : "gray"}
              aria-label={copied ? "已复制好友链接" : "复制我的好友链接"}
              onClick={copy}
            >
              {copied ? <IconCheck size={16} /> : <IconLink size={16} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  </Group>
);
