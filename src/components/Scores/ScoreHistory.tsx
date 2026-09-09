import { rankData } from "@/data/scoreRanks.ts";
import { MaimaiScoreHistory } from "./maimai/ScoreHistory.tsx";
import { ChunithmScoreHistory } from "./chunithm/ScoreHistory.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";
import { Center, Loader } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";
import { EmptyState } from "@/components/EmptyState.tsx";
import { useScoreHistory } from "@/hooks/queries/useScoreHistory.ts";

export const ScoreHistory = ({
  game,
  score,
  minRank,
}: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  minRank: string;
}) => {
  const isLoggedOut = !localStorage.getItem("token");
  const { historyScores, isLoading } = useScoreHistory(game, score);

  if (isLoggedOut) {
    return (
      <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title="请登录后查看历史记录" />
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
      {game === "maimai" ? (
        <MaimaiScoreHistory
          scores={historyScores as MaimaiScoreProps[]}
          minAchievements={rankData.maimai[minRank as keyof typeof rankData.maimai]}
        />
      ) : (
        <ChunithmScoreHistory
          scores={historyScores as ChunithmScoreProps[]}
          minScore={rankData.chunithm[minRank as keyof typeof rankData.chunithm]}
        />
      )}
    </>
  );
};
