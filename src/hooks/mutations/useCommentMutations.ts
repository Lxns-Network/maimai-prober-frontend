import { useMutation, UseMutationOptions } from "@tanstack/react-query";
import { apiMutationFn } from "@/hooks/queries/mutationFn.ts";
import {
  createComment, deleteComment, likeComment, unlikeComment,
} from "@/utils/api/comment.ts";

export const useCreateComment = (options?: UseMutationOptions<unknown, Error, { game: string; data: object }>) => {
  return useMutation({
    mutationFn: ({ game, data }: { game: string; data: object }) =>
      apiMutationFn(() => createComment(game, data)),
    ...options,
  });
};

export const useDeleteComment = (options?: UseMutationOptions<unknown, Error, { game: string; commentId: number }>) => {
  return useMutation({
    mutationFn: ({ game, commentId }: { game: string; commentId: number }) =>
      apiMutationFn(() => deleteComment(game, commentId)),
    ...options,
  });
};

export const useLikeComment = (options?: UseMutationOptions<unknown, Error, { game: string; commentId: number }>) => {
  return useMutation({
    mutationFn: ({ game, commentId }: { game: string; commentId: number }) =>
      apiMutationFn(() => likeComment(game, commentId)),
    ...options,
  });
};

export const useUnlikeComment = (options?: UseMutationOptions<unknown, Error, { game: string; commentId: number }>) => {
  return useMutation({
    mutationFn: ({ game, commentId }: { game: string; commentId: number }) =>
      apiMutationFn(() => unlikeComment(game, commentId)),
    ...options,
  });
};
