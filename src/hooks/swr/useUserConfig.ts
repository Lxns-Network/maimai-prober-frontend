import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { ConfigProps } from "@/types/user";
import { Game } from "@/types/game";

export const useUserConfig = (game: Game) => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<ConfigProps>(`user/${game}/config`, fetcher);

  return {
    config: data,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
