import { useEffect, useState } from 'react';
import {
  Accordion,
  Button,
  Card, Chip,
  Container,
  Grid,
  Group,
  Loader,
  MultiSelect,
  Pagination,
  RangeSlider,
  Switch,
  Space,
  Text,
  Title,
  Autocomplete, SegmentedControl, Flex, ComboboxStringData
} from '@mantine/core';
import { getPlayerScores } from "../../utils/api/player";
import { useDisclosure, useInputState, useLocalStorage } from "@mantine/hooks";
import { StatisticsSection } from "../../components/Scores/maimai/StatisticsSection.tsx";
import {
  IconArrowDown,
  IconArrowUp,
  IconDatabaseOff,
  IconReload,
  IconSearch
} from "@tabler/icons-react";
import { SongList } from "../../utils/api/song/song.tsx";

import { MaimaiScoreProps } from '../../components/Scores/maimai/Score.tsx';
import { MaimaiScoreList } from '../../components/Scores/maimai/ScoreList.tsx';
import { MaimaiDifficultiesProps, MaimaiSongList } from "../../utils/api/song/maimai.tsx";

import { ChunithmSongList } from "../../utils/api/song/chunithm.tsx";
import { ChunithmScoreList } from "../../components/Scores/chunithm/ScoreList.tsx";
import { ChunithmScoreProps } from "../../components/Scores/chunithm/Score.tsx";
import { AliasList } from "../../utils/api/alias.tsx";
import classes from "../Page.module.css"

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

export default function Scores() {
  const [defaultScores, setDefaultScores] = useState<MaimaiScoreProps[] | ChunithmScoreProps[] | null>(null);
  const [scores, setScores] = useState<MaimaiScoreProps[] | ChunithmScoreProps[] | null>(null);
  const [displayScores, setDisplayScores] = useState<MaimaiScoreProps[] | ChunithmScoreProps[]>([]); // 用于分页显示的成绩列表
  const [fetching, setFetching] = useState(true);
  const [game, setGame] = useLocalStorage({ key: 'game' });
  const [songList, setSongList] = useState(new SongList());
  const [aliasList] = useState(new AliasList());

  // 排序相关
  const [sortBy, setSortBy] = useState();
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  // 筛选相关
  const [search, setSearchValue] = useInputState('');
  const [difficulty, setDifficulty] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [rating, setRating] = useState<[number, number]>([1, 16]);
  const [genre, setGenre] = useState<string[]>([]);
  const [version, setVersion] = useState<number[]>([]);
  const [showUnplayed, { toggle: toggleShowUnplayed }] = useDisclosure(false);

  // 分页相关
  const separator = 20;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const getPlayerScoresHandler = async () => {
    try {
      const res = await getPlayerScores(game);
      const data = await res.json();
      if (data.code !== 200) {
        setDefaultScores([]);
      } else {
        setDefaultScores(data.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      resetFilter();
    }
  };

  useEffect(() => {
    document.title = "成绩管理 | maimai DX 查分器";
  }, []);

  useEffect(() => {
    if (!game) return;
    songList.fetch().then(() => {
      getPlayerScoresHandler();
    });
  }, [songList]);

  useEffect(() => {
    if (!game) return;
    else if (game === "maimai") {
      setSongList(new MaimaiSongList());
    } else {
      setSongList(new ChunithmSongList());
    }
    aliasList.fetch(game);
  }, [game]);

  useEffect(() => {
    if (!scores) return;

    sort(sortBy, false);
    setTotalPages(Math.ceil(scores.length / separator));
    setFetching(false);
  }, [scores]);

  useEffect(() => {
    const start = (page - 1) * separator;
    const end = start + separator;
    if (scores) setDisplayScores(scores.slice(start, end));
  }, [page]);

  const resetFilter = () => {
    setSortBy(undefined);
    setSearchValue('');
    setDifficulty([]);
    setGenre([]);
    setVersion([]);
    setScores(defaultScores);
    setType([]);
    setRating([1, 16]);
  }

  const sort = (key: any, autoChangeReverse = true) => {
    let reversed = reverseSortDirection;
    if (autoChangeReverse) {
      reversed = key === sortBy ? !reverseSortDirection : false;
      setReverseSortDirection(reversed);
    }
    setSortBy(key);

    if (!scores) return;

    const sortedElements = scores.sort((a: any, b: any) => {
      if (key === 'level_value') {
        const songA = songList.find(a.id);
        const songB = songList.find(b.id);
        if (!songA || !songB) {
          return 0;
        }
        let difficultyA;
        let difficultyB;
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

    setScores(sortedElements);
    setDisplayScores(sortedElements.slice(0, separator));
    setPage(1);
  };

  useEffect(() => {
    if (!defaultScores) return;

    let filteredData = [...defaultScores];

    if (showUnplayed) {
      if (songList instanceof MaimaiSongList) {
        const scoreKeys = new Set(
          filteredData.map((item) => `${item.id}-${(item as MaimaiScoreProps).type}-${item.level_index}`));

        songList.songs.forEach((song) => {
          ["dx", "standard"].forEach((type) => {
            const difficulties = song.difficulties[type as keyof MaimaiDifficultiesProps];

            difficulties.forEach((difficulty, index) => {
              if (scoreKeys.has(`${song.id}-${type}-${difficulty.difficulty}`)) {
                return;
              }

              filteredData.push({
                id: song.id,
                song_name: song.title,
                level: difficulty.level,
                level_index: index,
                achievements: -1,
                fc: "",
                fs: "",
                dx_score: -1,
                dx_rating: -1,
                rate: "",
                type: type,
                upload_time: ""
              });
            });
          });
        });
      } else if (songList instanceof ChunithmSongList) {
        songList.songs.forEach((song) => {
          song.difficulties.forEach((difficulty, index) => {
            if (filteredData.find((item) => item.id === song.id && item.level_index === index)) {
              return;
            }

            filteredData.push({
              id: song.id,
              song_name: song.title,
              level: difficulty.level,
              level_index: index,
              score: -1,
              clear: "",
              full_combo: "",
              full_sync: "",
              over_power: 0,
              rank: "",
              rating: 0,
              upload_time: ""
            });
          });
        });
      }
    }

    // 如果没有任何筛选条件，直接返回
    if (search.trim().length + difficulty.length + type.length + genre.length + version.length === 0 && rating[0] === 1 && rating[1] === 16) {
      setScores(filteredData as any);
      return;
    }

    // 不需要 song 和 difficulty 信息，提前过滤掉可以减少后续的计算量
    filteredData = filteredData.filter((score) => {
      if (songList instanceof MaimaiSongList) {
        if (type.length > 0 && !type.includes((score as MaimaiScoreProps).type)) { // 过滤谱面类型
          return false;
        }
      }
      return (score.song_name.toLowerCase().includes(search.toLowerCase()) || // 过滤搜索
          (aliasList.searchMap[search.toLowerCase()] || []).includes(score.id)) // 过滤搜索别名
        && (difficulty.includes(score.level_index.toString()) || difficulty.length === 0) // 过滤难度
    })

    filteredData = filteredData.filter((score) => {
      const song = songList.find(score.id);
      if (!song) {
        return false;
      }
      if (songList instanceof ChunithmSongList) {
        const difficulty = songList.getDifficulty(song, score.level_index);
        if (!difficulty) return false;
        return (difficulty.level_value >= rating[0] && difficulty.level_value <= rating[1]); // 过滤定数
      } else if (songList instanceof MaimaiSongList) {
        const difficulty = songList.getDifficulty(song, (score as MaimaiScoreProps).type, score.level_index);
        if (!difficulty) return false;

        return ((genre.some((selected) => songList.genres.find((genre) => genre.genre === selected)?.genre === song.genre)) || genre.length === 0) // 过滤乐曲分类
          && (version.some((selected) => difficulty.version >= selected && difficulty.version < (
            songList.versions[songList.versions.findIndex((value) => value.version === selected)+1]?.version || selected+1000)) || version.length === 0) // 过滤版本
          && (difficulty.level_value >= rating[0] && difficulty.level_value <= rating[1]); // 过滤定数
      }
    })

    setScores(filteredData as any);
  }, [showUnplayed, search, difficulty, type, genre, version, rating]);

  const [searchResult, setSearchResult] = useState<{ key: string, value: string }[]>([]);

  useEffect(() => {
    setSearchResult(search.trim().length > 0 ? (defaultScores || []).map((score) => ({
      key: `${score.id}-${(score as MaimaiScoreProps).type}-${score.level_index}`,
      value: score.song_name,
    })) : [])
  }, [search]);

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
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        成绩管理
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb="xl">
        管理你的 maimai DX 查分器账号的成绩
      </Text>
      <SegmentedControl size="sm" mb="md" color="blue" fullWidth value={game} onChange={(value) => {
        setFetching(true);
        setDefaultScores([]);
        setDisplayScores([]);
        setGame(value);
      }} data={[
        { label: '舞萌 DX', value: 'maimai' },
        { label: '中二节奏', value: 'chunithm' },
      ]} />
      <Card withBorder radius="md" className={classes.card} p={0}>
        <Group m="md">
          <div>
            <Text fz="lg" fw={700}>
              排序方式
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              选择成绩的排序方式
            </Text>
          </div>
        </Group>
        <Group m="md">
          {(sortKeys[game as keyof typeof sortKeys] || sortKeys.maimai).map((item) => (
            <Button
              key={item.key}
              onClick={() => sort(item.key)}
              size="xs"
              variant="light"
              radius="xl"
              rightSection={renderSortIndicator(item.key)}
              style={{ display: "flex" }}
            >
              {item.name}
            </Button>
          ))}
        </Group>
        <Accordion variant="filled" chevronPosition="left">
          <Accordion.Item value="advanced-filter">
            <Accordion.Control>高级筛选设置</Accordion.Control>
            <Accordion.Panel>
              <Grid mb="xs">
                <Grid.Col span={6}>
                  <Text fz="xs" c="dimmed" mb={3}>筛选曲名</Text>
                  <Autocomplete
                    variant="filled"
                    leftSection={<IconSearch size={18} />}
                    placeholder="请输入曲名"
                    value={search}
                    onChange={setSearchValue}
                    data={Array.from(new Set(searchResult.map(result => result.value)))
                      .map(value => searchResult.find(result => result.value === value)) as ComboboxStringData}
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text fz="xs" c="dimmed" mb={3}>筛选难度</Text>
                  <MultiSelect
                    variant="filled"
                    data={[{
                      value: "0",
                      label: "🟢 BASIC",
                    }, {
                      value: "1",
                      label: "🟡 ADVANCED",
                    }, {
                      value: "2",
                      label: "🔴 EXPERT",
                    }, {
                      value: "3",
                      label: "🟣 MASTER",
                    }, {
                      value: "4",
                      label: game !== "chunithm" ? "⚪ Re:MASTER" : "⚫ ULTIMA",
                    }]}
                    placeholder="请选择难度"
                    value={difficulty}
                    onChange={(value) => setDifficulty(value)}
                    comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
                  />
                </Grid.Col>
                {songList instanceof MaimaiSongList && (
                  <>
                    <Grid.Col span={6}>
                      <Text fz="xs" c="dimmed" mb={3}>筛选乐曲分类</Text>
                      <MultiSelect
                        variant="filled"
                        data={songList.genres.map((version) => ({
                          value: version.genre,
                          label: version.title,
                        }))}
                        placeholder="请选择乐曲分类"
                        value={genre}
                        onChange={(value) => setGenre(value)}
                        comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
                      />
                    </Grid.Col>
                    <Grid.Col span={6}>
                      <Text fz="xs" c="dimmed" mb={3}>筛选版本</Text>
                      <MultiSelect
                        variant="filled"
                        data={songList.versions.map((version) => ({
                          value: version.version.toString(),
                          label: version.title,
                        })).reverse()}
                        placeholder="请选择版本"
                        value={version.map((item) => item.toString())}
                        onChange={(value) => setVersion(value.map((item) => parseInt(item)))}
                        comboboxProps={{ transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' } }}
                      />
                    </Grid.Col>
                  </>
                )}
                <Grid.Col span={12} mb="md">
                  <Text fz="xs" c="dimmed" mb={3}>筛选谱面定数</Text>
                  <RangeSlider
                    min={1}
                    max={16}
                    step={0.1}
                    minRange={0.1}
                    precision={1}
                    defaultValue={rating}
                    marks={Array.from({ length: 16 }, (_, index) => ({
                      value: index + 1,
                      label: String(index + 1),
                    }))}
                    onChangeEnd={setRating}
                  />
                </Grid.Col>
                {songList instanceof MaimaiSongList && (
                  <Grid.Col span={6}>
                    <Text fz="xs" c="dimmed" mb={3}>筛选谱面类型</Text>
                    <Group>
                      <Chip.Group multiple value={type} onChange={setType}>
                        <Chip variant="filled" value="standard" color="blue">标准</Chip>
                        <Chip variant="filled" value="dx" color="orange">DX</Chip>
                      </Chip.Group>
                    </Group>
                  </Grid.Col>
                )}
              </Grid>
              <Group justify="space-between">
                <Switch
                  label="显示未游玩曲目"
                  defaultChecked={showUnplayed}
                  onChange={toggleShowUnplayed}
                />
                <Button leftSection={<IconReload size={20} />} variant="light" onClick={resetFilter}>
                  重置筛选条件
                </Button>
              </Group>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Card>
      <Space h="md" />
      {fetching ? (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      ) : ((scores && scores.length === 0 && defaultScores) ? (
        <Flex gap="xs" align="center" direction="column" c="dimmed" p="xl">
          <IconDatabaseOff size={64} />
          <Text fz="sm">没有获取或筛选到任何成绩</Text>
        </Flex>
      ) : (
        <>
          <Group justify="center">
            <Pagination total={totalPages} value={page} onChange={setPage} />
            {songList instanceof MaimaiSongList && (
              <MaimaiScoreList scores={displayScores as MaimaiScoreProps[]} songList={songList} />
            )}
            {songList instanceof ChunithmSongList && (
              <ChunithmScoreList scores={displayScores as ChunithmScoreProps[]} songList={songList} />
            )}
            <Pagination total={totalPages} value={page} onChange={setPage} />
          </Group>
          <Space h="md" />
          {songList instanceof MaimaiSongList && (
            <StatisticsSection scores={scores as MaimaiScoreProps[]} />
          )}
        </>
      ))}
    </Container>
  );
}
