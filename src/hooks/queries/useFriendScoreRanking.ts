import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { queryKeys } from "./queryKeys.ts";
import { buildScoreParams } from "./useScoreRanking.ts";

export interface FriendRankingScoreProps {
  user_id: number;
  username: string;
  remark?: string;
  icon_id?: number;
  character_id?: number;
  achievements?: number;
  dx_score?: number;
  dx_star?: number;
  rate?: string;
  fc?: string;
  fs?: string;
  score?: number;
  rank?: string;
  clear?: string;
  full_combo?: string;
  full_chain?: string;
  over_power?: number;
  upload_time: string;
}

const emptyRanking: FriendRankingScoreProps[] = [];

/**
 * 单谱面上的好友成绩，只包含允许好友查看成绩的那些好友。
 * 自己的成绩不由该接口返回，调用方用手上的本人成绩自行并入排序。
 */
export const useFriendScoreRanking = (
  game: Game,
  score: MaimaiScoreProps | ChunithmScoreProps | null,
) => {
  const isLoggedOut = typeof window === "undefined" || !localStorage.getItem("token");

  const params = score ? buildScoreParams(game, score) : new URLSearchParams();

  const { data, error, isLoading } = useQuery<FriendRankingScoreProps[]>({
    queryKey: queryKeys.friends.ranking(game, params),
    enabled: !!score && !isLoggedOut,
  });

  return { friendScores: data ?? emptyRanking, isLoading, error };
};
