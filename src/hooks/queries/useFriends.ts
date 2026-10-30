import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BlockedUsersResponse,
  FriendItem,
  FriendRelationship,
  FriendRequestsResponse,
  FriendRequestCounts,
  FriendsListResponse,
} from "@/types/friend";
import { queryKeys } from "./queryKeys.ts";

const emptyFriends: FriendItem[] = [];
const emptyRequestCounts: FriendRequestCounts = { incoming: 0, outgoing: 0 };

const isLoggedOut = () => typeof window === "undefined" || !localStorage.getItem("token");

export const useFriends = () => {
  const { data, error, isLoading, refetch } = useQuery<FriendsListResponse>({
    queryKey: queryKeys.friends.list(),
    enabled: !isLoggedOut(),
    staleTime: 60 * 1000,
  });

  return {
    friends: data?.friends ?? emptyFriends,
    isLoading,
    error,
    refetch,
  };
};

export const useFriendRequestCounts = () => {
  const { data } = useQuery<FriendRequestCounts>({
    queryKey: queryKeys.friends.requestCounts(),
    enabled: !isLoggedOut(),
    staleTime: 30 * 1000,
  });
  return data ?? emptyRequestCounts;
};

export const useFriendRequests = (
  direction: "incoming" | "outgoing" = "incoming",
  page = 1,
  pageSize = 20,
  enabled = true,
) => {
  const params = new URLSearchParams({
    direction,
    page: String(page),
    page_size: String(pageSize),
  });

  const { data, error, isLoading, refetch } = useQuery<FriendRequestsResponse>({
    queryKey: queryKeys.friends.requests(params),
    enabled: enabled && !isLoggedOut(),
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });

  return {
    data,
    requests: data?.requests ?? [],
    total: data?.total ?? 0,
    pageSize,
    isLoading,
    error,
    refetch,
  };
};

export const useBlockedUsers = (page = 1, pageSize = 20, enabled = true) => {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });

  const { data, error, isLoading, refetch } = useQuery<BlockedUsersResponse>({
    queryKey: queryKeys.friends.blocks(params),
    enabled: enabled && !isLoggedOut(),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });

  return {
    data,
    blocks: data?.blocks ?? [],
    total: data?.total ?? 0,
    pageSize,
    isLoading,
    error,
    refetch,
  };
};

/** 按用户名读取关系及当前可见的档案；用户不存在或对方拉黑了自己时返回 404。 */
export const useFriendRelationship = (username: string, enabled = true) => {
  const { data, error, isLoading, refetch } = useQuery<FriendRelationship>({
    queryKey: queryKeys.friends.relationship(username),
    enabled: enabled && !!username && !isLoggedOut(),
    staleTime: 0,
    gcTime: 0,
  });

  return { relationship: data, isLoading, error, refetch };
};
