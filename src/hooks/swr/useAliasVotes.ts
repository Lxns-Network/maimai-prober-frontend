import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { VoteProps } from "@/types/alias";

export const useAliasVotes = (game: "maimai" | "chunithm") => {
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
