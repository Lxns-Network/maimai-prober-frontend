import { useEffect, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import {
  Badge,
  Box,
  Card,
  Group,
  Image,
  LoadingOverlay, Pagination,
  rem,
  SegmentedControl,
  SimpleGrid,
  Space,
  Text,
  ThemeIcon
} from "@mantine/core";
import classes from "../../pages/Page.module.css";
import Icon from "@mdi/react";
import { mdiCheck } from "@mdi/js";
import { IconCheck } from "@tabler/icons-react";
import { PlateDataProps } from "../../pages/user/Plates.tsx";

export const RequiredSong = ({ plate, records }: { plate: PlateDataProps , records: any[] }) => {
  const [difficulties, setDifficulties] = useState<number[]>([0, 1, 2, 3]);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const small = useMediaQuery(`(max-width: 450px)`);

  const pageSize = 20;
  const [page, setPage] = useState(1);
  const [displayRecords, setDisplayRecords] = useState<any[]>([]);

  useEffect(() => {
    setPage(1);

    if (plate.required) {
      setDifficulties(plate.required.map((required) => required.difficulties).flat());
    }
  }, [plate]);

  useEffect(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setDisplayRecords(records.slice(start, end));
  }, [page, records]);

  return (
    <Card mt="md" radius="md" p="md" withBorder className={classes.card}>
      <Group justify="space-between">
        <div>
          <Text fz="lg" fw={700}>
            要求曲目
          </Text>
          <Text c="dimmed" size="xs">
            查询姓名框要求曲目的完成度
          </Text>
        </div>
        {plate && plate.required && plate.required.every((required) => required.completed) && (
          <ThemeIcon variant="light" color="teal" size="xl" radius="xl">
            <Icon path={mdiCheck} size={10} />
          </ThemeIcon>
        )}
      </Group>
      <Space h="md" />
      <Group grow align="flex-start" h={40}>
        <div>
          <Text fz="xs" c="dimmed">曲目范围</Text>
          <Text fz="sm">{((plate && plate.description) || "").split("/")[0]}</Text>
        </div>
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
      </Group>
      <Space h="md" />
      <Text fz="xs" c="dimmed" mb={4}>要求难度</Text>
      <SegmentedControl orientation={
        small && difficulties.length > 4 ? "vertical" : "horizontal"
      } size="xs" fullWidth data={[
        ...difficulties.map((difficulty) => ({
          label: ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'][difficulty],
          value: difficulty.toString(),
        })),
      ]} value={difficulty?.toString()} onChange={(value) => setDifficulty(parseInt(value || ''))} />
      <Space h="lg" />
      <SimpleGrid cols={2}>
        {displayRecords.map((record) => (
          <Group key={record.id} wrap="nowrap" gap="xs">
            <Box pos="relative" h={40}>
              <LoadingOverlay overlayProps={{ radius: "sm", backgroundOpacity: 0.9 }} visible={
                record.completed_difficulties.includes(difficulty || 0)
              } loaderProps={{ children: (
                  <ThemeIcon variant="light" color="teal" size={40}>
                    <IconCheck />
                  </ThemeIcon>
                )}} />
              <Image h={40} w={40} radius="sm" src={`https://assets.lxns.net/maimai/jacket/${record.id}.png!webp`} />
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
      <Group justify="center">
        <Pagination size="sm" total={Math.ceil(records.length / pageSize)} value={page} onChange={(page) => setPage(page)} />
      </Group>
    </Card>
  )
}