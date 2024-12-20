import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { isTokenExpired, isTokenUndefined } from "@/utils/session.ts";

export const useUserToken = () => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR(`user/refresh`, fetcher);

  if (isTokenUndefined()) {
    return {
      token: "",
      isLoading: false,
      error: null,
      mutate: () => {},
    };
  }

  if (!isTokenExpired()) {
    return {
      token: localStorage.getItem("token") || "",
      isLoading: false,
      error: null,
      mutate: () => {},
    };
  }

  if (data) {
    localStorage.setItem("token", data.token);
  }

  return {
    token: data ? data.token : "",
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
