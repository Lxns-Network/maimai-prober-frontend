import { useCallback, useEffect, useState } from "react";
import { MaimaiRatingTrend, MaimaiRatingTrendProps } from "./maimai/RatingTrend.tsx";
import { ChunithmRatingTrend, ChunithmRatingTrendProps } from "./chunithm/RatingTrend.tsx";
import {
  Accordion, ActionIcon, Center, CheckIcon, Combobox, Container, Group, Loader, Modal, ScrollArea, useCombobox
} from "@mantine/core";
import { getPlayerRatingTrend } from "@/utils/api/player.ts";
import { openRetryModal } from "@/utils/modal.tsx";
import { MaimaiPlayerContent } from "./maimai/PlayerContent.tsx";
import classes from "./PlayerModal.module.css";
import { IconDots } from "@tabler/icons-react";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { MaimaiPlayerModalContent } from "./maimai/PlayerModal.tsx";
import { Game } from "@/types/game";
import { ChunithmPlayerModalContent } from "./chunithm/PlayerModal.tsx";
import { ChunithmPlayerContent } from "./chunithm/PlayerContent.tsx";
import { isChunithmPlayerProps, isMaimaiPlayerProps } from "@/utils/api/player.ts";

interface ModalProps {
  game: Game;
  player: MaimaiPlayerProps | ChunithmPlayerProps;
  opened: boolean;
  onClose: () => void;
}

const versionData = {
  maimai: [{
    title: "舞萌DX 2024",
    version: 24000,
  }, {
    title: "舞萌DX 2023",
    version: 23000,
  }],
  chunithm: [{
    title: "中二节奏 2025",
    version: 22000,
  }, {
    title: "中二节奏 2024",
    version: 20500,
  }],
};

export const PlayerModal = ({ game, player, opened, onClose }: ModalProps) => {
  const [trend, setTrend] = useState<(MaimaiRatingTrendProps | ChunithmRatingTrendProps)[]>([]);
  const [fetching, setFetching] = useState(true);
  const [version, setVersion] = useState<number>(0);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const getPlayerRatingTrendHandler = useCallback(async () => {
    if (!version || versionData[game].map((item) => item.version).indexOf(version) === -1) {
      return;
    }

    try {
      const res = await getPlayerRatingTrend(game, version);
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
  }, [game, version]);

  useEffect(() => {
    setFetching(true);
    getPlayerRatingTrendHandler();
  }, [version, getPlayerRatingTrendHandler]);

  useEffect(() => {
    if (!opened || trend.length > 0) return;

    setVersion(versionData[game][0].version);
  }, [opened, game, trend.length]);

  useEffect(() => {
    setTrend([]);
  }, [game]);

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
              {isMaimaiPlayerProps(player) && <MaimaiPlayerContent player={player} />}
              {isChunithmPlayerProps(player) && <ChunithmPlayerContent player={player} />}
            </Container>
          </ScrollArea>
          {isMaimaiPlayerProps(player) && <MaimaiPlayerModalContent player={player} />}
          {isChunithmPlayerProps(player) && <ChunithmPlayerModalContent player={player} />}
          <Accordion chevronPosition="left" variant="filled" radius={0} defaultValue="history">
            <Accordion.Item value="history">
              <Center>
                <Accordion.Control>
                  {game === "maimai" ? "DX Rating 趋势图" : "Rating 趋势图"}
                </Accordion.Control>
                <Combobox
                  shadow="md"
                  position="bottom-end"
                  width={200}
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
                        {versionData[game].map((item) => {
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
                  <>
                    {game === "maimai" && <MaimaiRatingTrend trend={trend as MaimaiRatingTrendProps[]} />}
                    {game === "chunithm" && <ChunithmRatingTrend trend={trend as ChunithmRatingTrendProps[]} />}
                  </>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}