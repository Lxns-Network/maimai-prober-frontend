import { useContext, useEffect, useState } from 'react';
import {
  Accordion,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Pagination,
  Space,
  Text,
  Title,
  Flex,
} from '@mantine/core';
import { getPlayerScores } from "../../utils/api/player";
import { useLocalStorage, useMediaQuery } from "@mantine/hooks";
import { MaimaiStatisticsSection } from "../../components/Scores/maimai/StatisticsSection.tsx";
import { ChunithmStatisticsSection } from "../../components/Scores/chunithm/StatisticsSection.tsx";
import {
  IconArrowDown,
  IconArrowUp,
  IconDatabaseOff, IconPlus,
} from "@tabler/icons-react";

import { MaimaiScoreProps } from '../../components/Scores/maimai/Score.tsx';
import { MaimaiSongList, MaimaiSongProps } from "../../utils/api/song/maimai.tsx";

import { ChunithmSongList, ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { ChunithmScoreProps } from "../../components/Scores/chunithm/Score.tsx";
import classes from "../Page.module.css"
import { openRetryModal } from "../../utils/modal.tsx";
import { AdvancedFilter } from "../../components/Scores/AdvancedFilter.tsx";
import { ScoreExportSection } from "../../components/Scores/ScoreExportSection.tsx";
import { MaimaiCreateScoreModal } from "../../components/Scores/maimai/CreateScoreModal.tsx";
import { ChunithmCreateScoreModal } from "../../components/Scores/chunithm/CreateScoreModal.tsx";
import { SongCombobox } from "../../components/SongCombobox.tsx";

import ScoreContext from "../../utils/context.tsx";
import { ScoreList } from "../../components/Scores/ScoreList.tsx";
import useSongListStore from "../../hooks/useSongListStore.tsx";

const sortKeys = {
  maimai: [
    { name: '曲目 ID', key: 'id' },
    { name: '曲名', key: 'song_name' },
    { name: '定数', key: 'level_value' },
    { name: '达成率', key: 'achievements' },
    { name: 'DX Rating', key: 'dx_rating' },
    { name: '上传时间', key: 'upload_time' },
  ],
  chunithm: [
    { name: '曲目 ID', key: 'id' },
    { name: '曲名', key: 'song_name' },
    { name: '定数', key: 'level_value' },
    { name: '成绩', key: 'score' },
    { name: 'Rating', key: 'rating' },
    { name: '上传时间', key: 'upload_time' },
  ]
};

const ScoresContent = () => {
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });

  const [scores, setScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [filteredScores, setFilteredScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [displayScores, setDisplayScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]); // 用于分页显示的成绩列表
  const [fetching, setFetching] = useState(true);

  const [filteredSongs, setFilteredSongs] = useState<(MaimaiSongProps | ChunithmSongProps)[]>([]);
  const [searchedScores, setSearchedScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [songId, setSongId] = useState<number>(0);

  const [sortBy, setSortBy] = useState();
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const scoreContext = useContext(ScoreContext);
  const getSongList = useSongListStore((state) => state.getSongList);
  const small = useMediaQuery('(max-width: 30rem)');

  useEffect(() => {
    document.title = "成绩管理 | maimai DX 查分器";
  }, []);

  const getPlayerScoresHandler = async () => {
    try {
      const res = await getPlayerScores(game);
      const data = await res.json();
      if (!data.success) {
        if (data.code === 404) {
          return;
        }
        throw new Error(data.message);
      }
      if (data.data) {
        setFilteredScores(data.data);
        setScores(data.data);
      } else {
        setFilteredScores([]);
        setScores([]);
      }
    } catch (error) {
      openRetryModal("成绩列表获取失败", `${error}`, getPlayerScoresHandler);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!game) return;

    setSongList(getSongList(game));
    scoreContext.setScore(null);

    setFetching(true);
    setSongId(0);
    getPlayerScoresHandler();
  }, [game]);

  useEffect(() => {
    if (!filteredScores || fetching) return;

    if (!filteredSongs) {
      setSearchedScores(filteredScores);
      return;
    }
    setSearchedScores(filteredScores.filter((score) => {
      return filteredSongs.find((song) => song.id === score.id);
    }));
  }, [filteredScores, filteredSongs]);

  useEffect(() => {
    if (!searchedScores) return;

    sort(sortBy, false);
    setTotalPages(Math.ceil(searchedScores.length / PAGE_SIZE));
  }, [searchedScores]);

  useEffect(() => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;

    if (searchedScores) {
      setDisplayScores(searchedScores.slice(start, end));
    }
  }, [page]);

  const sort = (key: any, autoChangeReverse = true) => {
    let reversed = reverseSortDirection;
    if (autoChangeReverse) {
      reversed = key === sortBy ? !reverseSortDirection : false;
      setReverseSortDirection(reversed);
    }
    setSortBy(key);

    if (!searchedScores) return;

    const sortedElements = searchedScores.sort((a: any, b: any) => {
      if (!songList) return 0;
      if (key === 'level_value') {
        let songA = songList.find(a.id);
        let songB = songList.find(b.id);
        if (!songA || !songB) {
          return 0;
        }
        let difficultyA, difficultyB;
        if (songList instanceof MaimaiSongList) {
          songA = songA as MaimaiSongProps;
          songB = songB as MaimaiSongProps;
          difficultyA = songList.getDifficulty(songA, a.type, a.level_index);
          difficultyB = songList.getDifficulty(songB, b.type, b.level_index);
        } else {
          songA = songA as ChunithmSongProps;
          songB = songB as ChunithmSongProps;
          difficultyA = songList.getDifficulty(songA, a.level_index);
          difficultyB = songList.getDifficulty(songB, b.level_index);
        }
        if (!difficultyA || !difficultyB) {
          return 0;
        }
        a = difficultyA;
        b = difficultyB;
      }
      if (typeof a[key] === 'string') {
        return reversed ? a[key].localeCompare(b[key]) : b[key].localeCompare(a[key]);
      } else {
        return reversed ? a[key] - b[key] : b[key] - a[key];
      }
    });

    setDisplayScores(sortedElements.slice(0, PAGE_SIZE));
    setPage(1);
  };

  const renderSortIndicator = (key: any) => {
    if (sortBy === key) {
      return <>
        {reverseSortDirection ? <IconArrowUp size={20} /> : <IconArrowDown size={20} />}
      </>
    }
    return null;
  };

  return (
    <Container className={classes.root} size={400}>
      {game === "maimai" && (
        <MaimaiCreateScoreModal score={scoreContext.score} opened={scoreContext.createScoreOpened} onClose={(score) => {
          if (score) getPlayerScoresHandler();
          scoreContext.setCreateScoreOpened(false);
        }} />
      )}
      {game === "chunithm" && (
        <ChunithmCreateScoreModal score={scoreContext.score} opened={scoreContext.createScoreOpened} onClose={(score) => {
          if (score) getPlayerScoresHandler();
          scoreContext.setCreateScoreOpened(false);
        }} />
      )}
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        成绩管理
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
        管理你的 maimai DX 查分器账号的成绩
      </Text>
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
          {(sortKeys[game] || sortKeys.maimai).map((item) => (
            <Button
              key={item.key}
              onClick={() => sort(item.key)}
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
        <Button radius="md" leftSection={<IconPlus size={20} />} onClick={() => scoreContext.setCreateScoreOpened(true)}>
          创建成绩
        </Button>
      </Flex>
      <Space h="md" />
      {fetching && totalPages === 0 ? (
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
        <Pagination total={totalPages} value={page} onChange={setPage} size={small ? "sm" : "md"} disabled={fetching} />
        <ScoreList scores={displayScores} onScoreChange={(score) => {
          if (score) getPlayerScoresHandler();
        }} />
        <Pagination total={totalPages} value={page} onChange={setPage} size={small ? "sm" : "md"} disabled={fetching} />
      </Group>
      <Space h="md" />
      {game === "maimai" && <MaimaiStatisticsSection scores={searchedScores as MaimaiScoreProps[]} />}
      {game === "chunithm" && <ChunithmStatisticsSection scores={searchedScores as ChunithmScoreProps[]} />}
      <ScoreExportSection scores={scores} onImport={getPlayerScoresHandler} />
    </Container>
  );
}

export default function Scores() {
  const [score, setScore] = useState<MaimaiScoreProps | ChunithmScoreProps | null>(null);
  const [createScoreOpened, setCreateScoreOpened] = useState(false);

  return (
    <ScoreContext.Provider value={{ score, setScore, createScoreOpened, setCreateScoreOpened }}>
      <ScoresContent />
    </ScoreContext.Provider>
  );
}