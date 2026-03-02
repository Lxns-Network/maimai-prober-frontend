import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { apiMutationFn } from "@/hooks/queries/mutationFn.ts";
import {
  createAlias, voteAlias, deleteUserAlias, deleteAlias, approveAlias,
} from "@/utils/api/alias.ts";

export const useCreateAlias = (options?: UseMutationOptions<unknown, Error, { game: string; data: object }>) => {
  return useMutation({
    mutationFn: ({ game, data }: { game: string; data: object }) =>
      apiMutationFn(() => createAlias(game, data)),
    ...options,
  });
};

export const useVoteAlias = (options?: UseMutationOptions<unknown, Error, { game: string; aliasId: number; vote: boolean }>) => {
  return useMutation({
    mutationFn: ({ game, aliasId, vote }: { game: string; aliasId: number; vote: boolean }) =>
      apiMutationFn(() => voteAlias(game, aliasId, vote)),
    ...options,
  });
};

export const useDeleteUserAlias = (options?: UseMutationOptions<unknown, Error, { game: string; aliasId: number }>) => {
  return useMutation({
    mutationFn: ({ game, aliasId }: { game: string; aliasId: number }) =>
      apiMutationFn(() => deleteUserAlias(game, aliasId)),
    ...options,
  });
};

// Admin
export const useDeleteAlias = (options?: UseMutationOptions<unknown, Error, { game: string; aliasId: number }>) => {
  return useMutation({
    mutationFn: ({ game, aliasId }: { game: string; aliasId: number }) =>
      apiMutationFn(() => deleteAlias(game, aliasId)),
    ...options,
  });
};

export const useApproveAlias = (options?: UseMutationOptions<unknown, Error, { game: string; aliasId: number }>) => {
  return useMutation({
    mutationFn: ({ game, aliasId }: { game: string; aliasId: number }) =>
      apiMutationFn(() => approveAlias(game, aliasId)),
    ...options,
  });
};
