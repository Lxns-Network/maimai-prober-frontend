import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { ChunithmBestsProps, MaimaiBestsProps } from "@/types/score";

export const useBests = (game: "maimai" | "chunithm") => {
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
