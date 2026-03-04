import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { usePlayer } from "./usePlayer.ts";
import { queryKeys } from "./queryKeys.ts";

export const usePlayerHeatmap = (game: Game) => {
  const { player } = usePlayer(game);

  const { data, error, isLoading } = useQuery<Record<string, number>>({
    queryKey: queryKeys.player.heatmap(game),
    enabled: !!player,
    staleTime: 5 * 60 * 1000,
  });

  return {
    heatmap: data,
    isLoading,
    error,
  };
};
