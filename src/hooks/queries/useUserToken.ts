import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSentryUser, isTokenExpired, isTokenUndefined } from "@/utils/session.ts";
import * as Sentry from "@sentry/react";
import { queryKeys } from "./queryKeys.ts";
import { refreshAccessToken, TOKEN_REFRESH_BUFFER_MS } from "@/utils/api/api.ts";

export const useUserToken = () => {
  const { data, error, refetch } = useQuery<{ token: string }>({
    queryKey: queryKeys.user.refresh(),
    queryFn: refreshAccessToken,
    enabled: () => !isTokenUndefined() && isTokenExpired(TOKEN_REFRESH_BUFFER_MS),
    retry: false,
  });

  useEffect(() => {
    if (data?.token) {
      Sentry.setUser(getSentryUser());
    }
  }, [data?.token]);

  return {
    error: isTokenExpired() ? error : null,
    refetch,
  };
};
