import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { usePlayer } from "./usePlayer.ts";
import { queryKeys } from "./queryKeys.ts";
import { useMemo } from "react";

interface RankingScoreProps {
  ranking: number;
  player_name?: string;
  achievements?: number;
  dx_score?: number;
  score?: number;
  upload_time: string;
}

export function buildScoreParams(game: Game, score: MaimaiScoreProps | ChunithmScoreProps) {
  const params = new URLSearchParams({
    song_id: `${score.id}`,
    level_index: `${score.level_index}`,
  });
  if (game === "maimai" && "achievements" in score) {
    params.append("song_type", `${score.type}`);
  }
  return params;
}

export const useScoreRanking = (game: Game, score: MaimaiScoreProps | ChunithmScoreProps | null) => {
  const { player } = usePlayer(game);
  const isLoggedOut = !localStorage.getItem("token");

  const params = useMemo(
    () => score ? buildScoreParams(game, score) : new URLSearchParams(),
    [game, score?.id, score?.level_index, score && "type" in score ? score.type : undefined],
  );

  const { data, error, isLoading } = useQuery<RankingScoreProps[]>({
    queryKey: queryKeys.scores.ranking(game, params),
    enabled: !!score && !!player && !isLoggedOut,
  });

  return {
    rankingScores: data || [],
    isLoading,
    error,
  };
};
