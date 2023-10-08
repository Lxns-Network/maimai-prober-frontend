import { Button, Group, Modal, Text } from '@mantine/core';

interface AlertProps {
  title: string;
  content: string;
  opened: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

export default function AlertModal({ title, content, opened, onClose, onConfirm }: AlertProps) {
  return (
    <Modal.Root opened={opened} onClose={onClose} size="auto" centered>
      <Modal.Overlay />
      <Modal.Content miw={300}>
        <Modal.Header>
          <Modal.Title fz="lg">{title}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Text fz="sm">{content}</Text>
          <Group position="right" mt="lg">
            <Button size="sm" variant="default" onClick={onClose}>
              取消
            </Button>
            <Button size="sm" onClick={() => {
              onConfirm && onConfirm();
              onClose();
            }}>
              确定
            </Button>
          </Group>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
