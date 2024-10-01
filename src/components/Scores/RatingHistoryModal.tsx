import { AspectRatio, Divider, Flex, Group, Image, Modal, ScrollArea, Stack, Text, ThemeIcon } from "@mantine/core";
import { useCallback, useEffect, useState } from "react";
import { MaimaiDifficultyProps, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { IconArrowBigDownFilled, IconArrowBigRightFilled, IconArrowBigUpFilled } from "@tabler/icons-react";
import { useLocalStorage, useScrollIntoView } from "@mantine/hooks";
import { ChunithmDifficultyProps, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { getSong } from "@/utils/api/song/song.tsx";
import { Game } from "@/types/game";

interface RatingHistoryModalProps {
  song?: MaimaiSongProps | ChunithmSongProps | null;
  difficulty?: MaimaiDifficultyProps | ChunithmDifficultyProps | null;
  opened: boolean;
  onClose: () => void;
}

const HISTORY_VERSION_LIST = {
  maimai: [20000, 21000, 22000, 23000, 24000],
  chunithm: [20000, 20500, 22000],
};

export const RatingHistoryModal = ({ song, difficulty, opened, onClose }: RatingHistoryModalProps) => {
  const [game] = useLocalStorage<Game>({ key: "game", defaultValue: "maimai" });
  const { scrollIntoView, targetRef, scrollableRef } = useScrollIntoView<
    HTMLDivElement,
    HTMLDivElement
  >({ axis: 'x', duration: 0 });
  const [ratings, setRatings] = useState<number[]>([]);

  const versions = HISTORY_VERSION_LIST[game];
  const ratio = {
    maimai: 332 / 160,
    chunithm: 760 / 336,
  }[game];

  const fetchRatings = useCallback(async () => {
    if (!song || !difficulty) return;

    const data = await Promise.all(
      versions.map((version) => {
        if (version < Math.max(...versions.filter(n => n <= song.version))) {
          return Promise.resolve(null);
        }
        if (version >= versions[versions.length - 1]) {
          return Promise.resolve(song);
        }
        return getSong(game, song.id, version)
      })
    );

    setRatings(data.map((song: MaimaiSongProps | ChunithmSongProps, i: number) => {
      let previousDifficulties, currentDifficulties;
      if (game === "maimai") {
        const d = difficulty as MaimaiDifficultyProps;
        song = song as MaimaiSongProps;
        previousDifficulties = data[i - 1]?.difficulties[d.type];
        currentDifficulties = song?.difficulties[d.type as keyof MaimaiSongProps["difficulties"]];
      } else {
        song = song as ChunithmSongProps;
        previousDifficulties = data[i - 1]?.difficulties;
        currentDifficulties = song?.difficulties;
      }

      if (!song && data[i-1] && previousDifficulties.length !== 0)
        return -Math.abs(previousDifficulties[difficulty.difficulty].level_value); // 设为负数表示删除曲，但保留定数
      if (!song || difficulty.difficulty >= currentDifficulties.length) return 0;
      return currentDifficulties[difficulty.difficulty].level_value;
    }));
  }, [song, difficulty, versions, game]);

  useEffect(() => {
    if (!opened) return;

    fetchRatings();
  }, [opened, fetchRatings]);

  useEffect(() => {
    setTimeout(() => {
      scrollIntoView();
    }, 50);
  }, [ratings, scrollIntoView]);

  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>谱面历史定数</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <ScrollArea viewportRef={scrollableRef}>
            <Flex mb="xs" justify="center">
              {versions.map((version, index) => (
                <Stack key={version} gap="xs" ref={
                  index === versions.length - 1 ? targetRef : null
                }>
                  {ratings[index] ? <>
                    <AspectRatio ratio={ratio}>
                      <Image w={100} src={`/assets/${game}/version/${version}.webp`} />
                    </AspectRatio>
                    <Divider />
                    <Group justify="center" gap={4}>
                      <Text fw={index === ratings.length - 1 ? "bold" : "normal"}>
                        {ratings[index] >= 0 ? ratings[index].toFixed(1) : '-'}
                      </Text>
                      {ratings[index] >= 0 && index - 1 >= 0 && ratings[index - 1] && <>
                        {ratings[index] > Math.abs(ratings[index - 1]) &&
                          <ThemeIcon variant="subtle" size="xs" c="green">
                            <IconArrowBigUpFilled/>
                          </ThemeIcon>
                        }
                        {ratings[index] < Math.abs(ratings[index - 1]) &&
                          <ThemeIcon variant="subtle" size="xs" c="red">
                            <IconArrowBigDownFilled />
                          </ThemeIcon>
                        }
                        {ratings[index] == Math.abs(ratings[index - 1]) &&
                          <ThemeIcon variant="subtle" size="xs" c="gray">
                            <IconArrowBigRightFilled />
                          </ThemeIcon>
                        }
                      </>}
                    </Group>
                  </> : <>
                    <AspectRatio ratio={ratio}>
                      <Image w={100} style={{ opacity: 0.3 }} src={`/assets/${game}/version/${version}.webp`} />
                    </AspectRatio>
                    <Divider />
                    <Text style={{ opacity: 0.3 }} ta="center">/</Text>
                  </>}
                </Stack>
              ))}
            </Flex>
          </ScrollArea>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}