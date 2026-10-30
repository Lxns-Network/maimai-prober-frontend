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

export const useFriendRecents = (userId: number | undefined, game: Game) => {
  const { data, error, isLoading, refetch } = useQuery<(MaimaiScoreProps | ChunithmScoreProps)[]>({
    queryKey: queryKeys.friends.recents(userId ?? 0, game),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  return { recents: data ?? emptyScores, isLoading, error, refetch };
};

export const useFriendScores = (userId: number | undefined, game: Game) => {
  const { data, error, isLoading, refetch } = useQuery<(MaimaiScoreProps | ChunithmScoreProps)[]>({
    queryKey: queryKeys.friends.scores(userId ?? 0, game),
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  return { scores: data ?? emptyScores, isLoading, error, refetch };
};
