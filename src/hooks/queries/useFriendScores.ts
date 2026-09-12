/**
 * 好友维度的成绩读取，路径以好友的 user_id 为键（后端好友资料刻意不下发游戏内好友码）。
 * 三个 hook 自身不判断可见性：`enabled` 由调用方按 `friend.games[game].scores_visible` 传入，
 * 为不可见的好友发请求必定得到 403。
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

export const useFriendBests = (userId: number | undefined, game: Game, enabled: boolean) => {
  const { data, error, isLoading } = useQuery<MaimaiBestsProps | ChunithmBestsProps>({
    queryKey: queryKeys.friends.bests(userId ?? 0, game),
    enabled: enabled && !!userId,
    staleTime: 60 * 1000,
  });

  return { bests: data, isLoading, error };
};

export const useFriendRecents = (userId: number | undefined, game: Game, enabled: boolean) => {
  const { data, error, isLoading } = useQuery<(MaimaiScoreProps | ChunithmScoreProps)[]>({
    queryKey: queryKeys.friends.recents(userId ?? 0, game),
    enabled: enabled && !!userId,
    staleTime: 60 * 1000,
  });

  return { recents: data ?? emptyScores, isLoading, error };
};

export const useFriendScores = (userId: number | undefined, game: Game, enabled: boolean) => {
  const { data, error, isLoading } = useQuery<(MaimaiScoreProps | ChunithmScoreProps)[]>({
    queryKey: queryKeys.friends.scores(userId ?? 0, game),
    enabled: enabled && !!userId,
    staleTime: 60 * 1000,
  });

  return { scores: data ?? emptyScores, isLoading, error };
};
