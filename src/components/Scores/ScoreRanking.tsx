import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { fetchAPI } from "@/utils/api/api.ts";
import { openRetryModal } from "@/utils/modal.tsx";
import { useEffect, useState } from "react";
import { Badge, Center, Divider, Flex, Group, Loader, NumberFormatter, Paper, rem, Stack, Text } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";

interface RankingScoreProps {
  ranking: number;
  player_name?: string;
  achievements?: number;
  dx_score?: number;
  score?: number;
  upload_time: string;
}

export const ScoreRanking = ({ game, score }: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
}) => {
  const [rankingScores, setRankingScores] = useState<RankingScoreProps[]>([]);
  const [fetching, setFetching] = useState(false);

  const getPlayerScoreRanking = async (score: MaimaiScoreProps | ChunithmScoreProps) => {
    setFetching(true);
    try {
      const params = new URLSearchParams({
        song_id: `${score.id}`,
        level_index: `${score.level_index}`,
      });
      if (game === "maimai" && "achievements" in score) {
        params.append("song_type", `${score.type}`);
      }
      const res = await fetchAPI(`user/${game}/player/score/ranking?${params.toString()}`, {
        method: "GET",
      })
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setRankingScores(data.data || []);
    } catch (error) {
      openRetryModal("成绩排行获取失败", `${error}`, () => getPlayerScoreRanking(score))
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!score) return;

    getPlayerScoreRanking(score);
  }, [score]);

  if (fetching) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  if (!rankingScores || rankingScores.length === 0) {
    return (
      <Flex gap="xs" align="center" direction="column" c="dimmed">
        <IconDatabaseOff size={64} stroke={1.5} />
        <Text fz="sm">暂无排行数据</Text>
      </Flex>
    )
  }

  return (
    <Stack gap="xs">
      {rankingScores.map((rankingScore, index) => {
        let badgeColor: string;
        switch (rankingScore.ranking) {
          case 1:
            badgeColor = "yellow";
            break;
          case 2:
            badgeColor = "gray";
            break;
          case 3:
            badgeColor = "orange";
            break;
          default:
            badgeColor = "blue";
        }

        return (
          <>
            {rankingScore.ranking > 11 && (
              <Divider variant="dashed" labelPosition="center" label={`相差 ${rankingScore.ranking - rankingScores[index - 1].ranking} 名`} />
            )}
            <Paper key={index} radius="md" withBorder style={{
              position: rankingScore.ranking > 10 ? "sticky" : "static",
              padding: "6px 12px",
              bottom: "16px",
            }}>
              <Group>
                <Badge variant="light" color={badgeColor} circle={rankingScore.ranking < 100}>
                  {rankingScore.ranking}
                </Badge>
                <Text style={{ flex: 1 }}>
                  {rankingScore.player_name || "[已隐藏]"}
                </Text>
                {"achievements" in rankingScore && (
                  <Text fz={rem(18)} style={{ lineHeight: rem(18) }}>
                    {parseInt(String(rankingScore.achievements))}
                    <span style={{ fontSize: rem(14) }}>.{
                      (String(rankingScore.achievements).split(".")[1] || "0").padEnd(4, "0")
                    }%</span>
                  </Text>
                )}
                {"score" in rankingScore && (
                  <Text fz={rem(18)} style={{ lineHeight: rem(18) }}>
                    <NumberFormatter value={rankingScore.score || 0} thousandSeparator />
                  </Text>
                )}
              </Group>
            </Paper>
          </>
        );
      })}
      <Text fz="xs" c="dimmed">※ 该排行榜基于落雪咖啡屋 maimai DX 查分器数据，结果仅供参考。</Text>
    </Stack>
  );
}