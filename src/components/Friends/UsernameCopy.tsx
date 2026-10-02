import { ActionIcon, CopyButton, Group, Text, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";

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
    <CopyButton value={username}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? "已复制" : "复制用户名"} withArrow>
          <ActionIcon
            variant="subtle"
            size="sm"
            color={copied ? "teal" : "gray"}
            aria-label={copied ? "已复制用户名" : "复制我的用户名"}
            onClick={copy}
            style={{ flexShrink: 0 }}
          >
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  </Group>
);
