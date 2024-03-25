import {
  Button,
  Modal,
} from "@mantine/core";
import { SettingsProps, SettingsSection } from "./SettingsSection.tsx";
import { useState } from "react";

interface SettingsModalProps {
  title: string;
  data: SettingsProps[];
  value?: any;
  opened: boolean;
  onClose: (value?: any) => void;
  onChange?: (key: string, value: any) => void;
}

const SettingsModal = ({ title, data, value, opened, onClose, onChange }: SettingsModalProps) => {
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

export const SettingsModalButton = ({ title, data, value, onChange }: { title: string; data: SettingsProps[], value: any, onChange: (key: string, value: any) => void }) => {
  const [opened, setOpened] = useState(false);

  return (
    <>
      <Button variant="outline" color="blue" onClick={() => setOpened(true)}>
        编辑
      </Button>
      <SettingsModal title={title} data={data || []} value={value} opened={opened} onClose={() => setOpened(false)} onChange={onChange} />
    </>
  );
}