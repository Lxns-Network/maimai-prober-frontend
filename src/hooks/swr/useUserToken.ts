import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { isTokenExpired, isTokenUndefined } from "@/utils/session.ts";

export const useUserToken = () => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR(!isTokenUndefined() && `user/refresh`, fetcher);

  if (data) {
    localStorage.setItem("token", data.token);
  }

  if (!isTokenExpired()) {
    return {
      token: localStorage.getItem("token") || "",
      isLoading: false,
      error: null,
      mutate: () => {},
    };
  }

  return {
    token: data ? data.token : "",
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
