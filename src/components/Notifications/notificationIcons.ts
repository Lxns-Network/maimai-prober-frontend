import {
  IconBell,
  IconCalendarEvent,
  IconCode,
  IconGavel,
  IconHeart,
  IconRocket,
  IconTool,
  IconUserCheck,
  IconUserPlus,
} from "@tabler/icons-react";

const TYPE_ICONS: Record<string, typeof IconBell> = {
  // 广播类型
  maintenance: IconTool,
  version: IconRocket,
  event: IconCalendarEvent,
  developer: IconCode,
  // 个人通知类型
  developer_approved: IconCode,
  developer_rejected: IconCode,
  alias_approved: IconGavel,
  comment_liked: IconHeart,
  friend_request_accepted: IconUserCheck,
  friend_request_received: IconUserPlus,
};

export function getNotificationTypeIcon(type: string) {
  return TYPE_ICONS[type] ?? IconBell;
}
