import {
  Accordion, Center, Container, Group, Loader,
  Modal, ScrollArea, Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { MaimaiPlayerProps } from "./PlayerPanel.tsx";
import { getPlayerRatingTrend } from "../../../../utils/api/player.tsx";
import { PlayerContent } from "./PlayerContent.tsx";
import { RatingTrend, RatingTrendProps } from "./RatingTrend.tsx";

interface ModalProps {
  player: MaimaiPlayerProps;
  opened: boolean;
  onClose: () => void;
}

export const PlayerModal = ({ player, opened, onClose }: ModalProps) => {
  const [trend, setTrend] = useState<RatingTrendProps[] | null>(null);
  const [fetching, setFetching] = useState(true);

  const getPlayerRatingTrendHandler = async () => {
    try {
      const res = await getPlayerRatingTrend('maimai');
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setTrend(data.data);
    } catch (err) {
      console.log(err);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!opened || trend) return;

    getPlayerRatingTrendHandler();
  }, [opened]);

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
                  <Text fz="xs" c="dimmed">姓名框</Text>
                  <Text fz="sm">{player.name_plate.name}</Text>
                </div>
              )}
              {player.frame && (
                <div>
                  <Text fz="xs" c="dimmed">背景板</Text>
                  <Text fz="sm">{player.frame.name}</Text>
                </div>
              )}
              <div>
                <Text fz="xs" c="dimmed">上次同步时间</Text>
                <Text fz="sm">{(new Date(Date.parse(player.upload_time))).toLocaleString()}</Text>
              </div>
            </Group>
          </Container>
          <Accordion chevronPosition="left" variant="filled" radius={0} defaultValue="history">
            <Accordion.Item value="history">
              <Accordion.Control>DX Rating 趋势图</Accordion.Control>
              <Accordion.Panel>
                {fetching ? (
                  <Center>
                    <Loader />
                  </Center>
                ) : (
                  <RatingTrend trend={trend} />
                )}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}