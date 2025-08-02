import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { OAuthAppProps } from "@/types/developer";

export const useOAuthApps = () => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<OAuthAppProps[]>(`user/developer/oauth/apps`, fetcher);

  return {
    apps: data || [],
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
