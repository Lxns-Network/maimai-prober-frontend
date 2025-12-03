import { useEffect, useState } from "react";
import { MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { useMediaQuery } from "@mantine/hooks";
import { useScores } from "@/hooks/swr/useScores.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { IconArrowDown, IconArrowUp, IconDatabaseOff, IconPlus } from "@tabler/icons-react";
import { Accordion, Button, Card, Flex, Group, Loader, Pagination, Space, Text } from "@mantine/core";
import classes from "@/pages/Page.module.css";
import { AdvancedFilter } from "@/components/Scores/AdvancedFilter.tsx";
import { SongCombobox } from "@/components/SongCombobox.tsx";
import { ScoreList } from "@/components/Scores/ScoreList.tsx";
import { MaimaiStatisticsSection } from "@/components/Scores/maimai/StatisticsSection.tsx";
import { ChunithmStatisticsSection } from "@/components/Scores/chunithm/StatisticsSection.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";
import useCreateScoreStore from "@/hooks/useCreateScoreStore.ts";
import { usePlayer } from "@/hooks/swr/usePlayer.ts";

const sortKeys = {
  maimai: [
    { name: '曲目 ID', key: 'id' },
    { name: '曲名', key: 'song_name' },
    { name: '定数', key: 'level_value' },
    { name: '达成率', key: 'achievements' },
    { name: 'DX Rating', key: 'dx_rating' },
    // { name: '上传时间', key: 'upload_time' },
    { name: '最后游玩时间', key: 'last_played_time' },
  ],
  chunithm: [
    { name: '曲目 ID', key: 'id' },
    { name: '曲名', key: 'song_name' },
    { name: '定数', key: 'level_value' },
    { name: '成绩', key: 'score' },
    { name: 'Rating', key: 'rating' },
    // { name: '上传时间', key: 'upload_time' },
    { name: '最后游玩时间', key: 'last_played_time' },
  ]
};

export const ScoreListSection = () => {
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [game] = useGame();

  const { player } = usePlayer(game);
  const { scores, isLoading, mutate } = useScores(game);
  const [filteredScores, setFilteredScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [sortedScores, setSortedScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [displayScores, setDisplayScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]); // 用于分页显示的成绩列表

  const [filteredSongs, setFilteredSongs] = useState<(MaimaiSongProps | ChunithmSongProps)[]>([]);
  const [searchedScores, setSearchedScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [songId, setSongId] = useState<number>(0);

  const [sortBy, setSortBy] = useState<string | null>(null);
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

  const { openModal: openCreateScoreModal } = useCreateScoreStore();
  const getSongList = useSongListStore((state) => state.getSongList);
  const small = useMediaQuery('(max-width: 30rem)');

  useEffect(() => {
    setSongList(getSongList(game));
    setSongId(0);
  }, [game]);

  useEffect(() => {
    setFilteredScores(scores);
  }, [scores]);

  useEffect(() => {
    if (!filteredScores || isLoading) return;

    if (!filteredSongs) {
      setSearchedScores(filteredScores);
      return;
    }
    setSearchedScores(filteredScores.filter((score) => {
      return filteredSongs.find((song) => song.id === score.id);
    }));
  }, [filteredScores, filteredSongs]);

  useEffect(() => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    if (sortedScores) {
      setDisplayScores(sortedScores.slice(start, end));
    }
  }, [sortedScores, page]);

  useEffect(() => {
    if (!searchedScores) return;

    setTotalPages(Math.ceil(searchedScores.length / PAGE_SIZE));

    const getCompareValue = (
      score: MaimaiScoreProps | ChunithmScoreProps,
      key: string
    ): string | number | null => {
      if (key === 'level_value' && songList) {
        const song = songList.find(score.id);
        if (!song) return null;
        if (songList instanceof MaimaiSongList && 'type' in score) {
          const difficulty = songList.getDifficulty(song as MaimaiSongProps, score.type, score.level_index);
          return difficulty?.level_value ?? null;
        } else if (songList instanceof ChunithmSongList) {
          const difficulty = songList.getDifficulty(song as ChunithmSongProps, score.level_index);
          return difficulty?.level_value ?? null;
        }
        return null;
      }
      if (key in score) {
        return (score as unknown as Record<string, string | number>)[key];
      }
      return null;
    };

    const sortedScores = searchedScores.sort((a, b) => {
      if (!songList || !sortBy) return 0;

      const valueA = getCompareValue(a, sortBy);
      const valueB = getCompareValue(b, sortBy);

      if (valueA === null || valueB === null) {
        if (valueA === null && valueB === null) return 0;
        return valueA === null ? 1 : -1;
      }

      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return reverseSortDirection
          ? valueA.localeCompare(valueB)
          : valueB.localeCompare(valueA);
      }

      if (typeof valueA === 'number' && typeof valueB === 'number') {
        const dxRatingA = 'dx_rating' in a ? (a.dx_rating ?? 0) : 0;
        const dxRatingB = 'dx_rating' in b ? (b.dx_rating ?? 0) : 0;
        return reverseSortDirection
          ? valueA - valueB || dxRatingA - dxRatingB
          : valueB - valueA || dxRatingA - dxRatingB;
      }

      return 0;
    });

    setDisplayScores(sortedScores.slice(0, PAGE_SIZE));
    setSortedScores(sortedScores);
    setPage(1);
  }, [searchedScores, reverseSortDirection, sortBy]);

  const renderSortIndicator = (key: string) => {
    if (sortBy === key) {
      return <>
        {reverseSortDirection ? <IconArrowUp size={20} /> : <IconArrowDown size={20} />}
      </>
    }
    return null;
  };

  return (
    <div>
      <Card withBorder radius="md" className={classes.card} p={0}>
        <Group justify="space-between" m="md">
          <div>
            <Text fz="lg" fw={700}>
              排序方式
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              选择成绩的排序方式
            </Text>
          </div>
        </Group>
        <Flex m="md" gap="md" mt={0} wrap="wrap">
          {sortKeys[game].map((item) => (
            <Button
              key={item.key}
              onClick={() => {
                const reversed = item.key === sortBy ? !reverseSortDirection : false;
                setReverseSortDirection(reversed);
                setSortBy(item.key);
              }}
              size="xs"
              variant="light"
              radius="xl"
              rightSection={renderSortIndicator(item.key)}
            >
              {item.name}
            </Button>
          ))}
        </Flex>
        <Accordion variant="filled" chevronPosition="left">
          <Accordion.Item value="advanced-filter">
            <Accordion.Control>高级筛选设置</Accordion.Control>
            <Accordion.Panel>
              <AdvancedFilter scores={scores} onChange={(result) => {
                setFilteredScores(result);
              }} />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Card>
      <Space h="md" />
      <Flex align="center" justify="space-between" gap="xs">
        <SongCombobox
          value={songId}
          onSongsChange={(filteredSongs) => {
            setFilteredSongs(filteredSongs);
          }}
          placeholder="请输入曲名或曲目别名"
          radius="md"
          style={{ flex: 1 }}
        />
        <Button radius="md" leftSection={<IconPlus size={20} />} disabled={!player} onClick={() => {
          openCreateScoreModal({
            game,
            onClose: (values) => {
              values && mutate()
            }
          })
        }}>
          创建成绩
        </Button>
      </Flex>
      <Space h="md" />
      {isLoading && totalPages === 0 ? (
        <Group justify="center" mt="md" mb="md">
          <Loader />
        </Group>
      ) : (totalPages === 0 && (
        <Flex gap="xs" align="center" direction="column" c="dimmed" p="xl">
          <IconDatabaseOff size={64} stroke={1.5} />
          <Text fz="sm">没有获取或筛选到任何成绩</Text>
        </Flex>
      ))}
      <Group justify="center">
        <Pagination total={totalPages} value={page} onChange={setPage} size={small ? "sm" : "md"} disabled={isLoading} />
        <ScoreList scores={displayScores} onScoreChange={(score) => {
          score && mutate();
        }} />
        <Pagination total={totalPages} value={page} onChange={setPage} size={small ? "sm" : "md"} disabled={isLoading} />
      </Group>
      <Space h="md" />
      {game === "maimai" && <MaimaiStatisticsSection scores={searchedScores as MaimaiScoreProps[]} />}
      {game === "chunithm" && <ChunithmStatisticsSection scores={searchedScores as ChunithmScoreProps[]} />}
    </div>
  );
}