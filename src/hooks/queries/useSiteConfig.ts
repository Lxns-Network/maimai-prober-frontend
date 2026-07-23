import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys.ts";

interface ConfigProps {
  resource_version: {
    [key: string]: number;
  };
  resource_hashes: {
    [key: string]: {
      [key: string]: string;
    };
  };
}

export const useSiteConfig = () => {
  const { data, error, isLoading, refetch } = useQuery<ConfigProps>({
    queryKey: queryKeys.config.site(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  });

  return {
    config: data,
    isLoading,
    error,
    refetch,
  };
};
