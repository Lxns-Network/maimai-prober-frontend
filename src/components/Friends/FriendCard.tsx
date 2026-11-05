import { Avatar, Badge, Box, Card, Group, Skeleton, Stack, Text } from "@mantine/core";
import { IconUserOff } from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/zh-cn";
import { Link } from "@/components/Link";
import profileClasses from "@/components/Profile/Profile.module.css";
import { ChunithmSummary, MaimaiSummary } from "@/components/Profile/PlayerSummary";
import summaryClasses from "@/components/Profile/PlayerSummary.module.css";
import { FriendItem } from "@/types/friend";
import { Game } from "@/types/game";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { getRankMedalColor } from "@/utils/color";
import { profilePath } from "@/utils/profile";
import useGame from "@/hooks/useGame";
import { GAME_NAMES } from "./gameNames";
import { FriendActionButtons } from "./FriendActionButtons";
import classes from "./Friends.module.css";

dayjs.extend(relativeTime);

const UnavailableSummary = ({ unbound, game }: { unbound: boolean; game: Game }) => (
  <Group wrap="nowrap" align="center" gap="sm" className={summaryClasses.cardProfile}>
    <Avatar size={64} radius="md" className={summaryClasses.avatar}>
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
