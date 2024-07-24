import { useEffect, useState } from "react";
import { useElementSize, useMediaQuery } from "@mantine/hooks";
import {
  ActionIcon,
  Badge,
  Box,
  Card, Center, Flex,
  Grid,
  Group,
  Image,
  LoadingOverlay, Pagination,
  rem, RingProgress,
  SegmentedControl,
  SimpleGrid,
  Space,
  Text,
  ThemeIcon
} from "@mantine/core";
import classes from "../../pages/Page.module.css";
import { IconCheck } from "@tabler/icons-react";
import { PlateDataProps } from "../../pages/user/Plates.tsx";
import { PhotoView } from "react-photo-view";
import { CustomMarquee } from "../CustomMarquee.tsx";

const RequiredSongRingProgress = ({ plate }: { plate: PlateDataProps }) => {
  if (!plate || !plate.required) {
    return;
  }

  if (plate.required.every((required) => required.completed)) {
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
    (plate.required || []).forEach((required) => {
      required.songs.forEach((song) => {
        total += required.difficulties.length;
        completed += song.completed_difficulties.length;
      });
    });
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

export const RequiredSong = ({ plate, records }: { plate: PlateDataProps , records: any[] }) => {
  const [difficulties, setDifficulties] = useState<number[]>([0, 1, 2, 3]);
  const [difficulty, setDifficulty] = useState<number>(0);
  const { height, ref } = useElementSize();
  const small = useMediaQuery(`(max-width: 450px)`);

  const pageSize = 20;
  const [page, setPage] = useState(1);
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [displayRecords, setDisplayRecords] = useState<any[]>([]);

  useEffect(() => {
    setPage(1);
    setDifficulty(0);
    if (plate.required) {
      setDifficulties(plate.required.map((required) => required.difficulties).flat());
    }
  }, [plate]);

  useEffect(() => {
    if (difficulty === 4) {
      setPage(1);
    }
    setFilteredRecords(records.filter((record) => {
      return plate.required && plate.required.every((required) => {
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
    setDifficulty(difficulties.length - 1);
  }, [difficulties]);

  useEffect(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setDisplayRecords(filteredRecords.slice(start, end));
  }, [page, filteredRecords]);

  const difficultyProgress = (plate.required || []).reduce((acc, req) => {
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
    <Card radius="md" p="md" withBorder className={classes.card}>
      <Flex>
        <div style={{ flex: 1 }}>
          <Text fz="lg" fw={700}>
            要求曲目
          </Text>
          <Text c="dimmed" size="xs">
            查询姓名框要求曲目的完成度
          </Text>
          <Space h="md" />
          <Grid grow h={height}>
            <Grid.Col span={6} ref={ref}>
              <Text fz="xs" c="dimmed">曲目范围</Text>
              <CustomMarquee>
                <Text fz="sm">{((plate && plate.description) || "").split("/")[0]}</Text>
              </CustomMarquee>
            </Grid.Col>
            <Grid.Col span={6}>
              {plate && plate.required && plate.required[0].fc && (
                <div>
                  <Text fz="xs" c="dimmed">FULL COMBO 要求</Text>
                  <Image w={rem(30)} ml={-3} src={`/assets/maimai/music_icon/${plate.required[0].fc}.webp`} />
                </div>
              )}
              {plate && plate.required && plate.required[0].fs && (
                <div>
                  <Text fz="xs" c="dimmed">FULL SYNC 要求</Text>
                  <Image w={rem(30)} ml={-3} src={`/assets/maimai/music_icon/${plate.required[0].fs}.webp`} />
                </div>
              )}
              {plate && plate.required && plate.required[0].rate && (
                <div>
                  <Text fz="xs" c="dimmed">达成率要求</Text>
                  <Image w={rem(64)} ml={-8} src={`/assets/maimai/music_rank/${plate.required[0].rate}.webp`} />
                </div>
              )}
            </Grid.Col>
          </Grid>
        </div>
        <Box h={height}>
          <RequiredSongRingProgress plate={plate} />
        </Box>
      </Flex>
      <Space h="md" />
      <Text fz="xs" c="dimmed" mb={4}>要求难度</Text>
      <SegmentedControl orientation={
        small && difficulties.length > 4 ? "vertical" : "horizontal"
      } size="xs" fullWidth data={[
        ...difficulties.map((difficulty) => ({
          label: ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'][difficulty],
          value: difficulty.toString(),
        })),
      ]} value={difficulty.toString()} onChange={(value) => setDifficulty(parseInt(value))} />
      <Space h="md" />
      <Text fz="xs" c="dimmed">已完成 {difficultyProgress.completed} / {difficultyProgress.total} 首：</Text>
      <Space h="xs" />
      <SimpleGrid cols={2}>
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
              <PhotoView src={`https://assets.lxns.net/maimai/jacket/${record.id}.png`}>
                <Image h={40} w={40} radius="sm" src={`https://assets.lxns.net/maimai/jacket/${record.id}.png!webp`} />
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
      <Space h="md" />
      <Center>
        <Pagination hideWithOnePage size="sm" total={Math.ceil(filteredRecords.length / pageSize)} value={page} onChange={(page) => setPage(page)} />
      </Center>
    </Card>
  )
}