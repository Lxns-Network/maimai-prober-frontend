import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { parseAPIResponse } from "@/utils/api/response.ts";
import {
  createAlias,
  voteAlias,
  deleteUserAlias,
  deleteAlias,
  approveAlias,
} from "@/utils/api/alias.ts";

export const useCreateAlias = (
  options?: UseMutationOptions<unknown, Error, { game: string; data: object }>,
) => {
  return useMutation({
    mutationFn: async ({ game, data }: { game: string; data: object }) =>
      parseAPIResponse(await createAlias(game, data)),
    ...options,
  });
};

export const useVoteAlias = (
  options?: UseMutationOptions<unknown, Error, { game: string; aliasId: number; vote: boolean }>,
) => {
  return useMutation({
    mutationFn: async ({ game, aliasId, vote }: { game: string; aliasId: number; vote: boolean }) =>
      parseAPIResponse(await voteAlias(game, aliasId, vote)),
    ...options,
  });
};

export const useDeleteUserAlias = (
  options?: UseMutationOptions<unknown, Error, { game: string; aliasId: number }>,
) => {
  return useMutation({
    mutationFn: async ({ game, aliasId }: { game: string; aliasId: number }) =>
      parseAPIResponse(await deleteUserAlias(game, aliasId)),
    ...options,
  });
};

export const useDeleteAlias = (
  options?: UseMutationOptions<unknown, Error, { game: string; aliasId: number }>,
) => {
  return useMutation({
    mutationFn: async ({ game, aliasId }: { game: string; aliasId: number }) =>
      parseAPIResponse(await deleteAlias(game, aliasId)),
    ...options,
  });
};

export const useApproveAlias = (
  options?: UseMutationOptions<unknown, Error, { game: string; aliasId: number }>,
) => {
  return useMutation({
    mutationFn: async ({ game, aliasId }: { game: string; aliasId: number }) =>
      parseAPIResponse(await approveAlias(game, aliasId)),
    ...options,
  });
};
