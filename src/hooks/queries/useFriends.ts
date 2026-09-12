import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  BlockedUsersResponse,
  FriendItem,
  FriendRequestsResponse,
  FriendsListResponse,
} from "@/types/friend";
import { queryKeys } from "./queryKeys.ts";

const emptyFriends: FriendItem[] = [];

export const useFriends = () => {
  const isLoggedOut = typeof window === "undefined" || !localStorage.getItem("token");

  const { data, error, isLoading } = useQuery<FriendsListResponse>({
    queryKey: queryKeys.friends.list(),
    enabled: !isLoggedOut,
    staleTime: 60 * 1000,
  });

  return {
    friends: data?.friends ?? emptyFriends,
    isLoading,
    error,
  };
};

export const useFriendRequests = (
  direction: "incoming" | "outgoing" = "incoming",
  page = 1,
  pageSize = 20,
) => {
  const isLoggedOut = typeof window === "undefined" || !localStorage.getItem("token");
  const params = new URLSearchParams({
    direction,
    page: String(page),
    page_size: String(pageSize),
  });

  const { data, error, isLoading } = useQuery<FriendRequestsResponse>({
    queryKey: queryKeys.friends.requests(params),
    enabled: !isLoggedOut,
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
  };
};

export const useBlockedUsers = (page = 1, pageSize = 20) => {
  const isLoggedOut = typeof window === "undefined" || !localStorage.getItem("token");
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });

  const { data, error, isLoading } = useQuery<BlockedUsersResponse>({
    queryKey: queryKeys.friends.blocks(params),
    enabled: !isLoggedOut,
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
  };
};
