import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSentryUser, isTokenExpired, isTokenUndefined } from "@/utils/session.ts";
import * as Sentry from "@sentry/react";
import { queryKeys } from "./queryKeys.ts";
import { refreshAccessToken } from "@/utils/api/api.ts";

export const useUserToken = () => {
  const shouldFetch = !isTokenUndefined();

  const { data, error, refetch } = useQuery<{ token: string }>({
    queryKey: queryKeys.user.refresh(),
    queryFn: refreshAccessToken,
    enabled: shouldFetch,
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
