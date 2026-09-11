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

/** 好友列表与所有好友维度的 bests/recents/scores/ranking 缓存共用 `user/friends` 前缀，一起失效。 */
const invalidateFriends = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("user/friends"),
  });

const invalidateFriendRequests = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({
    predicate: (q) =>
      typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("user/friend-requests"),
  });

const invalidateBlocks = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({
    predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("user/blocks"),
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
      invalidateFriends(qc);
    },
  });
};

export const useDeleteFriend = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: number }) =>
      parseAPIResponse(await deleteFriend(userId)),
    onSuccess: () => {
      invalidateFriends(qc);
    },
  });
};

export const useCreateFriendRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ username }: { username: string }) =>
      parseAPIResponse<FriendRequestItem>(await createFriendRequest(username)),
    onSuccess: () => {
      invalidateFriends(qc);
      invalidateFriendRequests(qc);
    },
  });
};

export const useAcceptFriendRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId }: { requestId: number }) =>
      parseAPIResponse<FriendRequestItem>(await acceptFriendRequest(requestId)),
    onSuccess: () => {
      invalidateFriends(qc);
      invalidateFriendRequests(qc);
    },
  });
};

export const useRejectFriendRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId }: { requestId: number }) =>
      parseAPIResponse(await rejectFriendRequest(requestId)),
    onSuccess: () => {
      invalidateFriendRequests(qc);
    },
  });
};

export const useWithdrawFriendRequest = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId }: { requestId: number }) =>
      parseAPIResponse(await withdrawFriendRequest(requestId)),
    onSuccess: () => {
      invalidateFriendRequests(qc);
    },
  });
};

export const useBlockUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: number }) => parseAPIResponse(await blockUser(userId)),
    onSuccess: () => {
      invalidateFriends(qc);
      invalidateBlocks(qc);
      invalidateFriendRequests(qc);
    },
  });
};

export const useUnblockUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId }: { userId: number }) =>
      parseAPIResponse(await unblockUser(userId)),
    onSuccess: () => {
      invalidateBlocks(qc);
    },
  });
};
