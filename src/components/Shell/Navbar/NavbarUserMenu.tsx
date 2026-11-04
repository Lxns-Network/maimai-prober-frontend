import { Badge, Group, Indicator, Menu, Text, UnstyledButton } from "@mantine/core";
import {
  IconBell,
  IconLogout,
  IconSelector,
  IconSettings2,
  IconUserCircle,
} from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import { UserAvatar } from "@/components/Friends/UserAvatar";
import { useUser } from "@/hooks/queries/useUser.ts";
import { useUnreadCount } from "@/hooks/queries/useUnreadCount.ts";
import { useLogoutUser } from "@/hooks/mutations/useUserMutations.ts";
import useGame from "@/hooks/useGame.ts";
import { profilePath } from "@/utils/profile.ts";
import classes from "./Navbar.module.css";

interface NavbarUserMenuProps {
  onClose(): void;
}

export const NavbarUserMenu = ({ onClose }: NavbarUserMenuProps) => {
  const { user } = useUser();
  const [game] = useGame();
  const unreadCount = useUnreadCount();
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
    <Menu position="top-start" width="target" offset={4} radius="md" shadow="md">
      <Menu.Target>
        <UnstyledButton w="100%" className={classes.navbarLink}>
          <Group wrap="nowrap" w="100%">
            <Indicator color="red" size={8} offset={2} disabled={!unreadCount}>
              <div className={classes.navbarLinkIcon}>
                <UserAvatar
                  username={user?.name || "用户"}
                  avatarUrl={user?.avatar_url}
                  size={24}
                />
              </div>
            </Indicator>
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
          disabled={!user}
          onClick={() => user && go(profilePath(user.name, game))}
        >
          资料
        </Menu.Item>
        <Menu.Item
          leftSection={<IconBell size={18} stroke={1.5} />}
          rightSection={
            !!unreadCount && (
              <Badge size="sm" circle color="red">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            )
          }
          onClick={() => go("/notifications")}
        >
          通知
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
