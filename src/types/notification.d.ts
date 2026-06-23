import { Game } from "@/types/game";

export type NotificationCategory = "broadcast" | "personal";
export type NotificationLevel = "normal" | "important" | "urgent";

export type NotificationAction =
  | { type: "link"; url: string }
  | { type: "song"; game: Game; song_id: number }
  | { type: "score"; game: Game; song_id: number; song_type?: string; difficulty: number };

export interface NotificationProps {
  id: number;
  category: NotificationCategory;
  type: string;
  level: NotificationLevel;
  title: string;
  content: string;
  action?: NotificationAction; // 跳转动作由前端定义
  data?: Record<string, unknown>; // 仅个人通知
  read: boolean;
  create_time: string;
  expire_time?: string;
}

export interface NotificationListResponse {
  notifications: NotificationProps[];
  total: number;
  unread_count: number;
}

export interface NotificationImageUploadResponse {
  url: string;
}

export interface PublishNotificationPayload {
  title: string;
  content: string;
  type: string;
  level: NotificationLevel;
  expire_time?: string;
  audience: { type: "all" | "permission" | "users"; permission?: number; user_ids?: number[] };
}

export interface AdminBroadcast {
  id: number;
  type: string;
  level: NotificationLevel;
  title: string;
  content: string;
  audience_type: "all" | "permission" | "users";
  audience_permission?: number;
  create_time: string;
  update_time?: string;
  expire_time?: string;
}
