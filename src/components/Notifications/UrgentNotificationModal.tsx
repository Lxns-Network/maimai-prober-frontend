import { lazy, Suspense, useEffect, useState } from "react";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { useUrgentNotifications } from "@/hooks/queries/useUrgentNotifications.ts";
import { useMarkNotificationRead } from "@/hooks/mutations/useNotificationMutations.ts";
import { NotificationProps } from "@/types/notification";

const UrgentNotificationModalContent = lazy(() =>
  import("./UrgentNotificationModalContent.tsx").then(({ UrgentNotificationModalContent }) => ({
    default: UrgentNotificationModalContent,
  })),
);

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
      localStorage.setItem(SEEN_KEY, JSON.stringify([...loadSeen(), keyOf(current)]));
      if (read) markRead({ category: current.category, id: current.id });
    }
    setOpened(false);
  };

  const close = () => dismiss(false);
  const acknowledge = () => dismiss(true);

  useBackDismiss(opened, close);

  if (!current) return null;

  return (
    <Suspense fallback={null}>
      <UrgentNotificationModalContent
        notification={current}
        opened={opened}
        onClose={close}
        onAcknowledge={acknowledge}
      />
    </Suspense>
  );
}
