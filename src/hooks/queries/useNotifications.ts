import { useQuery } from "@tanstack/react-query";
import { NotificationListResponse } from "@/types/notification";
import { queryKeys } from "./queryKeys.ts";

interface Options {
  filter: "all" | "unread";
  page: number;
  pageSize?: number;
}

export const useNotifications = ({ filter, page, pageSize = 20 }: Options) => {
  const isLoggedOut = typeof window === "undefined" || !localStorage.getItem("token");
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    filter,
  });

  const { data, error, isLoading } = useQuery<NotificationListResponse>({
    queryKey: queryKeys.notifications.list(params),
    enabled: !isLoggedOut,
    staleTime: 30 * 1000,
  });

  return { data, isLoading, error };
};
