import React, { useEffect, useMemo, useRef, useState } from "react";
import { useElementSize, useMediaQuery } from "@mantine/hooks";
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Card,
  Center,
  Flex,
  Grid,
  Group,
  Image,
  Loader,
  LoadingOverlay,
  rem,
  RingProgress,
  SegmentedControl,
  Space,
  Text,
  ThemeIcon,
} from "@mantine/core";
import classes from "../../pages/Page.module.css";
import { IconCheck } from "@tabler/icons-react";
import { PhotoView } from "react-photo-view";
import { Marquee } from "../Marquee.tsx";
import { ASSET_URL } from "@/main";
import { AnimatedGrid } from "@/components/AnimatedGrid.tsx";
import { motion } from "motion/react";
import { CollectionProps, CollectionRequiredSongProps } from "@/types/player";
import { Link } from "@/components/Link";
import useFixedGame from "@/hooks/useFixedGame.ts";
import { Game } from "@/types/game";
import { ResponsivePagination } from "@/components/ResponsivePagination.tsx";

const RequiredSongRingProgress = ({ collection }: { collection: CollectionProps }) => {
  if (!collection || !collection.required) {
    return;
  }

  if (collection.required.every((required) => required.completed)) {
    return (
      <RingProgress
        sections={[{ value: 100, color: "teal" }]}
        label={
          <Center>
            <ActionIcon color="teal" variant="light" radius="xl" size={44}>
              <IconCheck size={22} />
            </ActionIcon>
          </Center>
        }
      />
    );
  }

  const calculateCompletion = () => {
    let total = 0;
    let completed = 0;
    (collection.required || []).forEach((required) => {
      (required.songs || []).forEach((song) => {
        total += required.difficulties.length;
        completed += (song.completed_difficulties || []).length;
      });
    });
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  return (
    <RingProgress
      roundCaps
      sections={[{ value: calculateCompletion(), color: "var(--mantine-primary-color-filled)" }]}
      label={
        <Text c="var(--mantine-primary-color-light-color)" fw={700} ta="center" size="xl">
          {calculateCompletion()}%
        </Text>
      }
    />
  );
};

const difficultyData: Record<Game, string[]> = {
  maimai: ["BASIC", "ADVANCED", "EXPERT", "MASTER", "Re:MASTER"],
  chunithm: ["BASIC", "ADVANCED", "EXPERT", "MASTER", "ULTIMA"],
};

export const RequiredSong = ({
  collection,
  records,
  loading,
  style,
}: {
  collection: CollectionProps | null;
  records: CollectionRequiredSongProps[];
  loading?: boolean;
  style?: React.CSSProperties;
}) => {
  const { height, ref } = useElementSize();

  const [game] = useFixedGame();
  const [difficulty, setDifficulty] = useState<number>(0);
  const small = useMediaQuery(`(max-width: 450px)`);

  const pageSize = 20;
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  const difficulties = useMemo(
    () => collection?.required?.flatMap((required) => required.difficulties) ?? [],
    [collection],
  );
  const filteredRecords = useMemo(() => {
    if (!collection?.required) return [];

    return records.filter((record) =>
      collection.required!.every((required) => {
        if (!required.difficulties.includes(difficulty)) return true;
        return (required.songs || []).some(
          (song) => song.title === record.title && song.type === record.type,
        );
      }),
    );
  }, [collection, difficulty, records]);
  const displayRecords = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, page]);

  useEffect(() => {
    setPage(1);
  }, [collection]);

  useEffect(() => {
    if (difficulty === 4) {
      setPage(1);
    }
  }, [difficulty]);

  useEffect(() => {
    if (difficulties.length === 0) return;
    // 防止动画导致 SegmentedControl 无法正常渲染
    let selectionTimeout: ReturnType<typeof setTimeout> | undefined;
    const resetTimeout = setTimeout(() => {
      setDifficulty(0);
      selectionTimeout = setTimeout(() => {
        setDifficulty(difficulties[difficulties.length - 1]);
      }, 0);
    }, 250);

    return () => {
      clearTimeout(resetTimeout);
      if (selectionTimeout) clearTimeout(selectionTimeout);
    };
  }, [difficulties]);

  if (!collection) return null;

  const difficultyProgress = (collection.required || []).reduce(
    (acc, req) => {
      if (difficulty === undefined) return acc;
      if (!(req.difficulties || []).includes(difficulty) && req.difficulties.length != 0)
        return acc;

      const songsTotal = (req.songs || []).length;
      const songsCompleted = (req.songs || []).filter(
        (song) => song.completed_difficulties && song.completed_difficulties.includes(difficulty),
      ).length;

      return {
        total: acc.total + songsTotal,
        completed: acc.completed + songsCompleted,
      };
    },
    { total: 0, completed: 0 },
  );

  const totalPages = Math.ceil(filteredRecords.length / pageSize);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Card
      ref={topRef}
      radius="md"
      p="md"
      withBorder
      className={classes.card}
      style={{ ...style, scrollMarginTop: 16 }}
    >
      <Flex>
        <div style={{ flex: 1 }}>
          <Text fz="lg" fw={700}>
            要求曲目
          </Text>
          <Text c="dimmed" size="xs">
            查询收藏品要求曲目的完成度
          </Text>
          <Space h="md" />
          <Grid grow>
            <Grid.Col span={6} ref={ref}>
              <Text fz="xs" c="dimmed">
                曲目范围
              </Text>
              <Marquee>
                <Text fz="sm">
                  {(() => {
                    const result = /(.+)の全ての譜面/.exec(collection?.description || "");
                    if (result) {
                      return result[1];
                    }
                    return (collection?.description || "没有描述").split("/")[0];
                  })()}
                </Text>
              </Marquee>
            </Grid.Col>
            {collection?.required?.[0] &&
              (["fc", "fs", "rate", "full_combo", "full_chain", "rank"] as const).some(
                (key) => collection.required![0][key],
              ) && (
                <Grid.Col span={6} h={height}>
                  {collection.required[0].fc && (
                    <div>
                      <Text fz="xs" c="dimmed">
                        全连要求
                      </Text>
                      <Image
                        w={rem(30)}
                        ml={-3}
                        src={`/assets/maimai/music_icon/${collection.required[0].fc}.webp`}
                      />
                    </div>
                  )}
                  {collection.required[0].fs && (
                    <div>
                      <Text fz="xs" c="dimmed">
                        全同步要求
                      </Text>
                      <Image
                        w={rem(30)}
                        ml={-3}
                        src={`/assets/maimai/music_icon/${collection.required[0].fs}.webp`}
                      />
                    </div>
                  )}
                  {collection.required[0].rate && (
                    <div>
                      <Text fz="xs" c="dimmed">
                        达成率要求
                      </Text>
                      <Image
                        w={rem(64)}
                        ml={-8}
                        src={`/assets/maimai/music_rank/${collection.required[0].rate}.webp`}
                      />
                    </div>
                  )}
                  {collection.required[0].full_combo && (
                    <div>
                      <Text fz="xs" c="dimmed">
                        全连要求
                      </Text>
                      <Image
                        w={rem(94)}
                        mt={2}
                        src={`/assets/chunithm/music_icon/${collection.required[0].full_combo}.webp`}
                      />
                    </div>
                  )}
                  {collection.required[0].full_chain && (
                    <div>
                      <Text fz="xs" c="dimmed">
                        全同步要求
                      </Text>
                      <Image
                        w={rem(94)}
                        mt={2}
                        src={`/assets/chunithm/music_icon/${collection.required[0].full_chain}.webp`}
                      />
                    </div>
                  )}
                  {collection.required[0].rank && (
                    <div>
                      <Text fz="xs" c="dimmed">
                        分数要求
                      </Text>
                      <Image
                        w={rem(94)}
                        mt={2}
                        src={`/assets/chunithm/music_rank/${collection.required[0].rank}.webp`}
                      />
                    </div>
                  )}
                </Grid.Col>
              )}
          </Grid>
        </div>
        <Box h={height}>
          <RequiredSongRingProgress collection={collection} />
        </Box>
      </Flex>
      <Text fz="xs" c="dimmed" mt="md">
        要求难度
      </Text>
      {difficulties.length === 0 ? (
        <Text fz="sm">任意难度</Text>
      ) : (
        <SegmentedControl
          orientation={small && difficulties.length > 4 ? "vertical" : "horizontal"}
          size="xs"
          mt={4}
          data={[
            ...difficulties.map((difficulty) => ({
              label: difficultyData[game][difficulty],
              value: difficulty.toString(),
            })),
          ]}
          value={difficulty.toString()}
          onChange={(value) => setDifficulty(parseInt(value))}
        />
      )}
      <Space h="md" />
      <Text fz="xs" c="dimmed">
        已完成 {difficultyProgress.completed} / {difficultyProgress.total} 首：
      </Text>
      <Space h="xs" />
      {loading && (
        <Center>
          <Loader />
        </Center>
      )}
      <AnimatedGrid
        items={displayRecords}
        getKey={(record) => String(record.id)}
        cols={2}
        spacing="md"
        renderItem={(record) => (
          <Group wrap="nowrap" gap="xs">
            <Box pos="relative" h={40}>
              <LoadingOverlay
                overlayProps={{ radius: "sm", backgroundOpacity: 0.9 }}
                visible={
                  record.completed_difficulties &&
                  record.completed_difficulties.includes(difficulty || 0)
                }
                loaderProps={{
                  children: (
                    <ThemeIcon variant="light" color="teal" size={40}>
                      <IconCheck />
                    </ThemeIcon>
                  ),
                }}
                zIndex={1}
              />
              <PhotoView src={`${ASSET_URL}/${game}/jacket/${record.id}.png`}>
                <Image
                  h={40}
                  w={40}
                  radius="sm"
                  src={`${ASSET_URL}/${game}/jacket/${record.id}.png!webp`}
                />
              </PhotoView>
            </Box>
            <div>
              <Anchor
                size="sm"
                fw={500}
                lineClamp={1}
                component={Link}
                to={`/songs?game=${game}&song_id=${record.id}`}
                style={{
                  color: "var(--mantine-color-text)",
                }}
              >
                {record.title}
              </Anchor>
              {game === "maimai" && (
                <>
                  {record.type === "standard" ? (
                    <Badge variant="filled" color="blue" size="sm">
                      标准
                    </Badge>
                  ) : (
                    <Badge variant="filled" color="orange" size="sm">
                      DX
                    </Badge>
                  )}
                </>
              )}
            </div>
          </Group>
        )}
      />
      {totalPages > 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Center>
            <ResponsivePagination
              mt="md"
              total={totalPages}
              value={page}
              onChange={handlePageChange}
            />
          </Center>
        </motion.div>
      )}
    </Card>
  );
};
