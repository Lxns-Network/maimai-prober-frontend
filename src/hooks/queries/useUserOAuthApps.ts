import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OAuthAppProps } from "@/types/developer";
import { queryKeys } from "./queryKeys.ts";

export const useUserOAuthApps = () => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<OAuthAppProps[]>({
    queryKey: queryKeys.oauth.authorizeList(),
  });

  return {
    apps: data || [],
    isLoading,
    error,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.oauth.authorizeList() }),
  };
};
