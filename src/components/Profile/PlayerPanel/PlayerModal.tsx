import { useCallback, useEffect, useState } from "react";
import { MaimaiRatingTrend, MaimaiRatingTrendProps } from "./maimai/RatingTrend.tsx";
import { ChunithmRatingTrend, ChunithmRatingTrendProps } from "./chunithm/RatingTrend.tsx";
import {
  Accordion, ActionIcon, Center, CheckIcon, Combobox, Container, Group, Loader, Modal, Paper, ScrollArea, useCombobox,
  Text,
} from "@mantine/core";
import { getPlayerRatingTrend, updatePlayerData } from "@/utils/api/player.ts";
import { openRetryModal } from "@/utils/modal.tsx";
import { MaimaiPlayerContent } from "./maimai/PlayerContent.tsx";
import classes from "./PlayerModal.module.css";
import { IconDots, IconEdit } from "@tabler/icons-react";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { MaimaiPlayerModalContent } from "./maimai/PlayerModal.tsx";
import { Game } from "@/types/game";
import { ChunithmPlayerModalContent } from "./chunithm/PlayerModal.tsx";
import { ChunithmPlayerContent } from "./chunithm/PlayerContent.tsx";
import { isChunithmPlayerProps, isMaimaiPlayerProps } from "@/utils/api/player.ts";
import { Collection, EditCollectionModal } from "./EditCollectionModal.tsx";
import { Marquee } from "@/components/Marquee.tsx";
import { useMediaQuery } from "@mantine/hooks";
import { usePlayer } from "@/hooks/swr/usePlayer.ts";

interface EditButtonProps {
  title: string;
  description: string;
  onClick: () => void;
}

export const EditButton = ({ title, description, onClick }: EditButtonProps) => {
  return (
    <Paper className={[classes.subParameters, classes.subParametersButton].join(' ')} onClick={onClick}>
      <Group justify="space-between" wrap="nowrap" gap="xs">
        <div>
          <Text fz="xs" c="dimmed">{title}</Text>
          <Text fz="sm">
            <Marquee>{description}</Marquee>
          </Text>
        </div>

        <IconEdit size={20} color="gray" />
      </Group>
    </Paper>
  )
}

interface PlayerContentProps {
  player: MaimaiPlayerProps | ChunithmPlayerProps;
  onCollectionEdit?: (collectionType: Collection, defaultValue: number) => void;
  editable: boolean;
}

export const PlayerContent = ({ player, onCollectionEdit, editable }: PlayerContentProps) => {
  const props = { onCollectionEdit, editable };
  return (
    <Container>
      {isMaimaiPlayerProps(player) && <MaimaiPlayerContent player={player} {...props} />}
      {isChunithmPlayerProps(player) && <ChunithmPlayerContent player={player} {...props} />}
    </Container>
  )
}

interface ModalProps {
  game: Game;
  player: MaimaiPlayerProps | ChunithmPlayerProps;
  opened: boolean;
  onClose: () => void;
}

const versionData = {
  maimai: [{
    title: "舞萌DX 2025",
    version: 25000,
  }, {
    title: "舞萌DX 2024",
    version: 24000,
  }, {
    title: "舞萌DX 2023",
    version: 23000,
  }],
  chunithm: [{
    title: "中二节奏 2026",
    version: 23000,
  }, {
    title: "中二节奏 2025",
    version: 22000,
  }, {
    title: "中二节奏 2024",
    version: 20500,
  }],
};

export const PlayerModal = ({ game, player, opened, onClose }: ModalProps) => {
  const { mutate } = usePlayer(game);
  const [trend, setTrend] = useState<(MaimaiRatingTrendProps | ChunithmRatingTrendProps)[]>([]);
  const [fetching, setFetching] = useState(true);
  const [version, setVersion] = useState<number>(0);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });
  const small = useMediaQuery('(max-width: 30rem)');

  const [editCollectionOpened, setEditCollectionOpened] = useState(false);
  const [editCollectionType, setEditCollectionType] = useState<Collection>("icons");
  const [editCollectionValue, setEditCollectionValue] = useState<number>(0);

  const updatePlayerDataHandler = useCallback(async (player: Partial<MaimaiPlayerProps> | Partial<ChunithmPlayerProps>) => {
    try {
      const res = await updatePlayerData(game, player);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      await mutate();
    } catch (error) {
      openRetryModal("更新失败", `${error}`, () => updatePlayerDataHandler(player));
    }
  }, [game]);

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
    <Modal.Root
      size="lg"
      opened={opened}
      onClose={() => onClose()}
      fullScreen={small}
      transitionProps={{
        transition: small ? 'pop' : 'fade-down',
      }}
      centered
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>玩家详情</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p={0}>
          <EditCollectionModal
            game={game}
            type={editCollectionType}
            defaultValue={editCollectionValue}
            opened={editCollectionOpened}
            onCancel={() => setEditCollectionOpened(false)}
            onSubmit={(key, id) => {
              updatePlayerDataHandler({
                [key]: { id },
              });
              setEditCollectionOpened(false);
            }}
          />
          <ScrollArea pb="md">
            <PlayerContent
              player={player}
              onCollectionEdit={(collectionType, defaultValue) => {
                setEditCollectionType(collectionType);
                setEditCollectionValue(defaultValue);
                setEditCollectionOpened(true);
              }}
              editable={true}
            />
          </ScrollArea>
          {isMaimaiPlayerProps(player) && (
            <MaimaiPlayerModalContent
              player={player}
              onCollectionEdit={(collectionType, defaultValue) => {
                setEditCollectionType(collectionType);
                setEditCollectionValue(defaultValue);
                setEditCollectionOpened(true);
              }}
            />
          )}
          {isChunithmPlayerProps(player) && (
            <ChunithmPlayerModalContent
              player={player}
              onCollectionEdit={(collectionType, defaultValue) => {
                setEditCollectionType(collectionType);
                setEditCollectionValue(defaultValue);
                setEditCollectionOpened(true);
              }}
            />
          )}
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