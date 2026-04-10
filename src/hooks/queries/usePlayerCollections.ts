import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { CollectionProps } from "@/types/player";
import { queryKeys } from "./queryKeys.ts";

const emptyCollections: CollectionProps[] = [];

export const usePlayerCollections = ({ game, type }: {
  game: Game;
  type: "trophies" | "icons" | "plates" | "frames" | "characters";
}) => {
  const { data, error, isLoading } = useQuery<CollectionProps[]>({
    queryKey: queryKeys.player.collections(game, type),
  });

  return {
    collections: data ?? emptyCollections,
    isLoading,
    error,
  };
};
