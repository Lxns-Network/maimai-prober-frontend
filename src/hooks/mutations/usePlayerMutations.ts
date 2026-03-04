import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { apiMutationFn } from "@/hooks/queries/mutationFn.ts";
import {
  updatePlayerData, unbindPlayer, deletePlayerScores, createPlayerScores,
  deletePlayerScore, deletePlayerScoreHistory,
} from "@/utils/api/player.ts";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { Game } from "@/types/game";

export const useUpdatePlayerData = (options?: UseMutationOptions<unknown, Error, { game: Game; player: Partial<MaimaiPlayerProps> | Partial<ChunithmPlayerProps> }>) => {
  return useMutation({
    mutationFn: ({ game, player }: { game: Game; player: Partial<MaimaiPlayerProps> | Partial<ChunithmPlayerProps> }) =>
      apiMutationFn(() => updatePlayerData(game, player)),
    ...options,
  });
};

export const useUnbindPlayer = (options?: UseMutationOptions<unknown, Error, Game>) => {
  return useMutation({
    mutationFn: (game: Game) => apiMutationFn(() => unbindPlayer(game)),
    ...options,
  });
};

export const useDeletePlayerScores = (options?: UseMutationOptions<unknown, Error, Game>) => {
  return useMutation({
    mutationFn: (game: Game) => apiMutationFn(() => deletePlayerScores(game)),
    ...options,
  });
};

export const useCreatePlayerScores = (options?: UseMutationOptions<unknown, Error, { game: Game; scores: object[] }>) => {
  return useMutation({
    mutationFn: ({ game, scores }: { game: Game; scores: object[] }) =>
      apiMutationFn(() => createPlayerScores(game, scores)),
    ...options,
  });
};

export const useDeletePlayerScore = (options?: UseMutationOptions<unknown, Error, { game: Game; params: URLSearchParams }>) => {
  return useMutation({
    mutationFn: ({ game, params }: { game: Game; params: URLSearchParams }) =>
      apiMutationFn(() => deletePlayerScore(game, params)),
    ...options,
  });
};

export const useDeletePlayerScoreHistory = (options?: UseMutationOptions<unknown, Error, { game: Game; params: URLSearchParams }>) => {
  return useMutation({
    mutationFn: ({ game, params }: { game: Game; params: URLSearchParams }) =>
      apiMutationFn(() => deletePlayerScoreHistory(game, params)),
    ...options,
  });
};
