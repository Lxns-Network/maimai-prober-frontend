import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { OAuthAppProps } from "@/types/developer";

export const useUserOAuthApps = () => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<OAuthAppProps[]>(`user/oauth/authorize/list`, fetcher);

  return {
    apps: data || [],
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
