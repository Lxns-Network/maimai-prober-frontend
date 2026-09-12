import { Avatar, Box, Center, Loader, Stack, Text } from "@mantine/core";
import { IconChevronDown, IconDatabaseOff, IconUser, IconUsersGroup } from "@tabler/icons-react";
import { useState } from "react";
import { FriendScoreCompare } from "./FriendScoreCompare.tsx";
import { RankingRow } from "./RankingRow.tsx";
import { EmptyState } from "@/components/EmptyState.tsx";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import {
  FriendRankingScoreProps,
  useFriendScoreRanking,
} from "@/hooks/queries/useFriendScoreRanking.ts";
import { ASSET_URL } from "@/main";
import dayjs from "dayjs";
import { isTokenUndefined } from "@/utils/session.ts";

interface RankingRow extends FriendRankingScoreProps {
  isSelf: boolean;
}

const valueOf = (row: RankingRow) => row.achievements ?? row.score ?? 0;

/** 曲目页对未游玩谱面传入 -1 占位成绩，这类成绩不参与排名与对比。 */
const hasPlayed = (score: MaimaiScoreProps | ChunithmScoreProps) =>
  ("achievements" in score ? score.achievements : score.score) >= 0;

/**
 * 单谱面的好友排行：把本人成绩并入好友成绩一起排序，
 * 未公开成绩的好友不会出现在这里（后端不下发）。
 */
export const FriendScoreRanking = ({
  game,
  score,
  readOnly = false,
}: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  /** 查看他人成绩时开启：传入的 `score` 不是本人成绩，不注入「我」行，也不提供逐项对比。 */
  readOnly?: boolean;
}) => {
  const { friendScores, isLoading } = useFriendScoreRanking(game, score);
  const [comparedUserId, setComparedUserId] = useState<number | null>(null);

  const toggleCompare = (userId: number) =>
    setComparedUserId((current) => (current === userId ? null : userId));

  if (isTokenUndefined()) {
    return (
      <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title="请登录后查看好友排行" />
    );
  }

  if (!score || isLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  const canCompare = !readOnly && hasPlayed(score);
  const selfRow: RankingRow = {
    user_id: 0,
    username: "我",
    achievements: "achievements" in score ? score.achievements : undefined,
    score: "score" in score ? score.score : undefined,
    fc: "fc" in score ? score.fc : undefined,
    upload_time: score.upload_time,
    isSelf: true,
  };

  const rows = [
    ...friendScores.map((item) => ({ ...item, isSelf: false })),
    ...(canCompare ? [selfRow] : []),
  ].sort((a, b) => valueOf(b) - valueOf(a));

  if (friendScores.length === 0) {
    return (
      <EmptyState
        icon={<IconUsersGroup size={64} stroke={1.5} />}
        title="暂无好友成绩"
        description="你的好友还没有这张谱面的成绩，或未公开自己的谱面成绩"
      />
    );
  }

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

        return (
          <Box key={`${row.user_id}:${row.username}`}>
            <RankingRow
              rank={rank}
              achievements={row.achievements}
              score={row.score}
              role={row.isSelf || !canCompare ? undefined : "button"}
              tabIndex={row.isSelf || !canCompare ? undefined : 0}
              onClick={row.isSelf || !canCompare ? undefined : () => toggleCompare(row.user_id)}
              onKeyDown={
                row.isSelf || !canCompare
                  ? undefined
                  : (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleCompare(row.user_id);
                      }
                    }
              }
              style={{ cursor: row.isSelf || !canCompare ? undefined : "pointer" }}
              bg={row.isSelf ? "var(--mantine-primary-color-light)" : undefined}
              leading={
                <Avatar src={avatarSrc} size={28} radius="sm">
                  <IconUser size={16} />
                </Avatar>
              }
              name={
                <>
                  <Text fz="sm" lineClamp={1} style={{ wordBreak: "break-word" }}>
                    {row.isSelf ? "我" : row.remark || row.username}
                  </Text>
                  <Text fz="xs" c="dimmed">
                    {dayjs(row.upload_time).format("YYYY-MM-DD")}
                  </Text>
                </>
              }
              trailing={
                !row.isSelf &&
                canCompare && (
                  <IconChevronDown
                    size={16}
                    color="gray"
                    style={{
                      flexShrink: 0,
                      transform: comparedUserId === row.user_id ? "rotate(180deg)" : undefined,
                    }}
                  />
                )
              }
            />

            {comparedUserId === row.user_id && canCompare && (
              <FriendScoreCompare
                game={game}
                mine={score}
                theirs={row}
                theirName={row.remark || row.username}
              />
            )}
          </Box>
        );
      })}
      <Text fz="xs" c="dimmed">
        {canCompare
          ? "※ 仅包含允许好友查看成绩的好友，点击任意好友可展开逐项对比。"
          : "※ 仅包含允许好友查看成绩的好友。"}
      </Text>
    </Stack>
  );
};
