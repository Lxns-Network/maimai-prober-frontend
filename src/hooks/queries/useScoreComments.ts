import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

export interface Comment {
  comment_id: number;
  comment?: string;
  rating?: number;
  is_liked: boolean;
  like_count: number;
  upload_time: string;
  uploader: {
    id: number;
    name: string;
    avatar_id?: number;
  }
}

interface UseScoreCommentsOptions {
  game: Game;
  params?: {
    song_id: string;
    song_type?: string;
    level_index: string;
  }
}

export const useScoreComments = ({ game, params }: UseScoreCommentsOptions) => {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(params as Record<string, string> | undefined);
  const key = queryKeys.comments.list(game, urlParams);

  const { data, error, isLoading } = useQuery<Comment[]>({
    queryKey: key,
    enabled: !!params,
  });

  return {
    comments: data || [],
    isLoading,
    error,
    setData: (newData: Comment[] | ((prev: Comment[] | undefined) => Comment[] | undefined)) =>
      queryClient.setQueryData<Comment[]>(key, newData),
    invalidate: () => queryClient.invalidateQueries({ queryKey: key }),
  };
};
