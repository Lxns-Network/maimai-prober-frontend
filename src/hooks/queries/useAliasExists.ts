import { useQuery } from "@tanstack/react-query";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";

export const useAliasExists = (
  game: Game,
  songId: number | null,
  alias: string,
  enabled: boolean,
) => {
  const { data, isFetching } = useQuery<{ exists: boolean }>({
    queryKey: queryKeys.alias.exists(game, songId ?? 0, alias),
    enabled: enabled && songId !== null && alias.length > 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

  return {
    exists: data?.exists ?? false,
    checking: isFetching,
  };
};
