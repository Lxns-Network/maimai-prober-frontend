import useSWR from "swr";
import { resourceFetcher } from "@/hooks/swr/fetcher.ts";
import { CollectionProps } from "@/types/player";
import { Game } from "@/types/game";

export const useCollectionList = (game: Game, collectionType: string | null, required: boolean = false) => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<{
    [key: string]: CollectionProps[];
  }>(collectionType ? `${game}/${collectionType}/list?required=${required}` : null, resourceFetcher);

  return {
    collections: data ? data[Object.keys(data)[0]] || [] : [],
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
