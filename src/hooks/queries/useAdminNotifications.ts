import { useQuery } from "@tanstack/react-query";
import { AdminBroadcast } from "@/types/notification";
import { queryKeys } from "./queryKeys.ts";

export const useAdminNotifications = () => {
  const { data, error, isLoading } = useQuery<AdminBroadcast[]>({
    queryKey: queryKeys.notifications.admin.list(),
    staleTime: 30 * 1000,
  });

  return { broadcasts: data ?? [], isLoading, error };
};
