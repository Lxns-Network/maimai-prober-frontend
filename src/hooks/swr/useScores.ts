import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";
import { usePlayer } from "@/hooks/swr/usePlayer.ts";

export const useScores = (game: Game) => {
  const { player } = usePlayer(game);

  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<(MaimaiScoreProps | ChunithmScoreProps)[]>(
    player ? `user/${game}/player/scores` : null,
    fetcher
  );

  return {
    scores: data || [],
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
