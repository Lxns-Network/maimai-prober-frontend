import { useQuery } from "@tanstack/react-query";
import { OAuthAppProps } from "@/types/developer";
import { APIError } from "@/utils/errors.ts";
import { queryKeys } from "./queryKeys.ts";

export const useOAuthApp = (params: URLSearchParams) => {
  const { data, error, isLoading } = useQuery<OAuthAppProps>({
    queryKey: queryKeys.oauth.authorizeInfo(params),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: (failureCount, error) => {
      if (error instanceof APIError && error.status === 400) return false;
      return failureCount < 3;
    },
  });

  return {
    app: data,
    isLoading,
    error,
  };
};
