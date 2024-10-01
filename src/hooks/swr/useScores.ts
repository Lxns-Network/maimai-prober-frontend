import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";

export const useScores = (game: Game) => {
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
