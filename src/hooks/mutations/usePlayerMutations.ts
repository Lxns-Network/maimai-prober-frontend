import { useMutation, UseMutationOptions, useQueryClient } from "@tanstack/react-query";
import { apiMutationFn } from "@/hooks/queries/mutationFn.ts";
import {
  updatePlayerData,
  unbindPlayer,
  deletePlayerScores,
  createPlayerScores,
  deletePlayerScore,
  deletePlayerScoreHistory,
} from "@/utils/api/player.ts";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { Game } from "@/types/game";
import { invalidatePlayerQueries } from "@/hooks/queries/invalidatePlayerQueries.ts";

export const useUpdatePlayerData = (
  options?: UseMutationOptions<
    unknown,
    Error,
    { game: Game; player: Partial<MaimaiPlayerProps> | Partial<ChunithmPlayerProps> }
  >,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...mutationOptions } = options ?? {};

  return useMutation({
    ...mutationOptions,
    mutationFn: ({
      game,
      player,
    }: {
      game: Game;
      player: Partial<MaimaiPlayerProps> | Partial<ChunithmPlayerProps>;
    }) => apiMutationFn(() => updatePlayerData(game, player)),
    onSuccess: async (data, variables, onMutateResult, context) => {
      void invalidatePlayerQueries(queryClient, variables.game);
      await onSuccess?.(data, variables, onMutateResult, context);
    },
  });
};

export const useUnbindPlayer = (options?: UseMutationOptions<unknown, Error, Game>) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...mutationOptions } = options ?? {};

  return useMutation({
    ...mutationOptions,
    mutationFn: (game: Game) => apiMutationFn(() => unbindPlayer(game)),
    onSuccess: async (data, game, onMutateResult, context) => {
      void invalidatePlayerQueries(queryClient, game);
      await onSuccess?.(data, game, onMutateResult, context);
    },
  });
};

export const useDeletePlayerScores = (options?: UseMutationOptions<unknown, Error, Game>) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...mutationOptions } = options ?? {};

  return useMutation({
    ...mutationOptions,
    mutationFn: (game: Game) => apiMutationFn(() => deletePlayerScores(game)),
    onSuccess: async (data, game, onMutateResult, context) => {
      void invalidatePlayerQueries(queryClient, game);
      await onSuccess?.(data, game, onMutateResult, context);
    },
  });
};

export const useCreatePlayerScores = (
  options?: UseMutationOptions<unknown, Error, { game: Game; scores: object[] }>,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...mutationOptions } = options ?? {};

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ game, scores }: { game: Game; scores: object[] }) =>
      apiMutationFn(() => createPlayerScores(game, scores)),
    onSuccess: async (data, variables, onMutateResult, context) => {
      void invalidatePlayerQueries(queryClient, variables.game);
      await onSuccess?.(data, variables, onMutateResult, context);
    },
  });
};

export const useDeletePlayerScore = (
  options?: UseMutationOptions<unknown, Error, { game: Game; params: URLSearchParams }>,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...mutationOptions } = options ?? {};

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ game, params }: { game: Game; params: URLSearchParams }) =>
      apiMutationFn(() => deletePlayerScore(game, params)),
    onSuccess: async (data, variables, onMutateResult, context) => {
      void invalidatePlayerQueries(queryClient, variables.game);
      await onSuccess?.(data, variables, onMutateResult, context);
    },
  });
};

export const useDeletePlayerScoreHistory = (
  options?: UseMutationOptions<unknown, Error, { game: Game; params: URLSearchParams }>,
) => {
  const queryClient = useQueryClient();
  const { onSuccess, ...mutationOptions } = options ?? {};

  return useMutation({
    ...mutationOptions,
    mutationFn: ({ game, params }: { game: Game; params: URLSearchParams }) =>
      apiMutationFn(() => deletePlayerScoreHistory(game, params)),
    onSuccess: async (data, variables, onMutateResult, context) => {
      void invalidatePlayerQueries(queryClient, variables.game);
      await onSuccess?.(data, variables, onMutateResult, context);
    },
  });
};
