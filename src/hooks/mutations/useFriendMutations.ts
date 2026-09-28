import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseAPIResponse } from "@/utils/api/response.ts";
import {
  acceptFriendRequest,
  blockUser,
  createFriendRequest,
  deleteFriend,
  rejectFriendRequest,
  unblockUser,
  updateFriendPreference,
  withdrawFriendRequest,
} from "@/utils/api/friend.ts";
import { FriendRequestItem } from "@/types/friend";

/**
 * 按查询键前缀批量失效。好友列表与所有好友维度的 bests/recents/scores/ranking 缓存
 * 共用 `user/friends` 前缀；`user/friend-requests` 不以它开头，需单独失效。
 */
const invalidatePrefix = (qc: ReturnType<typeof useQueryClient>, prefix: string) =>
  qc.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith(prefix),
  });

export const useUpdateFriendPreference = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      remark,
      is_favorite,
    }: {
      userId: number;
      remark?: string;
      is_favorite?: boolean;
    }) => parseAPIResponse(await updateFriendPreference(userId, { remark, is_favorite })),
    onSuccess: () => {
      invalidatePrefix(qc, "user/friends");
    },
  });
};

export const useDeleteFriend = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: number }) =>
      parseAPIResponse(await deleteFriend(userId)),
    onSuccess: () => {
      invalidatePrefix(qc, "user/friends");
    },
  });
};

export const useCreateFriendRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ username }: { username: string }) =>
      parseAPIResponse<FriendRequestItem>(await createFriendRequest(username)),
    onSuccess: () => {
      invalidatePrefix(qc, "user/friends");
      invalidatePrefix(qc, "user/friend-requests");
    },
  });
};

export const useAcceptFriendRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId }: { requestId: number }) =>
      parseAPIResponse<FriendRequestItem>(await acceptFriendRequest(requestId)),
    onSuccess: () => {
      invalidatePrefix(qc, "user/friends");
      invalidatePrefix(qc, "user/friend-requests");
    },
  });
};

export const useRejectFriendRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId }: { requestId: number }) =>
      parseAPIResponse(await rejectFriendRequest(requestId)),
    onSuccess: () => {
      invalidatePrefix(qc, "user/friend-requests");
    },
  });
};

export const useWithdrawFriendRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId }: { requestId: number }) =>
      parseAPIResponse(await withdrawFriendRequest(requestId)),
    onSuccess: () => {
      invalidatePrefix(qc, "user/friend-requests");
    },
  });
};

export const useBlockUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: number }) => parseAPIResponse(await blockUser(userId)),
    onSuccess: () => {
      invalidatePrefix(qc, "user/friends");
      invalidatePrefix(qc, "user/blocks");
      invalidatePrefix(qc, "user/friend-requests");
    },
  });
};

export const useUnblockUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: number }) =>
      parseAPIResponse(await unblockUser(userId)),
    onSuccess: () => {
      invalidatePrefix(qc, "user/blocks");
    },
  });
};
