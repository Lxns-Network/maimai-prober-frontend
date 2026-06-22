import { useQuery } from "@tanstack/react-query";
import { DeveloperUsage } from "@/types/developer";
import { queryKeys } from "./queryKeys.ts";

export const useDeveloperUsage = () => {
  const { data, error, isLoading } = useQuery<DeveloperUsage>({
    queryKey: queryKeys.developer.usage(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return { usage: data, isLoading, error };
};
