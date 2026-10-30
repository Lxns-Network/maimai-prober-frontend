import {
  ActionIcon,
  Anchor,
  Avatar,
  Box,
  Button,
  Center,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconChevronDown,
  IconDatabaseOff,
  IconUser,
  IconUserPlus,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useState } from "react";
import dayjs from "dayjs";
import { FriendScoreCompare } from "./FriendScoreCompare.tsx";
import { RankingRow } from "./RankingRow.tsx";
import { EmptyState } from "@/components/EmptyState.tsx";
import { QueryErrorState } from "@/components/QueryErrorState.tsx";
import { Game } from "@/types/game";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import {
  FriendRankingScoreProps,
  useFriendScoreRanking,
} from "@/hooks/queries/useFriendScoreRanking.ts";
import { useFriends } from "@/hooks/queries/useFriends.ts";
import { usePlayer } from "@/hooks/queries/usePlayer.ts";
import { useSongBests } from "@/hooks/queries/useSongBests.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { type OverlayLinkProps } from "@/hooks/useResumableOverlay";
import { ASSET_URL } from "@/main";
import { getFriendLoadErrorMessage } from "@/utils/api/friend.ts";
import { chartKey } from "@/utils/scoreCompare.ts";
import { myProfilePath, profilePath } from "@/utils/profile.ts";
import { isTokenUndefined } from "@/utils/session.ts";

interface RankingEntry extends FriendRankingScoreProps {
  isSelf: boolean;
}

type AnyScore = MaimaiScoreProps | ChunithmScoreProps;

const valueOf = (row: RankingEntry) => row.achievements ?? row.score ?? 0;

/** 曲目页对未游玩谱面传入 -1 占位成绩，这类成绩不参与排名与对比。 */
const hasPlayed = (score: AnyScore) =>
  ("achievements" in score ? score.achievements : score.score) >= 0;

/** 单谱面的好友排行：把本人成绩并入好友成绩一起排序。 */
export const FriendScoreRanking = ({
  game,
  score,
  readOnly = false,
  profileLinkProps,
}: {
  game: Game;
  score: AnyScore | null;
  /** 查看他人成绩时开启：传入的 `score` 不是本人成绩，改为读取本人在同一谱面上的成绩参与排名与对比。 */
  readOnly?: boolean;
  profileLinkProps: OverlayLinkProps;
}) => {
  const { friends, isLoading: friendsLoading } = useFriends();
  const { friendScores, isLoading, error, refetch } = useFriendScoreRanking(game, score);
  const { player } = usePlayer(game);
  const songList = useSongListStore((state) => state[game]);
  const song = readOnly && score ? (songList.find(score.id) ?? null) : null;
  const { scores: mySongScores } = useSongBests(game, song);
  const [comparedUserId, setComparedUserId] = useState<number | null>(null);

  const toggleCompare = (userId: number) =>
    setComparedUserId((current) => (current === userId ? null : userId));

  if (isTokenUndefined()) {
    return (
      <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title="请登录后查看好友排行" />
    );
  }

  if (!score || isLoading || friendsLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  if (friends.length === 0) {
    return (
      <EmptyState
        icon={<IconUsersGroup size={64} stroke={1.5} />}
        title="还没有好友"
        description="添加好友后，就能在这里比较同一张谱面的成绩"
      >
        <Button
          component="a"
          href="/friends"
          {...profileLinkProps}
          mt="md"
          size="xs"
          variant="light"
          leftSection={<IconUserPlus size={14} />}
        >
          去添加好友
        </Button>
      </EmptyState>
    );
  }

  if (error && friendScores.length === 0) {
    return (
      <QueryErrorState
        title="好友排行加载失败"
        description={getFriendLoadErrorMessage(error)}
        onRetry={() => void refetch()}
      />
    );
  }

  if (friendScores.length === 0) {
    return (
      <EmptyState
        icon={<IconUsersGroup size={64} stroke={1.5} />}
        title="暂无好友成绩"
        description="你的好友还没有这张谱面的成绩"
      />
    );
  }

  const target = chartKey(score);
  const myScore = readOnly
    ? mySongScores.find((item) => chartKey(item) === target && hasPlayed(item))
    : hasPlayed(score)
      ? score
      : undefined;
  const selfAvatarId =
    game === "maimai"
      ? (player as MaimaiPlayerProps | undefined)?.icon?.id
      : (player as ChunithmPlayerProps | undefined)?.character?.id;

  const rows: RankingEntry[] = friendScores.map((item) => ({ ...item, isSelf: false }));
  if (myScore) {
    rows.push({
      user_id: 0,
      username: "我",
      achievements: "achievements" in myScore ? myScore.achievements : undefined,
      score: "score" in myScore ? myScore.score : undefined,
      icon_id: game === "maimai" ? selfAvatarId : undefined,
      character_id: game === "chunithm" ? selfAvatarId : undefined,
      upload_time: myScore.upload_time,
      isSelf: true,
    });
  }
  rows.sort((a, b) => valueOf(b) - valueOf(a));

  return (
    <Stack gap="xs">
      {rows.map((row, index) => {
        const rank = index + 1;
        const avatarSrc =
          game === "maimai" && row.icon_id
            ? `${ASSET_URL}/maimai/icon/${row.icon_id}.png!webp`
            : game === "chunithm" && row.character_id
              ? `${ASSET_URL}/chunithm/character/${row.character_id}.png!webp`
              : undefined;

        const canCompare = !!myScore && !row.isSelf;
        const displayName = row.remark || row.username;
        const profileUrl = row.isSelf ? myProfilePath(game) : profilePath(row.username, game);

        return (
          <Box key={`${row.user_id}:${row.username}`}>
            <RankingRow
              rank={rank}
              achievements={row.achievements}
              score={row.score}
              highlighted={row.isSelf}
              leading={
                <Avatar
                  component="a"
                  {...profileLinkProps}
                  href={profileUrl}
                  aria-label={row.isSelf ? "查看我的名片" : `查看 ${displayName} 的档案`}
                  src={avatarSrc}
                  size={28}
                  radius="sm"
                >
                  <IconUser size={16} />
                </Avatar>
              }
              name={
                <>
                  <Text fz="sm" lineClamp={1} style={{ wordBreak: "break-word" }}>
                    <Anchor
                      {...profileLinkProps}
                      href={profileUrl}
                      c="inherit"
                      fz="inherit"
                      underline="hover"
                    >
                      {displayName}
                    </Anchor>
                  </Text>
                  <Text fz="xs" c="dimmed">
                    {dayjs(row.upload_time).format("YYYY-MM-DD")}
                  </Text>
                </>
              }
              trailing={
                canCompare && (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={`${comparedUserId === row.user_id ? "收起" : "展开"}与 ${displayName} 的成绩对比`}
                    aria-expanded={comparedUserId === row.user_id}
                    onClick={() => toggleCompare(row.user_id)}
                  >
                    <IconChevronDown
                      size={16}
                      style={{
                        transform: comparedUserId === row.user_id ? "rotate(180deg)" : undefined,
                      }}
                    />
                  </ActionIcon>
                )
              }
            />

            {comparedUserId === row.user_id && myScore && (
              <FriendScoreCompare
                game={game}
                mine={myScore}
                theirs={row}
                theirName={row.remark || row.username}
                profileLinkProps={profileLinkProps}
              />
            )}
          </Box>
        );
      })}
      {myScore && (
        <Text fz="xs" c="dimmed">
          ※ 点击头像或名字查看档案，点击右侧箭头展开成绩对比。
        </Text>
      )}
    </Stack>
  );
};
