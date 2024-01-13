import {
  Container, Group,
  Modal, ScrollArea, Text,
} from "@mantine/core";
import { ChunithmPlayerProps } from "./PlayerPanel.tsx";
import { PlayerContent } from "./PlayerContent.tsx";

interface ModalProps {
  player: ChunithmPlayerProps;
  opened: boolean;
  onClose: () => void;
}

export const PlayerModal = ({ player, opened, onClose }: ModalProps) => {
  return (
    <Modal.Root opened={opened} onClose={() => onClose()} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>玩家详情</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p={0}>
          <ScrollArea pb="md">
            <Container>
              <PlayerContent player={player} />
            </Container>
          </ScrollArea>
          <Container mb="md">
            <Group>
              {player.name_plate && (
                <div>
                  <Text fz="xs" c="dimmed">名牌版</Text>
                  <Text fz="sm">{player.name_plate.name}</Text>
                </div>
              )}
              {player.map_icon && (
                <div>
                  <Text fz="xs" c="dimmed">地图头像</Text>
                  <Text fz="sm">{player.map_icon.name}</Text>
                </div>
              )}
              <div>
                <Text fz="xs" c="dimmed">上次同步时间</Text>
                <Text fz="sm">{(new Date(Date.parse(player.upload_time))).toLocaleString()}</Text>
              </div>
            </Group>
          </Container>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}