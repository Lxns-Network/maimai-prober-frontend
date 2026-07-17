import { QueryClient } from "@tanstack/react-query";
import { defaultQueryFn } from "@/hooks/queries/queryFn.ts";
import { APIError } from "@/utils/errors.ts";
import { registerAuthSessionChangeHandler } from "@/utils/session.ts";
import useScoreStore from "@/hooks/useScoreStore.ts";
import useCreateScoreStore from "@/hooks/useCreateScoreStore.ts";
import useAliasStore from "@/hooks/useAliasStore.ts";

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

const isUserScopedQuery = (query: { queryKey: readonly unknown[] }) => {
  const endpoint = query.queryKey[0];
  return typeof endpoint === "string" && (endpoint === "user" || endpoint.startsWith("user/"));
};

const resetUserScopedModalStores = () => {
  useScoreStore.setState({ opened: false, score: null, onClose: undefined });
  useCreateScoreStore.setState({ opened: false, score: null, onClose: undefined });
  useAliasStore.setState({ opened: false, songId: null, onClose: undefined });
};

registerAuthSessionChangeHandler(async (phase) => {
  if (phase === "cancel") {
    await queryClient.cancelQueries({ predicate: isUserScopedQuery });
  } else {
    queryClient.removeQueries({ predicate: isUserScopedQuery });
    resetUserScopedModalStores();
  }
});
