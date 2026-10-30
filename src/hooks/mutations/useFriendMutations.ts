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
import { FriendRequestItem, FriendRelationship, FriendsListResponse } from "@/types/friend";
import { FriendRankingScoreProps } from "@/hooks/queries/useFriendScoreRanking";
import { queryKeys } from "@/hooks/queries/queryKeys";

/**
 * 按查询键前缀批量失效。好友列表、关系查询与所有好友维度的 bests/recents/scores/ranking 缓存
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
    onSuccess: (_, { userId, remark, is_favorite }) => {
      const changes = {
        ...(remark !== undefined ? { remark: remark.trim() } : {}),
        ...(is_favorite !== undefined ? { is_favorite } : {}),
      };
      qc.setQueryData<FriendsListResponse>(
        queryKeys.friends.list(),
        (previous) =>
          previous && {
            ...previous,
            friends: previous.friends.map((friend) =>
              friend.user_id === userId ? { ...friend, ...changes } : friend,
            ),
          },
      );
      qc.setQueriesData<FriendRelationship>(
        {
          predicate: (query) =>
            typeof query.queryKey[0] === "string" &&
            query.queryKey[0].startsWith("user/friends/relationship?"),
        },
        (previous) => (previous?.user_id === userId ? { ...previous, ...changes } : previous),
      );
      if (remark !== undefined) {
        qc.setQueriesData<FriendRankingScoreProps[]>(
          {
            predicate: (query) =>
              typeof query.queryKey[0] === "string" &&
              /^user\/friends\/(maimai|chunithm)\/score\/ranking\?/.test(query.queryKey[0]),
          },
          (previous) =>
            previous?.map((row) =>
              row.user_id === userId ? { ...row, remark: remark.trim() } : row,
            ),
        );
      }
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
      invalidatePrefix(qc, "user/notifications");
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
      invalidatePrefix(qc, "user/notifications");
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
      invalidatePrefix(qc, "user/friends");
      invalidatePrefix(qc, "user/notifications");
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
      invalidatePrefix(qc, "user/friends");
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
      invalidatePrefix(qc, "user/notifications");
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
      invalidatePrefix(qc, "user/friends");
    },
  });
};
