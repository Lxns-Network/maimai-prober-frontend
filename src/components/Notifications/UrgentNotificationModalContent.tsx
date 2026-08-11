import { Button, Group, Modal } from "@mantine/core";
import { NotificationProps } from "@/types/notification";
import { getNotificationDisplay } from "@/components/Notifications/notificationTemplates.tsx";

interface UrgentNotificationModalContentProps {
  notification: NotificationProps;
  opened: boolean;
  onClose(): void;
  onAcknowledge(): void;
}

export function UrgentNotificationModalContent({
  notification,
  opened,
  onClose,
  onAcknowledge,
}: UrgentNotificationModalContentProps) {
  const display = getNotificationDisplay(notification);

  return (
    <Modal opened={opened} onClose={onClose} title={display.title} centered>
      {display.body}
      <Group justify="flex-end" mt="lg">
        <Button onClick={onAcknowledge}>我知道了</Button>
      </Group>
    </Modal>
  );
}
