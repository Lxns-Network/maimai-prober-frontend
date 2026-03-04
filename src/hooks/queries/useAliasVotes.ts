import { useQuery, useQueryClient } from "@tanstack/react-query";
import { VoteProps } from "@/types/alias";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

export const useAliasVotes = (game: Game) => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<VoteProps[]>({
    queryKey: queryKeys.alias.votes(game),
  });

  return {
    votes: data || [],
    isLoading,
    error,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.alias.votes(game) }),
  };
};
