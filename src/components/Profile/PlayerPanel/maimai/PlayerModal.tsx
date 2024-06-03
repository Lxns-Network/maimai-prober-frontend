import {
  Accordion, ActionIcon, Center, CheckIcon, Combobox, Container, Group, Loader,
  Modal, ScrollArea, Text, useCombobox,
} from "@mantine/core";
import { useContext, useEffect, useState } from "react";
import { MaimaiPlayerProps } from "./PlayerPanel.tsx";
import { getPlayerRatingTrend } from "../../../../utils/api/player.tsx";
import { PlayerContent } from "./PlayerContent.tsx";
import { RatingTrend, RatingTrendProps } from "./RatingTrend.tsx";
import { IconDots } from "@tabler/icons-react";
import classes from "../../../Scores/ScoreModalMenu.module.css";
import { ApiContext } from "../../../../App.tsx";
import { openRetryModal } from "../../../../utils/modal.tsx";

interface ModalProps {
  player: MaimaiPlayerProps;
  opened: boolean;
  onClose: () => void;
}

export const PlayerModal = ({ player, opened, onClose }: ModalProps) => {
  const context = useContext(ApiContext);

  const [trend, setTrend] = useState<RatingTrendProps[]>([]);
  const [fetching, setFetching] = useState(true);
  const [version, setVersion] = useState<number>(0);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const getPlayerRatingTrendHandler = async () => {
    if (version < 23000) return;

    try {
      const res = await getPlayerRatingTrend('maimai', version);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setTrend(data.data);
    } catch (error) {
      openRetryModal("获取失败", `${error}`, () => getPlayerRatingTrendHandler());
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!opened) return;

    setFetching(true);
    setTrend([]);
    getPlayerRatingTrendHandler();
  }, [version]);

  useEffect(() => {
    if (!opened || trend.length > 0) return;

    setVersion(context.songList.versions[context.songList.versions.length-1].version);
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
              <Center>
                <Accordion.Control>DX Rating 趋势图</Accordion.Control>
                <Combobox shadow="md" position="bottom-end" width={200}
                  store={combobox}
                  onOptionSubmit={(val) => {
                    setVersion(parseInt(val));
                    combobox.closeDropdown();
                  }}
                  transitionProps={{ transition: 'fade', duration: 100, timingFunction: 'ease' }}
                >
                  <Combobox.Target>
                    <ActionIcon className={classes.actionIcon} variant="subtle" mr="xs" onClick={() => combobox.toggleDropdown()}>
                      <IconDots size={18} stroke={1.5} />
                    </ActionIcon>
                  </Combobox.Target>
                  <Combobox.Dropdown>
                    <Combobox.Group label="游戏版本">
                      <Combobox.Options>
                        {context.songList.versions.map((item) => {
                          if (item.version < 23000) return null;

                          return (
                            <Combobox.Option value={item.version} key={item.version} active={item.version === version}>
                              <Group gap="sm">
                                {item.version === version && <CheckIcon color="gray" size={12}/>}
                                <span>{item.title}</span>
                              </Group>
                            </Combobox.Option>
                          );
                        })}
                      </Combobox.Options>
                    </Combobox.Group>
                  </Combobox.Dropdown>
                </Combobox>
              </Center>
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