import { useQuery } from "@tanstack/react-query";
import { CollectionProps } from "@/types/player";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";
import { resourceQueryFn } from "./queryFn.ts";

export const useCollectionList = (game: Game, collectionType: string | null, required: boolean = false) => {
  const { data, error, isLoading } = useQuery<{
    [key: string]: CollectionProps[];
  }>({
    queryKey: queryKeys.collections.list(game, collectionType || "", required),
    queryFn: resourceQueryFn,
    enabled: !!collectionType,
  });

  return {
    collections: data ? data[Object.keys(data)[0]] || [] : [],
    isLoading,
    error,
  };
};
