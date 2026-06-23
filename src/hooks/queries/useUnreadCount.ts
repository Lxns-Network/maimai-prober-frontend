import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys.ts";

export const useUnreadCount = (): number => {
  const isLoggedOut = typeof window === "undefined" || !localStorage.getItem("token");

  const { data } = useQuery<{ unread_count: number }>({
    queryKey: queryKeys.notifications.unreadCount(),
    enabled: !isLoggedOut,
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000,
  });

  return data?.unread_count ?? 0;
};
