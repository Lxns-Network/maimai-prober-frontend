import { useQuery } from "@tanstack/react-query";
import { NotificationProps } from "@/types/notification";
import { queryKeys } from "./queryKeys.ts";

// 进站强提示 Modal 专用：后端已过滤「可见 + 未读 + level=urgent」并按时间倒序，不分页。
export const useUrgentNotifications = (): NotificationProps[] => {
  const isLoggedOut = typeof window === "undefined" || !localStorage.getItem("token");

  const { data } = useQuery<{ notifications: NotificationProps[] }>({
    queryKey: queryKeys.notifications.urgent(),
    enabled: !isLoggedOut,
    staleTime: 60 * 1000,
  });

  return data?.notifications ?? [];
};
