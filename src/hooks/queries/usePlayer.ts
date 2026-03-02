import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaimaiPlayerProps, ChunithmPlayerProps } from "@/types/player";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

export const usePlayer = (game: Game) => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<MaimaiPlayerProps | ChunithmPlayerProps>({
    queryKey: queryKeys.player.root(game),
  });

  return {
    player: data,
    isLoading,
    error,
    setData: (newData: (MaimaiPlayerProps | ChunithmPlayerProps) | ((prev: (MaimaiPlayerProps | ChunithmPlayerProps) | undefined) => (MaimaiPlayerProps | ChunithmPlayerProps) | undefined)) =>
      queryClient.setQueryData<MaimaiPlayerProps | ChunithmPlayerProps>(queryKeys.player.root(game), newData),
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.player.root(game) }),
  };
};
