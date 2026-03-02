import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ConfigProps } from "@/types/user";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

export const useUserConfig = (game: Game) => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<ConfigProps>({
    queryKey: queryKeys.config.user(game),
  });

  return {
    config: data,
    isLoading,
    error,
    setData: (newConfig: ConfigProps) =>
      queryClient.setQueryData<ConfigProps>(queryKeys.config.user(game), newConfig),
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.config.user(game) }),
  };
};
