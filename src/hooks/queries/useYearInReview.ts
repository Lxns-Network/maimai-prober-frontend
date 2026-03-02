import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";
import { APIError } from "@/utils/errors.ts";
import { queryKeys } from "./queryKeys.ts";

export const useYearInReview = (game: Game, year: number, shareToken?: string, agree?: boolean) => {
  const { data, error, isLoading } = useQuery<YearInReviewProps>({
    queryKey: queryKeys.player.yearInReview(game, year, shareToken, agree),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.status === 400) return false;
      return failureCount < 3;
    },
  });

  return {
    data,
    isLoading,
    error,
  };
};
