import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";
import { DeveloperProps } from "@/types/developer";

export const useDeveloper = () => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<DeveloperProps>(`user/developer/apply`, fetcher);

  return {
    developer: data,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
