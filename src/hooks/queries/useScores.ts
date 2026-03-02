import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";
import { usePlayer } from "./usePlayer.ts";
import { queryKeys } from "./queryKeys.ts";

export const useScores = (game: Game) => {
  const { player } = usePlayer(game);
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery<(MaimaiScoreProps | ChunithmScoreProps)[]>({
    queryKey: queryKeys.player.scores(game),
    enabled: !!player,
  });

  return {
    scores: data || [],
    isLoading,
    error,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.player.scores(game) }),
  };
};
