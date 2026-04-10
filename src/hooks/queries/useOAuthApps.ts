import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OAuthAppProps } from "@/types/developer";
import { queryKeys } from "./queryKeys.ts";

const emptyApps: OAuthAppProps[] = [];

export const useOAuthApps = () => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<OAuthAppProps[]>({
    queryKey: queryKeys.developer.oauthApps(),
  });

  return {
    apps: data ?? emptyApps,
    isLoading,
    error,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.developer.oauthApps() }),
  };
};
