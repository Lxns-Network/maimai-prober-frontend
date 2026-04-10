import { useQuery, useQueryClient } from "@tanstack/react-query";
import { VoteProps } from "@/types/alias";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

const emptyVotes: VoteProps[] = [];

export const useAliasVotes = (game: Game) => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<VoteProps[]>({
    queryKey: queryKeys.alias.votes(game),
  });

  return {
    votes: data ?? emptyVotes,
    isLoading,
    error,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.alias.votes(game) }),
  };
};
