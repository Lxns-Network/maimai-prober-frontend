import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { ConfigProps } from "@/types/user";

export const useUserConfig = (game: "maimai" | "chunithm") => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<ConfigProps>(`user/${game}/config`, fetcher);

  return {
    config: data,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
