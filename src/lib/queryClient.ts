import { QueryClient } from "@tanstack/react-query";
import { defaultQueryFn } from "@/hooks/queries/queryFn.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      refetchOnWindowFocus: true,
      retry: 3,
      staleTime: 30 * 1000,
    },
  },
});
