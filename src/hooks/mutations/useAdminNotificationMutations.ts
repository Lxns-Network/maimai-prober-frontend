import { useMutation, UseMutationOptions, useQueryClient } from "@tanstack/react-query";
import { apiMutationFn } from "../queries/mutationFn.ts";
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
    mutationFn: (payload: PublishNotificationPayload) =>
      apiMutationFn(() => publishNotification(payload)),
    onSuccess: () => invalidate(qc),
  });
};

export const useUpdateNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: PublishNotificationPayload }) =>
      apiMutationFn(() => updateNotification(id, payload)),
    onSuccess: () => invalidate(qc),
  });
};

export const useDeleteNotification = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiMutationFn(() => deleteNotification(id)),
    onSuccess: () => invalidate(qc),
  });
};

export const useUploadNotificationImage = (
  options?: UseMutationOptions<NotificationImageUploadResponse, Error, File>,
) => {
  return useMutation({
    mutationFn: (file: File) =>
      apiMutationFn<NotificationImageUploadResponse>(() => uploadNotificationImage(file)),
    ...options,
  });
};
