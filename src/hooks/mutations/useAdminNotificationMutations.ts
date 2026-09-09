import { useMutation, UseMutationOptions, useQueryClient } from "@tanstack/react-query";
import { parseAPIResponse } from "@/utils/api/response.ts";
import {
  publishNotification,
  updateNotification,
  deleteNotification,
  uploadNotificationImage,
} from "@/utils/api/notification.ts";
import { NotificationImageUploadResponse, PublishNotificationPayload } from "@/types/notification";
import { queryKeys } from "../queries/queryKeys.ts";

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: queryKeys.notifications.admin.list() });
  qc.invalidateQueries({
    predicate: (q) =>
      typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("user/notifications"),
  });
};

export const usePublishNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PublishNotificationPayload) =>
      parseAPIResponse(await publishNotification(payload)),
    onSuccess: () => invalidate(qc),
  });
};

export const useUpdateNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: PublishNotificationPayload }) =>
      parseAPIResponse(await updateNotification(id, payload)),
    onSuccess: () => invalidate(qc),
  });
};

export const useDeleteNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => parseAPIResponse(await deleteNotification(id)),
    onSuccess: () => invalidate(qc),
  });
};

export const useUploadNotificationImage = (
  options?: UseMutationOptions<NotificationImageUploadResponse, Error, File>,
) => {
  return useMutation({
    mutationFn: async (file: File) =>
      parseAPIResponse<NotificationImageUploadResponse>(await uploadNotificationImage(file)),
    ...options,
  });
};
