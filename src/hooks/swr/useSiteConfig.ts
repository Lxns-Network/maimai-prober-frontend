import useSWR from "swr";
import { fetcher } from "@/hooks/swr/fetcher.ts";

interface ConfigProps {
  resource_hashes: {
    [key: string]: {
      [key: string]: string;
    }
  }
}

export const useSiteConfig = () => {
  const {
    data,
    error,
    isLoading,
    mutate
  } = useSWR<ConfigProps>(`site/config`, fetcher, {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });

  return {
    config: data,
    isLoading: isLoading,
    error: error,
    mutate: mutate,
  };
};
