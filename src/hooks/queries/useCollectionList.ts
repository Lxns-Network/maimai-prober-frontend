import { useMemo } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { CollectionProps } from "@/types/player";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";
import { resourceQueryFn } from "./queryFn.ts";

type CollectionListResponse = { [key: string]: CollectionProps[] };

const emptyCollections: CollectionProps[] = [];

const unwrapCollections = (data?: CollectionListResponse) =>
  data ? (data[Object.keys(data)[0]] ?? emptyCollections) : emptyCollections;

export const useCollectionList = (
  game: Game,
  collectionType: string | null,
  required: boolean = false,
) => {
  const { data, error, isLoading } = useQuery<CollectionListResponse>({
    queryKey: queryKeys.collections.list(game, collectionType || "", required),
    queryFn: resourceQueryFn,
    enabled: !!collectionType,
  });

  const collections = useMemo(() => unwrapCollections(data), [data]);

  return {
    collections,
    isLoading,
    error,
  };
};

const combineCollectionLists = (results: UseQueryResult<CollectionListResponse>[]) => ({
  lists: results.map((result) => unwrapCollections(result.data)),
  isLoading: results.some((result) => result.isLoading),
});

/** 按 `collectionTypes` 顺序返回各类型的收藏品列表（不含要求曲目），与 {@link useCollectionList} 共用缓存。 */
export const useCollectionLists = (game: Game, collectionTypes: string[], enabled: boolean) =>
  useQueries({
    queries: collectionTypes.map((collectionType) => ({
      queryKey: queryKeys.collections.list(game, collectionType, false),
      queryFn: resourceQueryFn<CollectionListResponse>,
      enabled,
    })),
    combine: combineCollectionLists,
  });
