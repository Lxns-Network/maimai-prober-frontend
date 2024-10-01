import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { MaimaiPlayerProps, ChunithmPlayerProps } from "@/types/player";
import { Game } from "@/types/game";

export const usePlayer = (game: Game) => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<MaimaiPlayerProps | ChunithmPlayerProps>(`user/${game}/player`, fetcher);

  return {
    player: data,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
