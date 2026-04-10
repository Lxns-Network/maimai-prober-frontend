import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { queryKeys } from "./queryKeys.ts";
import { buildScoreParams } from "./useScoreRanking.ts";
import { useMemo } from "react";

const emptyHistoryScores: (MaimaiScoreProps | ChunithmScoreProps)[] = [];

function hasNegativeScore(game: Game, score: MaimaiScoreProps | ChunithmScoreProps) {
  return (game === "maimai" && "achievements" in score && score.achievements < 0) ||
    (game === "chunithm" && "score" in score && score.score < 0);
}

function sortByTime(scores: (MaimaiScoreProps | ChunithmScoreProps)[]) {
  return [...scores].sort((a, b) => {
    const uploadTimeDiff = new Date(a.upload_time).getTime() - new Date(b.upload_time).getTime();
    if (uploadTimeDiff === 0 && a.play_time && b.play_time) {
      return new Date(a.play_time).getTime() - new Date(b.play_time).getTime();
    }
    return uploadTimeDiff;
  });
}

export const useScoreHistory = (game: Game, score: MaimaiScoreProps | ChunithmScoreProps | null) => {
  const isLoggedOut = !localStorage.getItem("token");
  const isNegative = score ? hasNegativeScore(game, score) : false;

  const params = useMemo(
    () => score ? buildScoreParams(game, score) : new URLSearchParams(),
    [game, score?.id, score?.level_index, score && "type" in score ? score.type : undefined],
  );

  const { data, error, isLoading } = useQuery<(MaimaiScoreProps | ChunithmScoreProps)[]>({
    queryKey: queryKeys.scores.history(game, params),
    enabled: !!score && !isLoggedOut && !isNegative,
    select: sortByTime,
  });

  return {
    historyScores: data ?? emptyHistoryScores,
    isLoading,
    error,
  };
};
