import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { Game } from "@/types/game";
import { CollectionProps } from "@/types/player";

export const usePlayerCollections = ({ game, type }: {
  game: Game;
  type: "trophies" | "icons" | "plates" | "frames" | "characters";
}) => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<CollectionProps[]>(`user/${game}/player/${type}`, fetcher);

  return {
    collections: data || [],
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
