import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { VoteProps } from "@/types/alias";
import { Game } from "@/types/game";

export const useAliasVotes = (game: Game) => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<VoteProps[]>(`user/${game}/alias/votes`, fetcher);

  return {
    votes: data || [],
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
