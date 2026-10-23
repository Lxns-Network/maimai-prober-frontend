import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OAuthAppProps } from "@/types/developer";
import { queryKeys } from "./queryKeys.ts";

const emptyApps: OAuthAppProps[] = [];

export const useAdminOAuthApps = () => {
  const queryClient = useQueryClient();
  const { data, error, isLoading, refetch } = useQuery<OAuthAppProps[]>({
    queryKey: queryKeys.oauth.adminApps(),
  });

  return {
    apps: data ?? emptyApps,
    isLoading,
    error,
    refetch,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.oauth.adminApps() }),
  };
};
