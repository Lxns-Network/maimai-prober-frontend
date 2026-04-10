import { useQuery, useQueryClient } from "@tanstack/react-query";
import { OAuthAppProps } from "@/types/developer";
import { queryKeys } from "./queryKeys.ts";

const emptyApps: OAuthAppProps[] = [];

export const useUserOAuthApps = () => {
  const queryClient = useQueryClient();
  const { data, error, isLoading } = useQuery<OAuthAppProps[]>({
    queryKey: queryKeys.oauth.authorizeList(),
  });

  return {
    apps: data ?? emptyApps,
    isLoading,
    error,
    invalidate: () => queryClient.invalidateQueries({ queryKey: queryKeys.oauth.authorizeList() }),
  };
};
