import { Accordion, Anchor, Button, Center, Loader, Text } from "@mantine/core";
import { IconAddressBookOff, IconDatabaseOff, IconUserPlus } from "@tabler/icons-react";
import { FriendScoreCompare } from "./FriendScoreCompare.tsx";
import { RankingRow } from "./RankingRow.tsx";
import { EmptyState } from "@/components/EmptyState.tsx";
import { GameAvatar } from "@/components/Profile/PlayerSummary.tsx";
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
import { useUser } from "@/hooks/queries/useUser.ts";
import { useSongBests } from "@/hooks/queries/useSongBests.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { type OverlayLinkProps } from "@/hooks/useResumableOverlay";
import { getFriendLoadErrorMessage } from "@/utils/api/friend.ts";
import { chartKey } from "@/utils/scoreCompare.ts";
import { profilePath } from "@/utils/profile.ts";
import { isTokenUndefined } from "@/utils/session.ts";

interface RankingEntry extends FriendRankingScoreProps {
  isSelf: boolean;
}

type AnyScore = MaimaiScoreProps | ChunithmScoreProps;

const valueOf = (row: RankingEntry) => row.achievements ?? row.score ?? 0;

/** 曲目页对未游玩谱面传入 -1 占位成绩，这类成绩不参与排名与对比。 */
const hasPlayed = (score: AnyScore) =>
  ("achievements" in score ? score.achievements : score.score) >= 0;

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
  const { user } = useUser();
  const songList = useSongListStore((state) => state[game]);
  const song = readOnly && score ? (songList.find(score.id) ?? null) : null;
  const { scores: mySongScores } = useSongBests(game, song);

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
      <EmptyState icon={<IconAddressBookOff size={64} stroke={1.5} />} title="暂无好友">
        <Button
          component="a"
          href="/friends"
          {...profileLinkProps}
          mt="md"
          size="xs"
          variant="light"
          leftSection={<IconUserPlus size={14} />}
        >
          添加好友
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
    return <EmptyState icon={<IconAddressBookOff size={64} stroke={1.5} />} title="暂无好友成绩" />;
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
      username: user?.name ?? "",
      name: player?.name ?? "",
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
    <Accordion variant="contained">
      {rows.map((row, index) => {
        const rank = index + 1;
        const avatarProfile = {
          icon: row.icon_id ? { id: row.icon_id } : undefined,
          character: row.character_id ? { id: row.character_id } : undefined,
        };
        const value = row.isSelf ? "self" : String(row.user_id);
        const profileUrl = profilePath(row.username);
        const rowProps = {
          rank,
          achievements: row.achievements,
          score: row.score,
          withBorder: false,
          bg: "transparent",
        };

        if (myScore && !row.isSelf) {
          return (
            <Accordion.Item key={value} value={value}>
              <Accordion.Control>
                <RankingRow
                  {...rowProps}
                  pl={0}
                  pr="sm"
                  py={0}
                  leading={<GameAvatar game={game} profile={avatarProfile} size={28} radius="sm" />}
                  name={
                    <Text fz="sm" lineClamp={1} style={{ wordBreak: "break-word" }}>
                      {row.name}
                    </Text>
                  }
                />
              </Accordion.Control>
              <Accordion.Panel>
                <FriendScoreCompare
                  game={game}
                  mine={myScore}
                  theirs={row}
                  theirName={row.name}
                  profileLinkProps={profileLinkProps}
                />
              </Accordion.Panel>
            </Accordion.Item>
          );
        }

        return (
          <Accordion.Item
            key={value}
            value={value}
            bg={row.isSelf ? "var(--mantine-primary-color-light)" : undefined}
          >
            <RankingRow
              {...rowProps}
              px="md"
              py="sm"
              leading={
                <GameAvatar
                  component="a"
                  {...profileLinkProps}
                  href={profileUrl}
                  aria-label={row.isSelf ? "查看我的档案" : `查看 ${row.name} 的档案`}
                  game={game}
                  profile={avatarProfile}
                  size={28}
                  radius="sm"
                />
              }
              name={
                <Text fz="sm" lineClamp={1} style={{ wordBreak: "break-word" }}>
                  <Anchor
                    {...profileLinkProps}
                    href={profileUrl}
                    c="inherit"
                    fz="inherit"
                    underline="hover"
                  >
                    {row.name}
                  </Anchor>
                </Text>
              }
            />
          </Accordion.Item>
        );
      })}
    </Accordion>
  );
};
