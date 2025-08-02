import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { OAuthAppProps } from "@/types/developer";

export const useOAuthApps = (params: URLSearchParams) => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<OAuthAppProps>(`user/oauth/authorize/info?${params.toString()}`, fetcher, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    onErrorRetry: (error) => {
      if (error.status === 400) return;
    }
  });

  return {
    app: data,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
