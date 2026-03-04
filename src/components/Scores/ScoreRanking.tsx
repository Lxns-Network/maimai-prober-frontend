import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Badge, Center, Divider, Flex, Group, Loader, NumberFormatter, Paper, rem, Stack, Text } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";
import { usePlayer } from "@/hooks/queries/usePlayer.ts";
import { useScoreRanking } from "@/hooks/queries/useScoreRanking.ts";

export const ScoreRanking = ({ game, score }: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
}) => {
  const isLoggedOut = !localStorage.getItem("token");
  const { player } = usePlayer(game);
  const { rankingScores, isLoading } = useScoreRanking(game, score);

  if (isLoggedOut || !player) {
    return (
      <Flex gap="xs" align="center" direction="column" c="dimmed">
        <IconDatabaseOff size={64} stroke={1.5} />
        <Text fz="sm">{isLoggedOut ? "请登录后查看排行" : "请同步游戏数据后查看排行"}</Text>
      </Flex>
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
          <div key={`${game}:${score.id}:${"type" in score && score.type}:${score.level_index}:${index}`}>
            {rankingScore.ranking > 11 && (
              <Divider
                variant="dashed"
                labelPosition="center"
                label={`相差 ${rankingScore.ranking - rankingScores[index - 1].ranking} 名`}
                mb="xs"
              />
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
          </div>
        );
      })}
      <Text fz="xs" c="dimmed">※ 该排行榜基于落雪咖啡屋 maimai DX 查分器数据，结果仅供参考。</Text>
    </Stack>
  );
}
