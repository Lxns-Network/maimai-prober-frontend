import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSentryUser, isTokenExpired, isTokenUndefined } from "@/utils/session.ts";
import * as Sentry from "@sentry/react";
import { queryKeys } from "./queryKeys.ts";

export const useUserToken = () => {
  const shouldFetch = !isTokenUndefined();

  const { data, error, isLoading, refetch } = useQuery<{ token: string }>({
    queryKey: queryKeys.user.refresh(),
    enabled: shouldFetch,
  });

  useEffect(() => {
    if (data?.token) {
      localStorage.setItem("token", data.token);
      Sentry.setUser(getSentryUser());
    }
  }, [data?.token]);

  if (!isTokenExpired()) {
    return {
      token: localStorage.getItem("token") || "",
      isLoading: false,
      error: null,
      refetch: () => {},
    };
  }

  return {
    token: data?.token || "",
    isLoading,
    error,
    refetch,
  };
};
