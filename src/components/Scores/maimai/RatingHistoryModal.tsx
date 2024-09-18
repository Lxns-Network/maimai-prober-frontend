import {
  AspectRatio,
  Divider,
  Flex,
  Group,
  Image,
  Modal,
  ScrollArea,
  Stack,
  Text,
  ThemeIcon
} from "@mantine/core";
import { useEffect, useState } from "react";
import { MaimaiDifficultyProps, MaimaiSongProps } from "@/utils/api/song/maimai.tsx";
import { fetchAPI } from "@/utils/api/api.tsx";
import { IconArrowBigDownFilled, IconArrowBigRightFilled, IconArrowBigUpFilled } from "@tabler/icons-react";
import { useScrollIntoView } from "@mantine/hooks";

interface RatingHistoryModalProps {
  song?: MaimaiSongProps | null;
  difficulty?: MaimaiDifficultyProps | null;
  opened: boolean;
  onClose: (score?: any) => void;
}

const HISTORY_VERSION_LIST = [20000, 21000, 22000, 23000, 24000];

export const MaimaiRatingHistoryModal = ({ song, difficulty, opened, onClose }: RatingHistoryModalProps) => {
  const { scrollIntoView, targetRef, scrollableRef } = useScrollIntoView<
    HTMLDivElement,
    HTMLDivElement
  >({ axis: 'x', duration: 0 });
  const [ratings, setRatings] = useState<number[]>([]);

  const getSongDetailHandler = async (id: number, version: number) => {
    const res = await fetchAPI(`maimai/song/${id}?version=${version}`, {
      method: "GET",
    });
    if (res.status === 404) return null;
    return await res.json();
  }

  useEffect(() => {
    if (!opened || !song || !difficulty) return;

    Promise.all(
      HISTORY_VERSION_LIST.map((version) => {
        if (version < Math.max(...HISTORY_VERSION_LIST.filter(n => n <= song.version))) {
          return Promise.resolve(null);
        }
        if (version >= HISTORY_VERSION_LIST[HISTORY_VERSION_LIST.length - 1]) {
          return Promise.resolve(song);
        }
        return getSongDetailHandler(song.id, version)
      })
    ).then((data) => {
      setRatings(data.map((d: any, i: number) => {
        if (!d && data[i-1] && data[i-1].difficulties[difficulty.type].length !== 0)
          return -Math.abs(data[i-1].difficulties[difficulty.type][difficulty.difficulty].level_value); // 设为负数表示删除曲，但保留定数
        if (!d || difficulty.difficulty >= d.difficulties[difficulty.type].length) return 0;
        return d.difficulties[difficulty.type][difficulty.difficulty].level_value;
      }));
    }).catch((error) => {
      console.error(error);
    });
  }, [opened]);

  useEffect(() => {
    setTimeout(() => {
      scrollIntoView();
    }, 50);
  }, [ratings]);

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
            <Flex mb="xs">
              {HISTORY_VERSION_LIST.map((version, index) => (
                <Stack key={version} gap="xs" ref={
                  index === HISTORY_VERSION_LIST.length - 1 ? targetRef : null
                }>
                  {ratings[index] ? <>
                    <AspectRatio ratio={332 / 160}>
                      <Image w={100} src={`/assets/maimai/version/${version}.webp`} />
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
                    <AspectRatio ratio={332 / 160}>
                      <Image w={100} style={{ opacity: 0.3 }} src={`/assets/maimai/version/${version}.webp`} />
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