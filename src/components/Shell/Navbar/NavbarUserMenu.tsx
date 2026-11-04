import { Group, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconLogout, IconSelector, IconSettings2, IconUserCircle } from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import { UserAvatar } from "@/components/Friends/UserAvatar";
import { useUser } from "@/hooks/queries/useUser.ts";
import { useLogoutUser } from "@/hooks/mutations/useUserMutations.ts";
import classes from "./Navbar.module.css";

interface NavbarUserMenuProps {
  active: boolean;
  onClose(): void;
}

export const NavbarUserMenu = ({ active, onClose }: NavbarUserMenuProps) => {
  const { user } = useUser();
  const { mutate: mutateLogout } = useLogoutUser();

  const go = (to: string) => {
    void navigate(to);
    onClose();
  };

  const logout = () => {
    mutateLogout(undefined, {
      // 服务端登出失败也要清掉本地会话：登出不能因刷新或网络故障而失效。
      onSettled: () => {
        localStorage.removeItem("token");
        window.location.href = "/";
      },
    });
  };

  return (
    <Menu position="top-start" width="target" offset={4} radius="md">
      <Menu.Target>
        <UnstyledButton w="100%" className={classes.navbarLink} data-active={active || undefined}>
          <Group wrap="nowrap" w="100%">
            <div className={classes.navbarLinkIcon}>
              <UserAvatar username={user?.name || "用户"} avatarUrl={user?.avatar_url} size={24} />
            </div>
            <Text size="sm" fw={500} truncate flex={1}>
              {user?.name}
            </Text>
            <IconSelector size={16} stroke={1.5} className={classes.navbarLinkIcon} />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconUserCircle size={18} stroke={1.5} />}
          onClick={() => go("/user/profile")}
        >
          资料
        </Menu.Item>
        <Menu.Item
          leftSection={<IconSettings2 size={18} stroke={1.5} />}
          onClick={() => go("/user/settings")}
        >
          设置
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item color="red" leftSection={<IconLogout size={18} stroke={1.5} />} onClick={logout}>
          登出
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
