import { Indicator, ThemeIcon } from "@mantine/core";
import { getNotificationTypeIcon } from "./notificationIcons.ts";

const levelColor: Record<string, string> = {
  normal: "gray",
  important: "yellow",
  urgent: "red",
};

interface NotificationTypeIconProps {
  type: string;
  level: string;
  unread?: boolean;
}

export function NotificationTypeIcon({ type, level, unread }: NotificationTypeIconProps) {
  const Icon = getNotificationTypeIcon(type);
  const themeIcon = (
    <ThemeIcon variant="light" radius="xl" color={levelColor[level] ?? "gray"}>
      <Icon size={16} />
    </ThemeIcon>
  );

  if (unread === undefined) return themeIcon;

  return (
    <Indicator color="red" size={8} offset={4} disabled={!unread}>
      {themeIcon}
    </Indicator>
  );
}
