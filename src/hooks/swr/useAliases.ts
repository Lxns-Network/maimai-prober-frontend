import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { AliasListProps } from "@/types/alias";

export const useAliases = (game: "maimai" | "chunithm", page: number, approved: boolean = false, sort: string = "alias_id", order: string = "desc", songId: number = 0) => {
  const params = new URLSearchParams({
    page: String(page),
    sort: `${sort} ${order}`,
    approved: String(approved)
  });

  if (songId !== 0) {
    params.append("song_id", String(songId));
  }

  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<AliasListProps>(`user/${game}/alias/list?${params.toString()}`, fetcher);

  return {
    aliases: data ? data.aliases : [],
    pageCount: data ? data.page_count : 0,
    pageSize: data ? data.page_size : 0,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
