import { Modal } from "@mantine/core";
import { SettingProps, SettingList, SettingValue } from "./SettingList.tsx";

interface SettingsModalProps {
  title: string;
  data: SettingProps[];
  value?: SettingValue;
  opened: boolean;
  onClose: () => void;
  onChange?: (key: string, value: string | boolean | string[] | null) => void;
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
          <SettingList data={data} value={value} onChange={onChange} />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
