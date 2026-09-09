import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { parseAPIResponse } from "@/utils/api/response.ts";
import { createComment, deleteComment, likeComment, unlikeComment } from "@/utils/api/comment.ts";

export const useCreateComment = (
  options?: UseMutationOptions<unknown, Error, { game: string; data: object }>,
) => {
  return useMutation({
    mutationFn: async ({ game, data }: { game: string; data: object }) =>
      parseAPIResponse(await createComment(game, data)),
    ...options,
  });
};

export const useDeleteComment = (
  options?: UseMutationOptions<unknown, Error, { game: string; commentId: number }>,
) => {
  return useMutation({
    mutationFn: async ({ game, commentId }: { game: string; commentId: number }) =>
      parseAPIResponse(await deleteComment(game, commentId)),
    ...options,
  });
};

export const useLikeComment = (
  options?: UseMutationOptions<unknown, Error, { game: string; commentId: number }>,
) => {
  return useMutation({
    mutationFn: async ({ game, commentId }: { game: string; commentId: number }) =>
      parseAPIResponse(await likeComment(game, commentId)),
    ...options,
  });
};

export const useUnlikeComment = (
  options?: UseMutationOptions<unknown, Error, { game: string; commentId: number }>,
) => {
  return useMutation({
    mutationFn: async ({ game, commentId }: { game: string; commentId: number }) =>
      parseAPIResponse(await unlikeComment(game, commentId)),
    ...options,
  });
};
