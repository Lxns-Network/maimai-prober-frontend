import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { parseAPIResponse } from "@/utils/api/response.ts";
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

export const useUpdatePlayerData = (
  options?: UseMutationOptions<
    unknown,
    Error,
    { game: Game; player: Partial<MaimaiPlayerProps> | Partial<ChunithmPlayerProps> }
  >,
) => {
  return useMutation({
    mutationFn: async ({
      game,
      player,
    }: {
      game: Game;
      player: Partial<MaimaiPlayerProps> | Partial<ChunithmPlayerProps>;
    }) => parseAPIResponse(await updatePlayerData(game, player)),
    ...options,
  });
};

export const useUnbindPlayer = (options?: UseMutationOptions<unknown, Error, Game>) => {
  return useMutation({
    mutationFn: async (game: Game) => parseAPIResponse(await unbindPlayer(game)),
    ...options,
  });
};

export const useDeletePlayerScores = (options?: UseMutationOptions<unknown, Error, Game>) => {
  return useMutation({
    mutationFn: async (game: Game) => parseAPIResponse(await deletePlayerScores(game)),
    ...options,
  });
};

export const useCreatePlayerScores = (
  options?: UseMutationOptions<unknown, Error, { game: Game; scores: object[] }>,
) => {
  return useMutation({
    mutationFn: async ({ game, scores }: { game: Game; scores: object[] }) =>
      parseAPIResponse(await createPlayerScores(game, scores)),
    ...options,
  });
};

export const useDeletePlayerScore = (
  options?: UseMutationOptions<unknown, Error, { game: Game; params: URLSearchParams }>,
) => {
  return useMutation({
    mutationFn: async ({ game, params }: { game: Game; params: URLSearchParams }) =>
      parseAPIResponse(await deletePlayerScore(game, params)),
    ...options,
  });
};

export const useDeletePlayerScoreHistory = (
  options?: UseMutationOptions<unknown, Error, { game: Game; params: URLSearchParams }>,
) => {
  return useMutation({
    mutationFn: async ({ game, params }: { game: Game; params: URLSearchParams }) =>
      parseAPIResponse(await deletePlayerScoreHistory(game, params)),
    ...options,
  });
};
