import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

export type PopularRangeKey = "week" | "month";

export interface PopularSong {
  id: number;
  title: string;
  artist: string;
  rank: number;
  /** 上一周期（等长滚动窗口）内的名次，null 表示新上榜。 */
  previous_rank: number | null;
  /** 当前周期内游玩最多的谱面。 */
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

/** 首页热门曲目榜。后端按小时基于已同步的游玩记录重算快照，无需登录。 */
export const usePopularSongs = (game: Game, range: PopularRangeKey) => {
  // isPending（而非 isLoading）让 SSG 首屏与水合后首次请求期间都渲染骨架屏。
  const { data, isPending } = useQuery<PopularSongsData>({
    queryKey: queryKeys.song.popular(game, range),
    staleTime: 5 * 60 * 1000,
  });

  return {
    popular: data,
    isPending,
  };
};
