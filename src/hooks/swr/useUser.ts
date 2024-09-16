import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { UserProps } from "@/components/Profile/UserSection.tsx";

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
