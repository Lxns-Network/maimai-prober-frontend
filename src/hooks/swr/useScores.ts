import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";

export const useScores = (game: "maimai" | "chunithm") => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<(MaimaiScoreProps | ChunithmScoreProps)[]>(`user/${game}/player/scores`, fetcher);

  return {
    scores: data || [],
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
