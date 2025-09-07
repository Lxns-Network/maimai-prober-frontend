import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { Game } from "@/types/game";

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
    avatar_id: number;
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
  const { data, error, isLoading, mutate } = useSWR<Comment[]>(
    params ? [`user/${game}/comment/list?${new URLSearchParams(params).toString()}`] : null,
    fetcher
  );

  return {
    comments: data || [],
    isLoading,
    error,
    mutate,
  };
};
