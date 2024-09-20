import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { MaimaiPlayerProps, ChunithmPlayerProps } from "@/types/player";

export const usePlayer = (game: "maimai" | "chunithm") => {
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
