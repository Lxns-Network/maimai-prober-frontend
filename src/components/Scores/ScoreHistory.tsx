import { MaimaiScoreHistory } from "./maimai/ScoreHistory.tsx";
import { ChunithmScoreHistory } from "./chunithm/ScoreHistory.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";
import { Center, Flex, Loader, Text } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";
import { useScoreHistory } from "@/hooks/queries/useScoreHistory.ts";

export const rankData = {
  maimai: {
    "SSS+": 100.5,
    "SSS": 100,
    "SS+": 99.5,
    "SS": 99,
    "S+": 98,
    "S": 97,
    "AAA": 94,
    "AA": 90,
    "A": 80,
  },
  chunithm: {
    "SSS+": 1009000,
    "SSS": 1007500,
    "SS+": 1005000,
    "SS": 1000000,
    "S+": 990000,
    "S": 975000,
    "AAA": 950000,
    "AA": 925000,
    "A": 900000,
  }
};

export const ScoreHistory = ({ game, score, minRank }: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  minRank: string;
}) => {
  const isLoggedOut = !localStorage.getItem("token");
  const { historyScores, isLoading } = useScoreHistory(game, score);

  if (isLoggedOut) {
    return (
      <Flex gap="xs" align="center" direction="column" c="dimmed">
        <IconDatabaseOff size={64} stroke={1.5} />
        <Text fz="sm">请登录后查看历史记录</Text>
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

  return (
    <>
      {(game === "maimai" ?
        <MaimaiScoreHistory
          scores={historyScores as MaimaiScoreProps[]}
          minAchievements={rankData.maimai[minRank as keyof typeof rankData.maimai]}
        /> :
        <ChunithmScoreHistory
          scores={historyScores as ChunithmScoreProps[]}
          minScore={rankData.chunithm[minRank as keyof typeof rankData.chunithm]}
        />
      )}
    </>
  )
}
