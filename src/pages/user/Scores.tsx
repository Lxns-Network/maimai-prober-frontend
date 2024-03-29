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
  SegmentedControl, Flex, Mark,
} from '@mantine/core';
import { getPlayerScores } from "../../utils/api/player";
import { useLocalStorage, useMediaQuery } from "@mantine/hooks";
import { StatisticsSection } from "../../components/Scores/maimai/StatisticsSection.tsx";
import {
  IconArrowDown,
  IconArrowUp,
  IconDatabaseOff, IconFileExport, IconFileImport, IconPlus,
} from "@tabler/icons-react";

import { MaimaiScoreProps } from '../../components/Scores/maimai/Score.tsx';
import { MaimaiScoreList } from '../../components/Scores/maimai/ScoreList.tsx';
import { MaimaiSongList, MaimaiSongProps } from "../../utils/api/song/maimai.tsx";

import { ChunithmSongList, ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { ChunithmScoreList } from "../../components/Scores/chunithm/ScoreList.tsx";
import { ChunithmScoreProps } from "../../components/Scores/chunithm/Score.tsx";
import classes from "../Page.module.css"
import { openAlertModal, openConfirmModal, openRetryModal } from "../../utils/modal.tsx";
import { AdvancedFilter } from "../../components/Scores/AdvancedFilter.tsx";
import { MaimaiCreateScoreModal } from "../../components/Scores/maimai/CreateScoreModal.tsx";
import { ChunithmCreateScoreModal } from "../../components/Scores/chunithm/CreateScoreModal.tsx";
import { SongCombobox } from "../../components/SongCombobox.tsx";

import ScoreContext from "../../utils/context.tsx";
import { API_URL } from "../../main.tsx";
import { fetchAPI } from "../../utils/api/api.tsx";
import { ApiContext } from "../../App.tsx";

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
  const [game, setGame] = useLocalStorage({ key: 'game' });

  const [scores, setScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [filteredScores, setFilteredScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [displayScores, setDisplayScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]); // 用于分页显示的成绩列表
  const [fetching, setFetching] = useState(true);

  const [filteredSongs, setFilteredSongs] = useState<(MaimaiSongProps | ChunithmSongProps)[]>();
  const [searchedScores, setSearchedScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [songId, setSongId] = useState<number>(0);

  const [sortBy, setSortBy] = useState();
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const small = useMediaQuery('(max-width: 30rem)');

  useEffect(() => {
    document.title = "成绩管理 | maimai DX 查分器";
  }, []);

  const resetState = () => {
    setScores([]);
    setSongId(0);
    setFilteredScores([]);
    setDisplayScores([]);
  }

  const getPlayerScoresHandler = async () => {
    try {
      const res = await getPlayerScores(game);
      const data = await res.json();
      if (!data.success) {
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

    setFetching(true);
    resetState();
    getPlayerScoresHandler();
  }, [game]);

  useEffect(() => {
    if (!filteredScores) return;

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
      const songList = context.songList;

      if (key === 'level_value') {
        const songA = songList.find(a.id);
        const songB = songList.find(b.id);
        if (!songA || !songB) {
          return 0;
        }
        let difficultyA, difficultyB;
        if (songList instanceof MaimaiSongList) {
          difficultyA = songList.getDifficulty(songA, a.type, a.level_index);
          difficultyB = songList.getDifficulty(songB, b.type, b.level_index);
        } else {
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

    // setFilteredScores(sortedElements);
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

  const context = useContext(ApiContext);
  const scoreContext = useContext(ScoreContext);

  return (
    <Container className={classes.root} size={400}>
      {context.songList instanceof MaimaiSongList && (
        <MaimaiCreateScoreModal songList={context.songList} score={scoreContext.score} opened={scoreContext.createScoreOpened} onClose={(score) => {
          if (score) getPlayerScoresHandler();
          scoreContext.setCreateScoreOpened(false);
        }} />
      )}
      {context.songList instanceof ChunithmSongList && (
        <ChunithmCreateScoreModal songList={context.songList} score={scoreContext.score} opened={scoreContext.createScoreOpened} onClose={(score) => {
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
      <SegmentedControl mb="md" radius="md" fullWidth value={game} onChange={(value) => setGame(value)} data={[
        { label: '舞萌 DX', value: 'maimai' },
        { label: '中二节奏', value: 'chunithm' },
      ]} />
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
        <Flex m="md" mt={0} gap="md" wrap="wrap">
          {(sortKeys[game as keyof typeof sortKeys] || sortKeys.maimai).map((item) => (
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
              <AdvancedFilter scores={scores} songList={context.songList} onChange={(result) => {
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
      {fetching ? (
        <Group justify="center" mt="md" mb="md">
          <Loader />
        </Group>
      ) : (displayScores && displayScores.length === 0 && scores ? (
        <Flex gap="xs" align="center" direction="column" c="dimmed" p="xl">
          <IconDatabaseOff size={64} stroke={1.5} />
          <Text fz="sm">没有获取或筛选到任何成绩</Text>
        </Flex>
      ) : (
        <>
          <Group justify="center">
            {totalPages > 1 && (
              <Pagination total={totalPages} value={page} onChange={setPage} size={small ? "sm" : "md"} />
            )}
            {context.songList instanceof MaimaiSongList && (
              <MaimaiScoreList
                scores={displayScores as MaimaiScoreProps[]}
                songList={context.songList}
                onScoreChange={(score) => {
                  if (score) getPlayerScoresHandler();
                }}
              />
            )}
            {context.songList instanceof ChunithmSongList && (
              <ChunithmScoreList
                scores={displayScores as ChunithmScoreProps[]}
                songList={context.songList}
                onScoreChange={(score) => {
                  if (score) getPlayerScoresHandler();
                }}
              />
            )}
            {totalPages > 1 && (
              <Pagination total={totalPages} value={page} onChange={setPage} size={small ? "sm" : "md"} />
            )}
          </Group>
          {context.songList instanceof MaimaiSongList && <>
            <Space h="md" />
            <StatisticsSection scores={searchedScores as MaimaiScoreProps[]} />
          </>}
        </>
      ))}
      <Group gap="sm" grow mt="md">
        {scores && scores.length > 0 && (
          <Button
            variant="transparent"
            leftSection={<IconFileExport size={20} />}
            onClick={() => {
              async function download(type: string) {
                try {
                  const res = await fetchAPI(`user/${game}/player/scores/export/${type}`, {
                    method: 'GET',
                  });
                  if (res.status !== 200) {
                    throw new Error(`HTTP ${res.status}`);
                  }
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${game}-scores.${type}`;
                  a.click();
                } catch (error) {
                  openRetryModal("成绩导出失败", `${error}`, download.bind(null, type));
                }
              }

              download('csv');
            }}
          >
            导出为 CSV
          </Button>
        )}
        <Button
          variant="transparent"
          leftSection={<IconFileImport size={20} />}
          onClick={
            openConfirmModal.bind(null, "导入成绩", <>
              导入成绩前，建议先备份当前成绩。导入成绩将会<Mark>删除当前所有成绩（包括历史成绩）</Mark>，是否继续？
            </>, () => {
              async function upload() {
                const file = document.createElement('input');
                file.type = 'file';
                file.accept = '.csv';
                file.onchange = async () => {
                  try {
                    if (!file.files || !file.files[0]) return;
                    const formData = new FormData();
                    formData.append('file', file.files[0]);
                    const res = await fetch(`${API_URL}/user/${game}/player/scores/import`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`,
                      },
                      body: formData,
                    });
                    const data = await res.json();
                    if (!data.success) {
                      if (data.code === 400) {
                        openAlertModal("成绩导入失败", `成绩导入失败，无效的 CSV 文件。`);
                        return;
                      }
                      throw new Error(data.message);
                    }
                    openAlertModal("成绩导入成功", `成绩导入成功，你的 ${game === "maimai" ? "DX Rating" : "Rating"} 已自动更新。`);
                    getPlayerScoresHandler();
                  } catch (error) {
                    openRetryModal("成绩导入失败", `${error}`, upload);
                  }
                };
                file.click();
              }

              upload();
            }, {
              confirmProps: { color: 'red' }
            })
          }
        >
          从 CSV 导入
        </Button>
      </Group>
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