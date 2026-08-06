import { QueryClient } from "@tanstack/react-query";
import { Game } from "@/types/game";

/** Invalidates every cached player view derived from scores or player metadata for one game. */
export const invalidatePlayerQueries = (queryClient: QueryClient, game: Game) => {
  const playerPrefix = `user/${game}/player`;

  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) => {
      const path = queryKey[0];
      return (
        typeof path === "string" &&
        (path === playerPrefix ||
          path.startsWith(`${playerPrefix}/`) ||
          path.startsWith(`${playerPrefix}?`))
      );
    },
  });
};
