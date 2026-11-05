import {
  Avatar,
  type AvatarProps,
  Badge,
  Box,
  Card,
  Divider,
  Group,
  Image,
  Skeleton,
  Stack,
  Text,
} from "@mantine/core";
import { IconPhotoOff, IconUser, IconUserOff } from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { Link } from "@/components/Link";
import { TrophyBadge } from "@/components/TrophyBadge";
import { EditAvatarButton } from "@/components/EditAvatarButton";
import profileClasses from "@/components/Profile/Profile.module.css";
import { ChunithmProfileCard, FriendItem, MaimaiProfileCard } from "@/types/friend";
import { Game } from "@/types/game";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import {
  getChunithmCharacterColor,
  getDeluxeRatingGradient,
  getRankMedalColor,
  getRatingGradient,
} from "@/utils/color";
import { profilePath } from "@/utils/profile";
import { ASSET_URL } from "@/main";
import useGame from "@/hooks/useGame";
import { GAME_NAMES } from "./gameNames";
import { FriendActionButtons } from "./FriendActionButtons";
import classes from "./Friends.module.css";

dayjs.extend(relativeTime);

type MaimaiSummaryProfile = Pick<
  MaimaiProfileCard,
  "name" | "rating" | "course_rank" | "class_rank" | "star"
> & { trophy?: { name: string; color?: string }; icon?: { id: number } };

type ChunithmSummaryProfile = Pick<
  ChunithmProfileCard,
  "name" | "rating" | "level" | "reborn_count" | "over_power"
> & { trophy?: { name: string; color?: string }; character?: { id: number; level?: number } };

const TrophyLine = ({ trophy }: { trophy?: { name: string; color?: string } }) => {
  if (!trophy?.name) return null;
  return <TrophyBadge name={trophy.name} trophyColor={trophy.color ?? "normal"} miw={0} />;
};

export const GameAvatar = ({
  game,
  profile,
  size = 64,
  ...avatarProps
}: {
  game: Game;
  profile?: MaimaiSummaryProfile | ChunithmSummaryProfile;
  size?: number;
} & Omit<AvatarProps, "src" | "size">) => {
  const character = profile && "character" in profile ? profile.character : undefined;
  const icon = profile && "icon" in profile ? profile.icon : undefined;
  const src =
    game === "maimai"
      ? icon && `${ASSET_URL}/maimai/icon/${icon.id}.png!webp`
      : character && `${ASSET_URL}/chunithm/character/${character.id}.png!webp`;
  const placeholderSize = Math.round(size * 0.375);

  return (
    <Avatar
      src={src}
      size={size}
      radius="md"
      className={classes.avatar}
      style={
        game === "chunithm" && character
          ? {
              background: `url(/assets/chunithm/character/${getChunithmCharacterColor(character.level || 0)}.webp) 0 0 / cover`,
              padding: 2,
            }
          : undefined
      }
      {...avatarProps}
    >
      {src ? <IconPhotoOff size={placeholderSize} /> : <IconUser size={placeholderSize} />}
    </Avatar>
  );
};

export const RatingBadge = ({ game, rating }: { game: Game; rating: number }) => (
  <Badge
    variant="gradient"
    gradient={game === "maimai" ? getDeluxeRatingGradient(rating) : getRatingGradient(rating)}
    size="sm"
    style={{ flexShrink: 0 }}
  >
    {game === "maimai" ? `DX ${rating}` : `Rating ${rating.toFixed(2)}`}
  </Badge>
);

const SummaryAvatar = ({
  game,
  profile,
  onAvatarClick,
}: {
  game: Game;
  profile: MaimaiSummaryProfile | ChunithmSummaryProfile;
  onAvatarClick?: () => void;
}) => {
  const avatar = <GameAvatar game={game} profile={profile} />;
  if (!onAvatarClick) return avatar;
  return (
    <EditAvatarButton onClick={onAvatarClick} radius="var(--mantine-radius-md)">
      {avatar}
    </EditAvatarButton>
  );
};

export const MaimaiSummary = ({
  profile,
  onAvatarClick,
}: {
  profile: MaimaiSummaryProfile;
  onAvatarClick?: () => void;
}) => (
  <Group wrap="nowrap" align="center" gap="sm" className={classes.cardProfile}>
    <SummaryAvatar game="maimai" profile={profile} onAvatarClick={onAvatarClick} />

    <Box className={classes.cardGameDetails}>
      <Group gap={6} wrap="nowrap">
        <TrophyLine trophy={profile.trophy} />
        <RatingBadge game="maimai" rating={profile.rating} />
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
          <Image src={`/assets/maimai/class_rank/${profile.class_rank || 0}.webp`} alt="" mt={-3} />
        </Box>
        <Group gap={1} wrap="nowrap" ml={2}>
          <Image src="/assets/maimai/icon_star.webp" alt="" h={18} w="auto" />
          <Text size="xs" fw={600}>
            ×{profile.star}
          </Text>
        </Group>
      </Group>
    </Box>
  </Group>
);

export const ChunithmSummary = ({
  profile,
  onAvatarClick,
}: {
  profile: ChunithmSummaryProfile;
  onAvatarClick?: () => void;
}) => (
  <Group wrap="nowrap" align="center" gap="sm" className={classes.cardProfile}>
    <SummaryAvatar game="chunithm" profile={profile} onAvatarClick={onAvatarClick} />

    <Box className={classes.cardGameDetails}>
      <Group gap={6} wrap="nowrap">
        <TrophyLine trophy={profile.trophy} />
        <RatingBadge game="chunithm" rating={profile.rating} />
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

const UnavailableSummary = ({ unbound, game }: { unbound: boolean; game: Game }) => (
  <Group wrap="nowrap" align="center" gap="sm" className={classes.cardProfile}>
    <Avatar size={64} radius="md" className={classes.avatar}>
      <IconUserOff size={24} color="gray" />
    </Avatar>

    <Box flex={1} miw={0}>
      <Text size="sm" fw={500}>
        {unbound ? `未绑定「${GAME_NAMES[game]}」` : "暂无游戏数据"}
      </Text>
    </Box>
  </Group>
);

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

const SyncTime = ({ uploadTime }: { uploadTime?: string }) => (
  <Text size="xs" c="dimmed" className={classes.cardSyncTime}>
    最近同步：{uploadTime ? dayjs(uploadTime).locale("zh-cn").fromNow() : "暂无记录"}
  </Text>
);

const RankBadge = ({ rank, filled = false }: { rank: number; filled?: boolean }) => (
  <Badge
    variant={filled ? "filled" : "light"}
    color={getRankMedalColor(rank)}
    size="sm"
    style={{ flexShrink: 0 }}
  >
    #{rank}
  </Badge>
);

const CardIdentity = ({
  rank,
  rankFilled,
  name,
  username,
}: {
  rank?: number;
  rankFilled?: boolean;
  name: string;
  username?: string;
}) => (
  <Group gap={6} wrap="nowrap" align="baseline" className={classes.cardIdentity}>
    {rank !== undefined && <RankBadge rank={rank} filled={rankFilled} />}
    <Text fw={600} size="md" truncate="end" title={name} miw={0}>
      {name}
    </Text>
    {username && (
      <Text size="xs" c="dimmed" truncate="end" title={`@${username}`} maw="50%" flex="none">
        @{username}
      </Text>
    )}
  </Group>
);

interface FriendCardProps {
  friend: FriendItem;
  rank?: number;
}

export const FriendCard = ({ friend, rank }: FriendCardProps) => {
  const [game] = useGame();

  const slot = friend.games[game];
  const displayName = friend.remark || friend.username;

  return (
    <Card withBorder radius="md" p={0} className={[profileClasses.card, classes.card].join(" ")}>
      <Group gap={2} wrap="nowrap" className={classes.cardActions}>
        <FriendActionButtons friend={friend} compact />
      </Group>

      <Box
        component={Link}
        to={profilePath(friend.username)}
        p="md"
        className={classes.cardDetailsTrigger}
        aria-label={`查看${displayName}的好友详情`}
      >
        <CardIdentity
          rank={rank}
          name={displayName}
          username={friend.remark ? friend.username : undefined}
        />

        <GameSummary friend={friend} game={game} />

        {slot.state === "visible" && <SyncTime uploadTime={slot.profile?.upload_time} />}
      </Box>
    </Card>
  );
};

export const SelfRankCard = ({
  game,
  player,
  username,
  rank,
}: {
  game: Game;
  player: MaimaiPlayerProps | ChunithmPlayerProps;
  username?: string;
  rank: number;
}) => (
  <Card
    withBorder
    radius="md"
    p="md"
    bg="var(--mantine-primary-color-light)"
    className={[profileClasses.card, classes.card].join(" ")}
    data-self
  >
    <CardIdentity rank={rank} rankFilled name="我" username={username} />

    {game === "maimai" ? (
      <MaimaiSummary profile={player as MaimaiPlayerProps} />
    ) : (
      <ChunithmSummary profile={player as ChunithmPlayerProps} />
    )}

    <SyncTime uploadTime={player.upload_time} />
  </Card>
);

export const FriendCardSkeleton = () => (
  <Card withBorder radius="md" p="md" className={profileClasses.card}>
    <Skeleton h={16} w="40%" mb="lg" />
    <Group wrap="nowrap" gap="sm">
      <Skeleton h={64} w={64} radius="md" />
      <Stack gap={8} flex={1}>
        <Skeleton h={18} w="60%" />
        <Skeleton h={12} w="80%" />
        <Skeleton h={12} w="50%" />
      </Stack>
    </Group>
    <Skeleton h={10} w="30%" mt="lg" />
  </Card>
);
