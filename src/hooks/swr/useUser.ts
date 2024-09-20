import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { UserProps } from "@/types/user";

export const useUser = () => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<UserProps>(`user/profile`, fetcher);

  return {
    user: data,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
