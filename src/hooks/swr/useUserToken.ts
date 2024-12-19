import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { isTokenUndefined } from "@/utils/session.ts";

export const useUserToken = () => {
  if (isTokenUndefined()) {
    return {
      token: "",
      isLoading: false,
      error: null,
      mutate: () => {},
    };
  }

  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR(`user/refresh`, fetcher);

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
