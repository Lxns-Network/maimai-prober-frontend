import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getAuthToken,
  getSentryUser,
  isTokenExpired,
  subscribeAuthSession,
} from "@/utils/session.ts";
import * as Sentry from "@sentry/react";
import { queryKeys } from "./queryKeys.ts";
import { refreshAuthToken } from "@/utils/api/api.ts";
import { getTokenSessionIdentity, isTokenSessionExpired } from "@/utils/sessionCore.ts";

export const useUserToken = () => {
  const token = useSyncExternalStore(subscribeAuthSession, getAuthToken, () => null);
  const identity = getTokenSessionIdentity(token);
  const shouldRefresh = Boolean(token) && isTokenSessionExpired(token);

  const { error, isFetching, refetch } = useQuery({
    queryKey: queryKeys.user.refresh(identity),
    queryFn: async () => {
      await refreshAuthToken();
      return true;
    },
    enabled: shouldRefresh,
  });

  useEffect(() => {
    if (token && !isTokenExpired()) Sentry.setUser(getSentryUser());
  }, [token]);

  return {
    token: token || "",
    isLoading: shouldRefresh && isFetching,
    error: token && !shouldRefresh ? null : error,
    refetch,
  };
};
