import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/hooks/queries/queryKeys";
import { getChunithmAssetsUrl } from "../assets/urls";

export function useChartAssets(pageUrl: string, override: string | undefined, enabled: boolean) {
  const directory = override?.trim() || null;
  const pageBase = new URL(".", pageUrl).href;
  return useQuery({
    queryKey: queryKeys.chart.chunithmAssets(directory, directory ? pageBase : null),
    queryFn: ({ signal }) => getChunithmAssetsUrl(pageUrl, directory, signal),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
