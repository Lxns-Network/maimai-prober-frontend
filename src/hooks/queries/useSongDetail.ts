import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { queryKeys } from "./queryKeys.ts";
import { resourceQueryFn } from "./queryFn.ts";

type SongByGame = {
  maimai: MaimaiSongProps;
  chunithm: ChunithmSongProps;
};

export const useSongDetail = <G extends Game>(game: G, songId: number | null) => {
  const { data, error, isLoading } = useQuery<SongByGame[G]>({
    queryKey: queryKeys.song.detail(game, songId ?? 0),
    queryFn: resourceQueryFn,
    enabled: songId !== null,
  });

  const songDetail: SongByGame[G] | null = data ?? null;

  return {
    songDetail,
    isLoading,
    error,
  };
};
