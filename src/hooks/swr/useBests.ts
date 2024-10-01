import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { ChunithmBestsProps, MaimaiBestsProps } from "@/types/score";
import { Game } from "@/types/game";

export const useBests = (game: Game) => {
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
