import useSWR from "swr";
import { ChunithmBestsProps, MaimaiBestsProps } from "@/pages/user/Scores/bests/ScoreBestsSection.tsx";
import { fetcher } from "@/hooks/swr/fetcher.ts";

export const useBests = (game: string) => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<MaimaiBestsProps | ChunithmBestsProps>(`user/${game}/player/bests`, fetcher);

  return {
    bests: data,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
