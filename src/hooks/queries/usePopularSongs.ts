import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

export type PopularRangeKey = "week" | "month";

export interface PopularSong {
  id: number;
  title: string;
  artist: string;
  rank: number;
  previous_rank: number | null;
  type: string;
  level_index: number;
  level: string;
}

export interface PopularSongsData {
  range: PopularRangeKey;
  period_start: string;
  period_end: string;
  updated_at: string;
  songs: PopularSong[];
}

export const popularRangeOptions: { value: PopularRangeKey; label: string }[] = [
  { value: "week", label: "近 7 天" },
  { value: "month", label: "近 30 天" },
];

export const usePopularSongs = (game: Game, range: PopularRangeKey) => {
  const { data, isPending } = useQuery<PopularSongsData>({
    queryKey: queryKeys.song.popular(game, range),
    staleTime: 5 * 60 * 1000,
  });

  return {
    popular: data,
    isPending,
  };
};
