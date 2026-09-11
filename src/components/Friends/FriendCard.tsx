import {
  ActionIcon,
  Avatar,
  Box,
  Card,
  Group,
  Menu,
  ScrollArea,
  Text,
  Tooltip,
  useComputedColorScheme,
} from "@mantine/core";
import {
  IconDotsVertical,
  IconEdit,
  IconEye,
  IconShield,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUserOff,
} from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { Link } from "@/components/Link";
import profileClasses from "@/components/Profile/Profile.module.css";
import { MaimaiPlayerContent } from "@/components/Profile/PlayerPanel/maimai/PlayerContent";
import { ChunithmPlayerContent } from "@/components/Profile/PlayerPanel/chunithm/PlayerContent";
import { FriendItem } from "@/types/friend";
import { Game } from "@/types/game";
import { profilePath } from "@/utils/profile";
import useGame from "@/hooks/useGame";
import { GAME_NAMES } from "./gameNames";
import { useFriendActions } from "./useFriendActions";
import classes from "./Friends.module.css";

dayjs.extend(relativeTime);

const usePlaceholderAvatarStyle = () => {
  const computedColorScheme = useComputedColorScheme("light");
  return { backgroundColor: computedColorScheme === "dark" ? "#1A1B1E" : "#F1F3F5" };
};

const UnavailableSummary = ({ unbound, game }: { unbound: boolean; game: Game }) => {
  const placeholderStyle = usePlaceholderAvatarStyle();

  return (
    <Group wrap="nowrap" align="center" gap="sm" className={classes.cardProfile}>
      <Avatar size={64} radius="md" className={classes.avatar} style={placeholderStyle}>
        <IconUserOff size={24} color="gray" />
      </Avatar>

      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text size="sm" fw={500}>
          {unbound ? "未绑定该游戏" : "暂无游戏数据"}
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          {unbound ? `该好友尚未绑定 ${GAME_NAMES[game]}` : "暂时没有可展示的游戏资料"}
        </Text>
      </Box>
    </Group>
  );
};

const GameSummary = ({ friend, game }: { friend: FriendItem; game: Game }) => {
  if (game === "maimai") {
    const slot = friend.games.maimai;
    if (slot.state === "visible" && slot.profile) {
      return (
        <ScrollArea>
          <MaimaiPlayerContent player={slot.profile} editable={false} />
        </ScrollArea>
      );
    }
  } else {
    const slot = friend.games.chunithm;
    if (slot.state === "visible" && slot.profile) {
      return (
        <ScrollArea>
          <ChunithmPlayerContent player={slot.profile} editable={false} />
        </ScrollArea>
      );
    }
  }
  return <UnavailableSummary unbound={friend.games[game].state === "unbound"} game={game} />;
};

interface FriendCardProps {
  friend: FriendItem;
}

export const FriendCard = ({ friend }: FriendCardProps) => {
  const [game] = useGame();
  const { editRemark, toggleFavorite, remove, block } = useFriendActions(friend);

  const slot = friend.games[game];
  const displayName = friend.remark || friend.username;
  const favoriteLabel = friend.is_favorite ? "取消特别关注" : "设为特别关注";
  const detailPath = profilePath(friend.username);
  const uploadTime = slot.profile?.upload_time;

  return (
    <Card withBorder radius="md" p="md" className={[profileClasses.card, classes.card].join(" ")}>
      <Group gap={2} wrap="nowrap" className={classes.cardActions}>
        <Tooltip label={favoriteLabel}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            onClick={toggleFavorite}
            aria-label={favoriteLabel}
          >
            {friend.is_favorite ? (
              <IconStarFilled size={16} style={{ color: "var(--mantine-color-yellow-6)" }} />
            ) : (
              <IconStar size={16} />
            )}
          </ActionIcon>
        </Tooltip>

        <Menu position="bottom-end" shadow="md" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" size="sm" aria-label="更多操作">
              <IconDotsVertical size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconEye size={15} />} onClick={() => navigate(detailPath)}>
              查看详情
            </Menu.Item>
            <Menu.Item leftSection={<IconEdit size={15} />} onClick={editRemark}>
              修改备注
            </Menu.Item>
            <Menu.Item
              leftSection={
                friend.is_favorite ? (
                  <IconStarFilled size={15} style={{ color: "var(--mantine-color-yellow-6)" }} />
                ) : (
                  <IconStar size={15} />
                )
              }
              onClick={toggleFavorite}
            >
              {favoriteLabel}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item color="gray" leftSection={<IconShield size={15} />} onClick={block}>
              加入黑名单
            </Menu.Item>
            <Menu.Item color="red" leftSection={<IconTrash size={15} />} onClick={remove}>
              删除好友
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Box
        component={Link}
        to={detailPath}
        className={classes.cardDetailsTrigger}
        aria-label={`查看${displayName}的好友详情`}
      >
        <Box className={classes.cardIdentity}>
          <Text fw={600} size="md" truncate="end" title={displayName}>
            {displayName}
          </Text>
          {friend.remark && (
            <Text size="xs" c="dimmed" truncate="end" title={`@${friend.username}`}>
              @{friend.username}
            </Text>
          )}
        </Box>

        <GameSummary friend={friend} game={game} />

        <Text size="xs" c="dimmed" className={classes.cardSyncTime}>
          最近同步：{uploadTime ? dayjs(uploadTime).locale("zh-cn").fromNow() : "暂无记录"}
        </Text>
      </Box>
    </Card>
  );
};
