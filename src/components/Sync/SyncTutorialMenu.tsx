import { Button, Menu } from "@mantine/core";
import {
  IconBook,
  IconBrandBilibili,
  IconChevronDown,
  IconExternalLink,
  IconHelp,
} from "@tabler/icons-react";
import { navigate } from "vike/client/router";

export const SyncTutorialMenu = () => {
  return (
    <Menu shadow="md" width={220} position="bottom-end">
      <Menu.Target>
        <Button
          variant="light"
          size="sm"
          leftSection={<IconBook size={16} stroke={1.5} />}
          rightSection={<IconChevronDown size={14} />}
        >
          同步教程
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>使用指南</Menu.Label>
        <Menu.Item
          leftSection={<IconBook size={16} stroke={1.5} />}
          onClick={() => {
            void navigate("/docs/sync");
          }}
        >
          完整图文教程
        </Menu.Item>
        <Menu.Item
          leftSection={<IconBrandBilibili size={16} stroke={1.5} />}
          rightSection={<IconExternalLink size={12} style={{ opacity: 0.6 }} />}
          onClick={() => {
            window.open("https://www.bilibili.com/video/BV1mz421z7pg", "_blank");
          }}
        >
          视频教程（B 站）
        </Menu.Item>
        <Menu.Divider />
        <Menu.Label>常见问题</Menu.Label>
        <Menu.Item
          leftSection={<IconHelp size={16} stroke={1.5} />}
          onClick={() => {
            void navigate("/docs/faq#查分器相关问题");
          }}
        >
          常见问题排查
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
