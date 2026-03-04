import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { queryKeys } from "./queryKeys.ts";
import { resourceQueryFn } from "./queryFn.ts";

export const useSongDetail = (game: Game, songId: number | null) => {
  const { data, error, isLoading } = useQuery<MaimaiSongProps | ChunithmSongProps>({
    queryKey: queryKeys.song.detail(game, songId ?? 0),
    queryFn: resourceQueryFn,
    enabled: songId !== null,
  });

  return {
    songDetail: data ?? null,
    isLoading,
    error,
  };
};
