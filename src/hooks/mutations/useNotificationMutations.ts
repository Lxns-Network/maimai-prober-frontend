import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseAPIResponse } from "@/utils/api/response.ts";
import { markNotificationRead, markAllNotificationsRead } from "@/utils/api/notification.ts";

const invalidateNotifications = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({
    predicate: (q) =>
      typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("user/notifications"),
  });

export const useMarkNotificationRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ category, id }: { category: string; id: number }) =>
      parseAPIResponse(await markNotificationRead(category, id)),
    onSuccess: () => invalidateNotifications(qc),
  });
};

export const useMarkAllNotificationsRead = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => parseAPIResponse(await markAllNotificationsRead()),
    onSuccess: () => invalidateNotifications(qc),
  });
};
