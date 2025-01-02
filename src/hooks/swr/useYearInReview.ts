import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { Game } from "@/types/game";
import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";

export const useYearInReview = (game: Game, year: number, shareToken?: string, agree?: boolean) => {
  let url;
  if (shareToken) {
    url = `${game}/year-in-review/${year}/share/${shareToken}`;
  } else {
    url = `user/${game}/player/year-in-review/${year}`
  }
  if (agree) {
    url += "?agree=true";
  }
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<YearInReviewProps>(url, fetcher, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    onErrorRetry: (error) => {
      if (error.status === 400) return;
    }
  });

  return {
    data: data,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
