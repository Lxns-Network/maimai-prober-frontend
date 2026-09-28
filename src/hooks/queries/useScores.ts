import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";
import { usePlayer } from "./usePlayer.ts";
import { queryKeys } from "./queryKeys.ts";

type ScoreByGame = {
  maimai: MaimaiScoreProps;
  chunithm: ChunithmScoreProps;
};

const emptyScores: never[] = [];

export const useScores = <G extends Game>(game: G) => {
  const { player } = usePlayer(game);
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery<ScoreByGame[G][]>({
    queryKey: queryKeys.player.scores(game),
    enabled: !!player,
  });

  return {
    scores: data ?? emptyScores,
    isLoading,
    error,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.player.scores(game) }),
  };
};
