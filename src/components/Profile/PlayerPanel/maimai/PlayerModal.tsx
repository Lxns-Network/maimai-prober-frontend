import {
  Accordion, ActionIcon, Center, CheckIcon, Combobox, Container, Grid, Group, Loader, Modal, Paper, ScrollArea, Text,
  useCombobox
} from "@mantine/core";
import { useEffect, useState } from "react";
import { MaimaiPlayerProps } from "@/types/player";
import { getPlayerRatingTrend } from "@/utils/api/player.ts";
import { PlayerContent } from "./PlayerContent.tsx";
import { RatingTrend, RatingTrendProps } from "./RatingTrend.tsx";
import { IconDots } from "@tabler/icons-react";
import classes from "../PlayerModal.module.css";
import { openRetryModal } from "@/utils/modal.tsx";
import { Marquee } from "@/components/Marquee.tsx";
import { useShallow } from "zustand/react/shallow";
import useSongListStore from "@/hooks/useSongListStore.ts";

interface ModalProps {
  player: MaimaiPlayerProps;
  opened: boolean;
  onClose: () => void;
}

export const PlayerModal = ({ player, opened, onClose }: ModalProps) => {
  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state.maimai })),
  )

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
    if (!opened || trend.length > 0 || songList.versions.length === 0) return;

    setVersion(songList.versions[songList.versions.length-1].version);
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
            <Grid>
              <Grid.Col span={6}>
                {player.name_plate && (
                  <Paper className={classes.subParameters}>
                    <Text fz="xs" c="dimmed">姓名框</Text>
                    <Text fz="sm">
                      <Marquee>{player.name_plate.name}</Marquee>
                    </Text>
                  </Paper>
                )}
              </Grid.Col>
              <Grid.Col span={6}>
                {player.frame && (
                  <Paper className={classes.subParameters}>
                    <Text fz="xs" c="dimmed">背景板</Text>
                    <Text fz="sm">
                      <Marquee>{player.frame.name}</Marquee>
                    </Text>
                  </Paper>
                )}
              </Grid.Col>
              <Grid.Col span={6}>
                <Paper className={classes.subParameters}>
                  <Text fz="xs" c="dimmed">上次同步时间</Text>
                  <Text fz="sm">
                    <Marquee>{(new Date(Date.parse(player.upload_time))).toLocaleString()}</Marquee>
                  </Text>
                </Paper>
              </Grid.Col>
            </Grid>
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
                        {songList.versions.map((item) => {
                          if (item.version < 23000) return null;

                          return (
                            <Combobox.Option value={item.version.toString()} key={item.version} active={item.version === version}>
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