import {
  IconBell,
  IconCalendarEvent,
  IconCode,
  IconGavel,
  IconRocket,
  IconTool,
} from "@tabler/icons-react";

const TYPE_ICONS: Record<string, typeof IconBell> = {
  // 广播类型
  maintenance: IconTool,
  version: IconRocket,
  event: IconCalendarEvent,
  developer: IconCode,
  // 个人通知类型
  developer_approved: IconCode,
  alias_approved: IconGavel,
};

export function getNotificationTypeIcon(type: string) {
  return TYPE_ICONS[type] ?? IconBell;
}
