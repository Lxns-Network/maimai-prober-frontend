import { useQuery } from "@tanstack/react-query";
import { ChunithmBestsProps, MaimaiBestsProps } from "@/types/score";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

export const useBests = (game: Game) => {
  const { data, error, isLoading } = useQuery<MaimaiBestsProps | ChunithmBestsProps>({
    queryKey: queryKeys.player.bests(game),
  });

  return {
    bests: data,
    isLoading,
    error,
  };
};
