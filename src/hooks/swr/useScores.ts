import useSWR from "swr";
import { MaimaiScoreProps } from "@/components/Scores/maimai/Score.tsx";
import { ChunithmScoreProps } from "@/components/Scores/chunithm/Score.tsx";
import { fetcher } from "@/hooks/swr/fetcher.ts";

export const useScores = (game: string) => {
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
