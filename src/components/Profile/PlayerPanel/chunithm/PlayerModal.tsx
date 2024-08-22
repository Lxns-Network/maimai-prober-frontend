import {
  Container, Grid,
  Modal, Paper, ScrollArea, Text,
} from "@mantine/core";
import { ChunithmPlayerProps } from "./PlayerPanel.tsx";
import { PlayerContent } from "./PlayerContent.tsx";
import classes from "../PlayerModal.module.css";
import { CustomMarquee } from "../../../CustomMarquee.tsx";

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
            <Grid>
              <Grid.Col span={6}>
                {player.name_plate && (
                  <Paper className={classes.subParameters}>
                    <Text fz="xs" c="dimmed">名牌版</Text>
                    <Text fz="sm">
                      <CustomMarquee>{player.name_plate.name}</CustomMarquee>
                    </Text>
                  </Paper>
                )}
              </Grid.Col>
              <Grid.Col span={6}>
                {player.map_icon && (
                  <Paper className={classes.subParameters}>
                    <Text fz="xs" c="dimmed">地图头像</Text>
                    <Text fz="sm">
                      <CustomMarquee>{player.map_icon.name}</CustomMarquee>
                    </Text>
                  </Paper>
                )}
              </Grid.Col>
              <Grid.Col span={6}>
                <Paper className={classes.subParameters}>
                  <Text fz="xs" c="dimmed">上次同步时间</Text>
                  <Text fz="sm">
                    <CustomMarquee>{(new Date(Date.parse(player.upload_time))).toLocaleString()}</CustomMarquee>
                  </Text>
                </Paper>
              </Grid.Col>
            </Grid>
          </Container>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}