/**
 * 按用户 ID 读取好友的成绩，缓存 1 分钟以免切换页签时反复加载。
 * 后端会对每一次实际请求重新检查好友关系；自己删除或拉黑好友时，相关缓存会随之失效。
 */
import { useQuery } from "@tanstack/react-query";
import {
  ChunithmBestsProps,
  ChunithmScoreProps,
  MaimaiBestsProps,
  MaimaiScoreProps,
} from "@/types/score";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

const emptyScores: (MaimaiScoreProps | ChunithmScoreProps)[] = [];

export const useFriendBests = (userId: number | undefined, game: Game) => {
  const { data, error, isLoading, refetch } = useQuery<MaimaiBestsProps | ChunithmBestsProps>({
    queryKey: queryKeys.friends.bests(userId ?? 0, game),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  return { bests: data, isLoading, error, refetch };
};

/** 按北京时间日期（YYYY-MM-DD）统计的上传条数。 */
export const useFriendHeatmap = (userId: number | undefined, game: Game) => {
  const { data, error, isLoading, refetch } = useQuery<Record<string, number>>({
    queryKey: queryKeys.friends.heatmap(userId ?? 0, game),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  return { heatmap: data, isLoading, error, refetch };
};

/** 某个北京时间日期上传的全部成绩记录，按上传时间倒序。 */
export const useFriendUploads = (userId: number | undefined, game: Game, date: string) => {
  const { data, error, isLoading, refetch } = useQuery<(MaimaiScoreProps | ChunithmScoreProps)[]>({
    queryKey: queryKeys.friends.uploads(userId ?? 0, game, date),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  return { uploads: data ?? emptyScores, isLoading, error, refetch };
};

export const useFriendScores = (userId: number | undefined, game: Game) => {
  const { data, error, isLoading, refetch } = useQuery<(MaimaiScoreProps | ChunithmScoreProps)[]>({
    queryKey: queryKeys.friends.scores(userId ?? 0, game),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  return { scores: data ?? emptyScores, isLoading, error, refetch };
};
