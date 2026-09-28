import { ActionIcon, Menu, Tooltip } from "@mantine/core";
import {
  IconDotsVertical,
  IconEdit,
  IconShield,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import { useFriendActions } from "@/hooks/useFriendActions";
import { FriendItem } from "@/types/friend";

interface FriendActionButtonsProps {
  friend: FriendItem;
  /** 好友卡片角落用的小号浅色按钮；默认是与输入框等高的描边按钮。 */
  compact?: boolean;
  onRemoved?: () => void;
}

/** 特别关注开关与好友操作菜单，好友卡片与好友资料页共用。 */
export const FriendActionButtons = ({
  friend,
  compact = false,
  onRemoved,
}: FriendActionButtonsProps) => {
  const { editRemark, toggleFavorite, remove, block } = useFriendActions(friend, { onRemoved });
  const favoriteLabel = friend.is_favorite ? "取消特别关注" : "设为特别关注";
  const iconSize = compact ? 16 : 18;
  const buttonProps = {
    variant: compact ? "subtle" : "default",
    color: "gray",
    size: compact ? "sm" : "input-sm",
  };

  return (
    <>
      <Tooltip label={favoriteLabel}>
        <ActionIcon {...buttonProps} onClick={toggleFavorite} aria-label={favoriteLabel}>
          {friend.is_favorite ? (
            <IconStarFilled size={iconSize} style={{ color: "var(--mantine-color-yellow-6)" }} />
          ) : (
            <IconStar size={iconSize} />
          )}
        </ActionIcon>
      </Tooltip>

      <Menu shadow="md" position="bottom-end">
        <Menu.Target>
          <ActionIcon {...buttonProps} aria-label="好友操作">
            <IconDotsVertical size={iconSize} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconEdit size={16} />} onClick={editRemark}>
            修改备注
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item leftSection={<IconShield size={16} />} onClick={block}>
            加入黑名单
          </Menu.Item>
          <Menu.Item color="red" leftSection={<IconTrash size={16} />} onClick={remove}>
            删除好友
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
};
