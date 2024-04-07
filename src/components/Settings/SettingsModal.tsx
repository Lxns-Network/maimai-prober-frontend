import { Modal } from "@mantine/core";
import { SettingProps, SettingsSection } from "./SettingsSection.tsx";

interface SettingsModalProps {
  title: string;
  data: SettingProps[];
  value?: any;
  opened: boolean;
  onClose: (value?: any) => void;
  onChange?: (key: string, value: any) => void;
}

export const SettingsModal = ({ title, data, value, opened, onClose, onChange }: SettingsModalProps) => {
  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>{title}</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <SettingsSection data={data} value={value} onChange={onChange} />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}