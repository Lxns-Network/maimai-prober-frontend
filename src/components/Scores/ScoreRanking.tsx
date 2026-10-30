import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Center, Divider, Loader, Stack, Text } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";
import { EmptyState } from "@/components/EmptyState.tsx";
import { usePlayer } from "@/hooks/queries/usePlayer.ts";
import { useScoreRanking } from "@/hooks/queries/useScoreRanking.ts";
import { RankingRow } from "./RankingRow.tsx";

export const ScoreRanking = ({
  game,
  score,
}: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
}) => {
  const isLoggedOut = !localStorage.getItem("token");
  const { player } = usePlayer(game);
  const { rankingScores, isLoading } = useScoreRanking(game, score);

  if (isLoggedOut || !player) {
    return (
      <EmptyState
        icon={<IconDatabaseOff size={64} stroke={1.5} />}
        title={isLoggedOut ? "请登录后查看排行" : "请同步游戏数据后查看排行"}
      />
    );
  }

  if (!score || isLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  if (!rankingScores || rankingScores.length === 0) {
    return <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title="暂无排行数据" />;
  }

  return (
    <Stack gap="xs">
      {rankingScores.map((rankingScore, index) => (
        <div
          key={`${game}:${score.id}:${"type" in score && score.type}:${score.level_index}:${index}`}
        >
          {rankingScore.ranking > 11 && (
            <Divider
              variant="dashed"
              labelPosition="center"
              label={`相差 ${rankingScore.ranking - rankingScores[index - 1].ranking} 名`}
              mb="xs"
            />
          )}
          <RankingRow
            rank={rankingScore.ranking}
            achievements={rankingScore.achievements}
            score={rankingScore.score}
            highlighted={rankingScore.is_self}
            pos={rankingScore.ranking > 10 ? "sticky" : undefined}
            bottom={16}
            name={
              <Text lineClamp={1} c={rankingScore.player_name ? undefined : "dimmed"}>
                {rankingScore.player_name || "[已隐藏]"}
              </Text>
            }
          />
        </div>
      ))}
      <Text fz="xs" c="dimmed">
        ※ 该排行榜基于落雪咖啡屋 maimai DX 查分器数据，结果仅供参考。
      </Text>
    </Stack>
  );
};
