import { QueryClient } from "@tanstack/react-query";
import { defaultQueryFn } from "@/hooks/queries/queryFn.ts";
import { APIError } from "@/utils/errors.ts";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        if (error instanceof APIError && error.status !== undefined && error.status < 500) {
          return false;
        }
        return failureCount < 3;
      },
      staleTime: 30 * 1000,
    },
  },
});
