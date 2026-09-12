import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Card,
  Divider,
  Group,
  Image,
  Menu,
  Text,
  Tooltip,
  useComputedColorScheme,
} from "@mantine/core";
import {
  IconDotsVertical,
  IconEdit,
  IconEye,
  IconPhotoOff,
  IconShield,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUser,
  IconUserOff,
} from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { Link } from "@/components/Link";
import { TrophyBadge } from "@/components/TrophyBadge";
import profileClasses from "@/components/Profile/Profile.module.css";
import { ChunithmProfileCard, FriendItem, MaimaiProfileCard } from "@/types/friend";
import { Game } from "@/types/game";
import {
  getChunithmCharacterColor,
  getDeluxeRatingGradient,
  getRatingGradient,
} from "@/utils/color";
import { profilePath } from "@/utils/profile";
import { ASSET_URL } from "@/main";
import useGame from "@/hooks/useGame";
import { GAME_NAMES } from "./gameNames";
import { useFriendActions } from "./useFriendActions";
import classes from "./Friends.module.css";

dayjs.extend(relativeTime);

const usePlaceholderAvatarStyle = () => {
  const computedColorScheme = useComputedColorScheme("light");
  return { backgroundColor: computedColorScheme === "dark" ? "#1A1B1E" : "#F1F3F5" };
};

const TrophyLine = ({ trophy }: { trophy: MaimaiProfileCard["trophy"] }) => {
  if (!trophy?.name) return null;
  return <TrophyBadge name={trophy.name} trophyColor={trophy.color ?? "normal"} miw={0} />;
};

const MaimaiSummary = ({ profile }: { profile: MaimaiProfileCard }) => {
  const placeholderStyle = usePlaceholderAvatarStyle();
  const avatarSrc = profile.icon
    ? `${ASSET_URL}/maimai/icon/${profile.icon.id}.png!webp`
    : undefined;

  return (
    <Group wrap="nowrap" align="center" gap="sm" className={classes.cardProfile}>
      <Avatar
        src={avatarSrc}
        size={64}
        radius="md"
        className={classes.avatar}
        style={placeholderStyle}
      >
        {avatarSrc ? <IconPhotoOff size={24} /> : <IconUser size={24} />}
      </Avatar>

      <Box className={classes.cardGameDetails}>
        <Group gap={6} wrap="nowrap">
          <TrophyLine trophy={profile.trophy} />
          <Badge
            variant="gradient"
            gradient={getDeluxeRatingGradient(profile.rating)}
            size="sm"
            style={{ flexShrink: 0 }}
          >
            DX {profile.rating}
          </Badge>
        </Group>

        <Text size="sm" fw={500} truncate="end" title={profile.name} miw={0} mt={4}>
          {profile.name}
        </Text>
        <Divider my={6} variant="dashed" />

        <Group gap={4} wrap="nowrap">
          <Image
            src={`/assets/maimai/course_rank/${profile.course_rank || 0}.webp`}
            alt=""
            h={22}
            w="auto"
            fallbackSrc="/assets/maimai/course_rank/0.webp"
          />
          <Box h={22} w={44} style={{ overflow: "hidden" }}>
            <Image
              src={`/assets/maimai/class_rank/${profile.class_rank || 0}.webp`}
              alt=""
              mt={-3}
            />
          </Box>
          <Group gap={1} wrap="nowrap" ml={2}>
            <Image src="/assets/maimai/icon_star.webp" alt="" h={18} w="auto" />
            <Text size="xs" fw={600}>
              {profile.star}
            </Text>
          </Group>
        </Group>
      </Box>
    </Group>
  );
};

const ChunithmSummary = ({ profile }: { profile: ChunithmProfileCard }) => {
  const placeholderStyle = usePlaceholderAvatarStyle();
  const character = profile.character;
  const avatarSrc = character
    ? `${ASSET_URL}/chunithm/character/${character.id}.png!webp`
    : undefined;

  return (
    <Group wrap="nowrap" align="center" gap="sm" className={classes.cardProfile}>
      <Avatar
        src={avatarSrc}
        size={64}
        radius="md"
        className={classes.avatar}
        style={
          character
            ? {
                backgroundImage: `url(/assets/chunithm/character/${getChunithmCharacterColor(character.level || 0)}.webp)`,
                backgroundSize: "cover",
                padding: 2,
              }
            : placeholderStyle
        }
      >
        {avatarSrc ? <IconPhotoOff size={24} /> : <IconUser size={24} />}
      </Avatar>

      <Box className={classes.cardGameDetails}>
        <Group gap={6} wrap="nowrap">
          <TrophyLine trophy={profile.trophy} />
          <Badge
            variant="gradient"
            gradient={getRatingGradient(profile.rating)}
            size="sm"
            style={{ flexShrink: 0 }}
          >
            Rating {profile.rating.toFixed(2)}
          </Badge>
        </Group>

        <Text size="sm" fw={500} truncate="end" title={profile.name} miw={0} mt={4}>
          {profile.name}
        </Text>
        <Divider my={6} variant="dashed" />

        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Lv.{profile.level} (转生 {profile.reborn_count})
          </Text>
          <Text size="xs" c="dimmed">
            OP {profile.over_power.toFixed(1)}
          </Text>
        </Group>
      </Box>
    </Group>
  );
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
    if (slot.state === "visible" && slot.profile) return <MaimaiSummary profile={slot.profile} />;
  } else {
    const slot = friend.games.chunithm;
    if (slot.state === "visible" && slot.profile) return <ChunithmSummary profile={slot.profile} />;
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
