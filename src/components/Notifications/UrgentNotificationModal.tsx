import { useEffect, useState } from "react";
import { Button, Group, Modal } from "@mantine/core";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { useUrgentNotifications } from "@/hooks/queries/useUrgentNotifications.ts";
import { useMarkNotificationRead } from "@/hooks/mutations/useNotificationMutations.ts";
import { getNotificationDisplay } from "@/components/Notifications/notificationTemplates.tsx";
import { NotificationProps } from "@/types/notification";

const SEEN_KEY = "notification.urgentSeen";

const keyOf = (n: NotificationProps) => `${n.category}-${n.id}`;

function loadSeen(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]") as unknown;
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
  } catch {
    return [];
  }
}

function storeSeen(values: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(values));
  } catch {
    return;
  }
}

export function UrgentNotificationModal() {
  const urgent = useUrgentNotifications();
  const { mutate: markRead } = useMarkNotificationRead();
  const [current, setCurrent] = useState<NotificationProps | null>(null);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (opened) return;
    const seen = loadSeen();
    const next = urgent.find((n) => !seen.includes(keyOf(n)));
    if (next) {
      setCurrent(next);
      setOpened(true);
    }
  }, [urgent, opened]);

  const dismiss = (read: boolean) => {
    if (current) {
      storeSeen([...loadSeen(), keyOf(current)]);
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
