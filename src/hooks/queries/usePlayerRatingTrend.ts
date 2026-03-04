import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { MaimaiRatingTrendProps } from "@/components/Profile/PlayerPanel/maimai/RatingTrend.tsx";
import { ChunithmRatingTrendProps } from "@/components/Profile/PlayerPanel/chunithm/RatingTrend.tsx";
import { queryKeys } from "./queryKeys.ts";

export const usePlayerRatingTrend = (game: Game, version: number) => {
  const { data, error, isLoading } = useQuery<(MaimaiRatingTrendProps | ChunithmRatingTrendProps)[]>({
    queryKey: queryKeys.player.ratingTrend(game, version),
    enabled: version > 0,
    staleTime: 5 * 60 * 1000,
  });

  return {
    trend: data || [],
    isLoading,
    error,
  };
};
