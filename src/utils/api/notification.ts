import { fetchAPI, uploadFile } from "./api.ts";
import { PublishNotificationPayload } from "@/types/notification";

export async function markNotificationRead(category: string, id: number): Promise<Response> {
  return fetchAPI("user/notifications/read", { method: "POST", body: { category, id } });
}

export async function markAllNotificationsRead(): Promise<Response> {
  return fetchAPI("user/notifications/read-all", { method: "POST" });
}

export async function publishNotification(payload: PublishNotificationPayload): Promise<Response> {
  return fetchAPI("user/admin/notifications", { method: "POST", body: payload });
}

export async function updateNotification(
  id: number,
  payload: PublishNotificationPayload,
): Promise<Response> {
  return fetchAPI(`user/admin/notifications/${id}`, { method: "PUT", body: payload });
}

export async function deleteNotification(id: number): Promise<Response> {
  return fetchAPI(`user/admin/notifications/${id}`, { method: "DELETE" });
}

export async function uploadNotificationImage(file: File): Promise<Response> {
  return uploadFile("user/admin/notifications/upload-image", file);
}
