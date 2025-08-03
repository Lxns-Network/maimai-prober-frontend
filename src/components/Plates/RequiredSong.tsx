import React, { useEffect, useState } from "react";
import { useElementSize, useMediaQuery } from "@mantine/hooks";
import {
  ActionIcon, Badge, Box, Card, Center, Flex, Grid, Group, Image, LoadingOverlay, Pagination, rem, RingProgress,
  SegmentedControl, SimpleGrid, Space, Text, ThemeIcon
} from "@mantine/core";
import classes from "../../pages/Page.module.css";
import { IconCheck } from "@tabler/icons-react";
import { PhotoView } from "react-photo-view";
import { Marquee } from "../Marquee.tsx";
import { ASSET_URL } from "../../main.tsx";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { CollectionProps } from "@/types/player";

const RequiredSongRingProgress = ({ collection }: { collection: CollectionProps }) => {
  if (!collection || !collection.required) {
    return;
  }

  if (collection.required.every((required) => required.completed)) {
    return (
      <RingProgress
        sections={[{ value: 100, color: 'teal' }]}
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
      required.songs.forEach((song) => {
        total += required.difficulties.length;
        completed += (song.completed_difficulties || []).length;
      });
    });
    if (total === 0) return 0;
    return Math.round(completed / total * 100);
  }

  return (
    <RingProgress
      roundCaps
      sections={[{ value: calculateCompletion(), color: 'blue' }]}
      label={
        <Text c="blue" fw={700} ta="center" size="xl">
          {calculateCompletion()}%
        </Text>
      }
    />
  );
}

export const RequiredSong = ({ collection, records, style }: { collection: CollectionProps | null, records: any[], style?: React.CSSProperties; }) => {
  if (!collection) return null;

  const { height, ref } = useElementSize();

  const [animationRef] = useAutoAnimate();
  const [difficulties, setDifficulties] = useState<number[]>([0, 1, 2, 3]);
  const [difficulty, setDifficulty] = useState<number>(0);
  const small = useMediaQuery(`(max-width: 450px)`);

  const pageSize = 20;
  const [page, setPage] = useState(1);
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [displayRecords, setDisplayRecords] = useState<any[]>([]);

  useEffect(() => {
    setPage(1);
    if (collection.required) {
      setDifficulties(collection.required.map((required) => required.difficulties).flat());
    }
  }, [collection]);

  useEffect(() => {
    if (difficulty === 4) {
      setPage(1);
    }
    setFilteredRecords(records.filter((record) => {
      return collection.required && collection.required.every((required) => {
        if (required.difficulties.includes(difficulty || 0)) {
          return required.songs.some((song) => {
            return song.title === record.title && song.type === record.type;
          });
        }
        return true;
      })
    }));
  }, [difficulty]);

  useEffect(() => {
    // 防止动画导致 SegmentedControl 无法正常渲染
    setTimeout(() => {
      setDifficulty(0);
      setTimeout(() => {
        setDifficulty(difficulties.length - 1)
      }, 0);
    }, 250);
  }, [difficulties]);

  useEffect(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setDisplayRecords(filteredRecords.slice(start, end));
  }, [page, filteredRecords]);

  const difficultyProgress = (collection.required || []).reduce((acc, req) => {
    if (difficulty === undefined) return acc;
    if (!req.difficulties.includes(difficulty)) return acc;

    const songsTotal = req.songs.length;
    const songsCompleted = req.songs.filter(song =>
      song.completed_difficulties && song.completed_difficulties.includes(difficulty)
    ).length;

    return {
      total: acc.total + songsTotal,
      completed: acc.completed + songsCompleted
    };
  }, { total: 0, completed: 0 });

  return (
    <Card radius="md" p="md" withBorder className={classes.card} style={style}>
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
              <Text fz="xs" c="dimmed">曲目范围</Text>
              <Marquee>
                <Text fz="sm">{((collection && collection.description) || "").split("/")[0]}</Text>
              </Marquee>
            </Grid.Col>
            {collection && collection.required && (
              <Grid.Col span={6} h={height}>
                {collection.required[0].fc && (
                  <div>
                    <Text fz="xs" c="dimmed">全连要求</Text>
                    <Image w={rem(30)} ml={-3} src={`/assets/maimai/music_icon/${collection.required[0].fc}.webp`} />
                  </div>
                )}
                {collection.required[0].fs && (
                  <div>
                    <Text fz="xs" c="dimmed">全同步要求</Text>
                    <Image w={rem(30)} ml={-3} src={`/assets/maimai/music_icon/${collection.required[0].fs}.webp`} />
                  </div>
                )}
                {collection.required[0].rate && (
                  <div>
                    <Text fz="xs" c="dimmed">达成率要求</Text>
                    <Image w={rem(64)} ml={-8} src={`/assets/maimai/music_rank/${collection.required[0].rate}.webp`} />
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
      <Text fz="xs" c="dimmed" mt="md">要求难度</Text>
      {difficulties.length === 0 && (
        <Text fz="sm">
          任意难度
        </Text>
      )}
      <SegmentedControl
        orientation={
          small && difficulties.length > 4 ? "vertical" : "horizontal"
        }
        size="xs"
        mt={4}
        data={[
          ...difficulties.map((difficulty) => ({
            label: ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'][difficulty],
            value: difficulty.toString(),
          })),
        ]}
        value={difficulty.toString()}
        onChange={(value) => setDifficulty(parseInt(value))}
      />
      <Space h="md" />
      <Text fz="xs" c="dimmed">已完成 {difficultyProgress.completed} / {difficultyProgress.total} 首：</Text>
      <Space h="xs" />
      <SimpleGrid cols={2} ref={animationRef}>
        {displayRecords.map((record) => (
          <Group key={record.id} wrap="nowrap" gap="xs">
            <Box pos="relative" h={40}>
              <LoadingOverlay overlayProps={{ radius: "sm", backgroundOpacity: 0.9 }} visible={
                record.completed_difficulties && record.completed_difficulties.includes(difficulty || 0)
              } loaderProps={{ children: (
                <ThemeIcon variant="light" color="teal" size={40}>
                  <IconCheck />
                </ThemeIcon>
              )}} zIndex={1} />
              <PhotoView src={`${ASSET_URL}/maimai/jacket/${record.id}.png`}>
                <Image h={40} w={40} radius="sm" src={`${ASSET_URL}/maimai/jacket/${record.id}.png!webp`} />
              </PhotoView>
            </Box>
            <div>
              <Text size="sm" fw={500} lineClamp={1}>
                {record.title}
              </Text>
              {record.type === "standard" ? (
                <Badge variant="filled" color="blue" size="sm">标准</Badge>
              ) : (
                <Badge variant="filled" color="orange" size="sm">DX</Badge>
              )}
            </div>
          </Group>
        ))}
      </SimpleGrid>
      <Center>
        <Pagination
          hideWithOnePage
          size="sm"
          mt="md"
          total={Math.ceil(filteredRecords.length / pageSize)}
          value={page}
          onChange={(page) => setPage(page)}
        />
      </Center>
    </Card>
  )
}