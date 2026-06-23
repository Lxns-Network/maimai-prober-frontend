import { useEffect, useState } from "react";
import { Button, Group, Modal } from "@mantine/core";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { useNotifications } from "@/hooks/queries/useNotifications.ts";
import { useMarkNotificationRead } from "@/hooks/mutations/useNotificationMutations.ts";
import { getNotificationDisplay } from "@/components/Notifications/notificationTemplates.tsx";
import { NotificationProps } from "@/types/notification";

const SEEN_KEY = "notification.urgentSeen";

const keyOf = (n: NotificationProps) => `${n.category}-${n.id}`;

function loadSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
  } catch {
    return [];
  }
}

export function UrgentNotificationModal() {
  const { data } = useNotifications({ filter: "unread", page: 1, pageSize: 20 });
  const { mutate: markRead } = useMarkNotificationRead();
  const [current, setCurrent] = useState<NotificationProps | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (opened) return;
    const seen = loadSeen();
    const next = (data?.notifications ?? []).find(
      (n) => n.level === "urgent" && !n.read && !seen.includes(keyOf(n)),
    );
    if (next) {
      setCurrent(next);
      setOpened(true);
    }
  }, [data, opened]);

  const dismiss = (read: boolean) => {
    if (current) {
      localStorage.setItem(SEEN_KEY, JSON.stringify([...loadSeen(), keyOf(current)]));
      if (read) markRead({ category: current.category, id: current.id });
    }
    setOpened(false);
  };

  const close = () => dismiss(false);
  const acknowledge = () => dismiss(true);

  useBackDismiss(opened, close);

  const display = current ? getNotificationDisplay(current) : null;

  return (
    <Modal opened={opened} onClose={close} title={display?.title} centered>
      {display && (
        <>
          {display.body}
          <Group justify="flex-end" mt="lg">
            <Button onClick={acknowledge}>我知道了</Button>
          </Group>
        </>
      )}
    </Modal>
  );
}
