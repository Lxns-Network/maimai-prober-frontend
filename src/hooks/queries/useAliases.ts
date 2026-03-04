import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AliasListProps } from "@/types/alias";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

export const useAliases = (game: Game, page: number, approved: boolean = false, sort: string = "alias_id", order: string = "desc", songId: number = 0) => {
  const queryClient = useQueryClient();
  const params = new URLSearchParams({
    page: String(page),
    sort: `${sort} ${order}`,
    approved: String(approved)
  });

  if (songId !== 0) {
    params.append("song_id", String(songId));
  }

  const key = queryKeys.alias.list(game, params);

  const { data, error, isLoading } = useQuery<AliasListProps>({
    queryKey: key,
    placeholderData: keepPreviousData,
  });

  return {
    aliases: data?.aliases || [],
    pageCount: data?.page_count || 0,
    pageSize: data?.page_size || 0,
    isLoading,
    error,
    setData: (newData: AliasListProps) => queryClient.setQueryData<AliasListProps>(key, newData),
    invalidate: () => queryClient.invalidateQueries({ queryKey: key }),
  };
};
