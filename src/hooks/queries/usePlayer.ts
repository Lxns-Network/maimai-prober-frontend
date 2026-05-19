import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MaimaiPlayerProps, ChunithmPlayerProps } from "@/types/player";
import { Game } from "@/types/game";
import { queryKeys } from "./queryKeys.ts";
import { fetchAPI } from "@/utils/api/api.ts";
import { APIError } from "@/utils/errors.ts";

type PlayerData = MaimaiPlayerProps | ChunithmPlayerProps | null;

export const usePlayer = (game: Game) => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<PlayerData>({
    queryKey: queryKeys.player.root(game),
    queryFn: async ({ queryKey }) => {
      const url = queryKey[0] as string;
      const res = await fetchAPI(url, { method: "GET" });
      if (res.status === 404) return null;
      let data;
      try {
        data = await res.json();
      } catch {
        throw new APIError("服务器返回了无效的响应", { status: res.status });
      }
      if (!data.success) {
        throw new APIError(data.message, { status: res.status, code: data.code });
      }
      return data.data ?? null;
    },
    retry: false,
    staleTime: 30 * 1000,
  });

  return {
    player: data ?? undefined,
    isLoading,
    error,
    setData: (
      newData:
        | (MaimaiPlayerProps | ChunithmPlayerProps)
        | ((
            prev: (MaimaiPlayerProps | ChunithmPlayerProps) | undefined,
          ) => (MaimaiPlayerProps | ChunithmPlayerProps) | undefined),
    ) =>
      queryClient.setQueryData<PlayerData>(queryKeys.player.root(game), (prev) => {
        const prevValue = prev ?? undefined;
        return typeof newData === "function"
          ? ((
              newData as (
                p: MaimaiPlayerProps | ChunithmPlayerProps | undefined,
              ) => MaimaiPlayerProps | ChunithmPlayerProps | undefined
            )(prevValue) ?? null)
          : newData;
      }),
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.player.root(game) }),
  };
};
