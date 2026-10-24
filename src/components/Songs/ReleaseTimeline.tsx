import { useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Collapse,
  Flex,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Timeline,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconCalendarOff,
  IconChevronDown,
  IconClock,
  IconLock,
  IconPhotoOff,
} from "@tabler/icons-react";
import { Link } from "@/components/Link";
import { ASSET_URL } from "@/main";
import useGame from "@/hooks/useGame.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import type { MaimaiSongList } from "@/utils/api/song/maimai.ts";
import { getScoreCardBackgroundColor } from "@/utils/color.ts";
import {
  buildReleaseTimeline,
  formatReleaseDate,
  formatReleaseOffset,
  type ReleaseChart,
  type ReleaseChartType,
  type ReleaseDay,
  type ReleaseEntry,
} from "@/utils/releaseTimeline.ts";
import classes from "./ReleaseTimeline.module.css";

const TYPE_BADGES: Record<ReleaseChartType, { label: string; color: string }> = {
  standard: { label: "标准", color: "blue" },
  dx: { label: "DX", color: "orange" },
  utage: { label: "宴", color: "pink" },
};

const ROWS_PER_PAGE = 50;

const ChartBadges = ({ charts }: { charts: ReleaseChart[] }) => {
  const groups: { type: ReleaseChartType; charts: ReleaseChart[] }[] = [];
  for (const chart of charts) {
    const last = groups[groups.length - 1];
    if (last?.type === chart.type) last.charts.push(chart);
    else groups.push({ type: chart.type, charts: [chart] });
  }

  return (
    <Group gap={6} wrap="wrap">
      {groups.map((group) => (
        <Group key={group.type} gap={2} wrap="nowrap">
          <Badge size="xs" radius="sm" variant="light" color={TYPE_BADGES[group.type].color}>
            {TYPE_BADGES[group.type].label}
          </Badge>
          {group.charts.map(({ type, difficulty }) => (
            <Badge
              key={difficulty.difficulty}
              size="xs"
              radius="sm"
              px={5}
              color={getScoreCardBackgroundColor(
                "maimai",
                type === "utage" ? 5 : difficulty.difficulty,
              )}
            >
              {difficulty.level}
            </Badge>
          ))}
        </Group>
      ))}
    </Group>
  );
};

const EntryRow = ({ entry, songList }: { entry: ReleaseEntry; songList: MaimaiSongList }) => {
  const { song, charts } = entry;
  const locked = charts.length > 0 && charts.every(({ difficulty }) => difficulty.locked);

  return (
    <Link to={`/songs?game=maimai&song_id=${song.id}`} replace className={classes.row}>
      <Avatar
        src={`${ASSET_URL}/maimai/jacket/${songList.getSongResourceId(song.id)}.png!webp`}
        size={56}
        radius="md"
        imageProps={{ loading: "lazy" }}
      >
        <IconPhotoOff size={18} />
      </Avatar>
      <Box miw={0} flex={1}>
        <Group gap={4} wrap="nowrap" miw={0}>
          <Text span truncate size="sm" fw={600} lh="20px">
            {song.title}
          </Text>
          {locked && (
            <Tooltip label="需要解锁">
              <IconLock size={14} aria-label="需要解锁" style={{ flexShrink: 0 }} />
            </Tooltip>
          )}
        </Group>
        <Text truncate size="xs" c="dimmed" lh="16px">
          {song.artist}
        </Text>
        <Box mt={4}>
          <ChartBadges charts={charts} />
        </Box>
      </Box>
    </Link>
  );
};

const EntryGrid = ({
  label,
  entries,
  songList,
}: {
  label?: string;
  entries: ReleaseEntry[];
  songList: MaimaiSongList;
}) => {
  const [limit, setLimit] = useState(ROWS_PER_PAGE);
  const remaining = entries.length - limit;

  return (
    <div>
      {label && (
        <Text size="xs" fw={500} c="dimmed" mb={4}>
          {label}
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs" verticalSpacing={0} mx={-6}>
        {entries.slice(0, limit).map((entry) => (
          <EntryRow key={entry.song.id} entry={entry} songList={songList} />
        ))}
      </SimpleGrid>
      {remaining > 0 && (
        <Button
          variant="default"
          size="xs"
          fullWidth
          mt="xs"
          onClick={() => setLimit((value) => value + ROWS_PER_PAGE)}
        >
          显示更多（还有 {remaining} 首）
        </Button>
      )}
    </div>
  );
};

const DayItem = ({
  day,
  now,
  defaultOpened,
  songList,
}: {
  day: ReleaseDay;
  now: Date;
  defaultOpened: boolean;
  songList: MaimaiSongList;
}) => {
  const [opened, setOpened] = useState(defaultOpened);
  const newCharts = day.charts.reduce((count, entry) => count + entry.charts.length, 0);
  const summary = [
    day.songs.length > 0 && `新曲 ${day.songs.length}`,
    newCharts > 0 && `新谱面 ${newCharts}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const labelled = day.songs.length > 0 && day.charts.length > 0;

  return (
    <>
      <UnstyledButton
        className={classes.header}
        mod={{ expanded: opened }}
        aria-expanded={opened}
        onClick={() => setOpened((value) => !value)}
      >
        <Box flex={1} miw={0}>
          <Group gap="xs" wrap="wrap" mih={24}>
            <Text fw={600} lh="24px">
              {formatReleaseDate(day.date, now)}
            </Text>
            {day.upcoming && (
              <Badge variant="light" size="sm">
                即将配信
              </Badge>
            )}
            <Text size="sm" c="dimmed" lh="24px">
              {formatReleaseOffset(day.date, now)}
            </Text>
          </Group>
          <Text size="sm" c="dimmed" lh="20px">
            {summary}
          </Text>
        </Box>
        <IconChevronDown size={18} className={classes.chevron} />
      </UnstyledButton>
      <Collapse expanded={opened} keepMounted={false}>
        <Stack gap="sm" pt="sm">
          {day.songs.length > 0 && (
            <EntryGrid
              label={labelled ? "新曲" : undefined}
              entries={day.songs}
              songList={songList}
            />
          )}
          {day.charts.length > 0 && (
            <EntryGrid
              label={labelled ? "新谱面" : undefined}
              entries={day.charts}
              songList={songList}
            />
          )}
        </Stack>
      </Collapse>
    </>
  );
};

const EmptyHint = ({ text }: { text: string }) => (
  <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
    <IconCalendarOff size={64} stroke={1.5} />
    <Text fz="sm">{text}</Text>
  </Flex>
);

export const ReleaseTimeline = () => {
  const [game] = useGame();
  const songList = useSongListStore((state) => state.maimai);
  const now = useMemo(() => new Date(), []);
  const days = useMemo(() => buildReleaseTimeline(songList.songs, now), [songList, now]);

  if (game !== "maimai") return <EmptyHint text="中二节奏暂无配信日期数据" />;
  if (songList.songs.length === 0) {
    return (
      <Center my="xl">
        <Loader />
      </Center>
    );
  }
  if (days.length === 0) return <EmptyHint text="暂无配信日期数据" />;

  const released = days.filter((day) => !day.upcoming);
  const latestReleased = released[0]?.date;

  return (
    <Timeline
      active={released.length - 1}
      reverseActive
      bulletSize={24}
      lineWidth={2}
      classNames={{ item: classes.item }}
    >
      {days.map((day) => (
        <Timeline.Item
          key={day.date}
          bullet={day.upcoming ? <IconClock size={14} /> : undefined}
          lineVariant={day.upcoming ? "dashed" : "solid"}
        >
          <DayItem
            day={day}
            now={now}
            defaultOpened={day.upcoming || day.date === latestReleased}
            songList={songList}
          />
        </Timeline.Item>
      ))}
    </Timeline>
  );
};
