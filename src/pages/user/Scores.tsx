import { useEffect, useState } from 'react';
import {
  Accordion,
  Alert,
  Button,
  Card, Chip,
  Container,
  createStyles,
  Grid,
  Group,
  Loader,
  MultiSelect,
  Pagination,
  RangeSlider,
  rem,
  Switch,
  Space,
  Text,
  Title,
  Autocomplete
} from '@mantine/core';
import { getPlayerScores } from "../../utils/api/player";
import { useNavigate } from "react-router-dom";
import { useDisclosure, useInputState, useLocalStorage } from "@mantine/hooks";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline, mdiArrowDown, mdiArrowUp, mdiMagnify, mdiReload } from "@mdi/js";
import { ScoreProps } from '../../components/Scores/Score';
import {
  DifficultiesProps,
  getDifficulty,
  SongList,
} from "../../utils/api/song";
import { ScoreList } from '../../components/Scores/ScoreList';
import {StatisticsSection} from "../../components/Scores/StatisticsSection";

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
    color: theme.colorScheme === 'dark' ? theme.white : theme.colors.gray[9],
  },
}));

const sortKeys = [
  { name: 'ID', key: 'id' },
  { name: '曲名', key: 'song_name' },
  { name: '定数', key: 'level_value' },
  { name: '达成率', key: 'achievements' },
  { name: 'DX Rating', key: 'dx_rating' },
  { name: '上传时间', key: 'upload_time' },
];

export const songList = new SongList();

export default function Scores() {
  const { classes } = useStyles();
  const [defaultScores, setDefaultScores] = useState<ScoreProps[]>([]);
  const [scores, setScores] = useState<ScoreProps[]>([]);
  const [displayScores, setDisplayScores] = useState<ScoreProps[]>([]); // 用于分页显示的成绩列表
  const [isLoaded, setIsLoaded] = useState(false);
  const [game] = useLocalStorage({ key: 'game', defaultValue: 'maimai' })
  const navigate = useNavigate();

  // 排序相关
  const [sortBy, setSortBy] = useState();
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  // 筛选相关
  const [search, setSearchValue] = useInputState('');
  const [difficulty, setDifficulty] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [rating, setRating] = useState<number[]>([1, 15]);
  const [version, setVersion] = useState<string[]>([]);
  const [showUnplayed, { toggle: toggleShowUnplayed }] = useDisclosure(false);

  // 分页相关
  const separator = 20;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const getPlayerScoresHandler = async () => {
    try {
      const res = await getPlayerScores(game);
      if (res.status !== 200) {
        return
      }
      const data = await res.json();
      if (data.data === null) {
        setDefaultScores([]);
      } else {
        setDefaultScores(data.data);
        setScores(data.data);
        setDisplayScores(data.data.slice(0, separator));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    document.title = "成绩管理 | maimai DX 查分器";

    songList.fetch(game).then(() => {
      getPlayerScoresHandler();
    });
  }, []);

  useEffect(() => {
    if (!scores) return;

    sort(sortBy, false);
    setTotalPages(Math.ceil(scores.length / separator));
  }, [scores]);

  useEffect(() => {
    const start = (page - 1) * separator;
    const end = start + separator;
    setDisplayScores(scores.slice(start, end));
  }, [page]);

  const resetFilter = () => {
    setSearchValue('');
    setDifficulty([]);
    setScores(defaultScores);
    setType([]);
    setRating([1, 15]);
  }

  const sort = (key: any, autoChangeReverse = true) => {
    let reversed = reverseSortDirection;
    if (autoChangeReverse) {
      reversed = key === sortBy ? !reverseSortDirection : false;
      setReverseSortDirection(reversed);
    }
    setSortBy(key);

    const sortedElements = scores.sort((a: any, b: any) => {
      if (key === 'level_value') {
        const songA = songList.find(a.id);
        const songB = songList.find(b.id);
        if (!songA || !songB) {
          return 0;
        }
        const difficultyA = getDifficulty(songA, a.type, a.level_index);
        const difficultyB = getDifficulty(songB, b.type, b.level_index);
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
    const filteredData = [...defaultScores] as ScoreProps[];

    if (showUnplayed) {
      songList.songs.forEach((song) => {
        ["dx", "standard"].forEach((type) => {
          const difficulties = song.difficulties[type as keyof DifficultiesProps];

          difficulties.forEach((difficulty, index) => {
            const existsInDefaultScores = filteredData.some((item) =>
              item.id === song.id && item.level_index === index && item.type === type
            );

            if (!existsInDefaultScores) {
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
            }
          });
        });
      });
    }

    // 过滤搜索
    const searchFilteredData = filteredData.filter(
      (score) => score.song_name.toLowerCase().includes(search.toLowerCase())
    );

    // 过滤难度
    const difficultyFilteredData = searchFilteredData.filter((score) => {
      if (difficulty?.length === 0) {
        return true;
      }
      return difficulty?.includes(score.level_index.toString());
    });

    // 过滤谱面类型
    const typeFilteredData = difficultyFilteredData.filter((score) => {
      if (type?.length === 0) {
        return true;
      }
      return type?.includes(score.type);
    })

    // 过滤谱面版本
    const versionFilteredData = typeFilteredData.filter((score) => {
      if (version?.length === 0 || version?.length === 2) {
        return true;
      }
      const song = songList.find(score.id);
      if (!song) {
        return false;
      }
      const difficulty = getDifficulty(song, score.type, score.level_index);
      if (!difficulty) {
        return false;
      }
      return version.every((item) => {
        if (item === "dx") {
          return difficulty.version >= 23000;
        }
        if (item === "standard") {
          return difficulty.version < 23000;
        }
        return true;
      });
    })

    // 过滤定数
    const ratingFilteredData = versionFilteredData.filter((score) => {
      const song = songList.find(score.id);
      if (!song) {
        return false;
      }
      const difficulty = getDifficulty(song, score.type, score.level_index);
      if (!difficulty) {
        return false;
      }
      return difficulty.level_value >= rating[0] && difficulty.level_value <= rating[1];
    })

    setScores(ratingFilteredData);
  }, [showUnplayed, search, difficulty, type, version, rating]);

  const renderSortIndicator = (key: any) => {
    if (sortBy === key) {
      return <Icon path={
        reverseSortDirection ? mdiArrowUp : mdiArrowDown
      } size={0.8} />;
    }
    return null;
  };

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        成绩管理
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        管理你的 maimai DX 查分器账号的成绩
      </Text>
      <Card withBorder radius="md" className={classes.card} mb="md" p={0}>
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
          {sortKeys.map((item) => (
            <Button
              key={item.key}
              onClick={() => sort(item.key)}
              size="xs"
              variant="light"
              radius="xl"
              rightIcon={renderSortIndicator(item.key)}
              style={{display: "flex"}}
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
                    icon={<Icon path={mdiMagnify} size={0.8} />}
                    placeholder="请输入曲名"
                    value={search}
                    onChange={setSearchValue}
                    data={search.trim().length > 0 ? defaultScores.map((score) => ({
                      key: `${score.id}-${score.type}-${score.level_index}`,
                      value: score.song_name,
                    })) : []}
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
                      label: "⚪ Re:MASTER",
                    }]}
                    placeholder="请选择难度"
                    value={difficulty}
                    onChange={(value) => setDifficulty(value)}
                    transitionProps={{ transition: 'fade', duration: 100, timingFunction: 'ease' }}
                  />
                </Grid.Col>
                <Grid.Col span={12} mb="md">
                  <Text fz="xs" c="dimmed" mb={3}>筛选谱面定数</Text>
                  <RangeSlider
                    min={1}
                    max={15}
                    step={0.1}
                    minRange={0.1}
                    precision={1}
                    marks={Array.from({ length: 15 }, (_, index) => ({
                      value: index + 1,
                      label: String(index + 1),
                    }))}
                    onChangeEnd={setRating}
                  />
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text fz="xs" c="dimmed" mb={3}>筛选谱面类型</Text>
                  <Group>
                    <Chip.Group multiple value={type} onChange={setType}>
                      <Chip variant="filled" value="standard" color="blue">标准</Chip>
                      <Chip variant="filled" value="dx" color="orange">DX</Chip>
                    </Chip.Group>
                  </Group>
                </Grid.Col>
                <Grid.Col span={6}>
                  <Text fz="xs" c="dimmed" mb={3}>筛选谱面版本</Text>
                  <Group>
                    <Chip.Group multiple value={version} onChange={setVersion}>
                      <Chip variant="filled" value="standard">常规</Chip>
                      <Chip variant="filled" value="dx">当前</Chip>
                    </Chip.Group>
                  </Group>
                </Grid.Col>
              </Grid>
              <Group position="apart">
                <Switch
                  label="显示未游玩曲目"
                  defaultChecked={showUnplayed}
                  onChange={toggleShowUnplayed}
                />
                <Button leftIcon={<Icon path={mdiReload} size={0.8} />} variant="light" onClick={resetFilter}>
                  重置筛选条件
                </Button>
              </Group>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Card>
      {!isLoaded ? (
        <Group position="center" mt="xl">
          <Loader />
        </Group>
      ) : (
        !scores ? (
          <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="没有获取到任何成绩" color="red">
            <Text size="sm" mb="md">
              请检查你的查分器账号是否已经绑定 maimai DX 游戏账号。
            </Text>
            <Group>
              <Button variant="outline" color="red" onClick={() => navigate("/user/sync")}>
                同步游戏数据
              </Button>
            </Group>
          </Alert>
        ) : (
          <>
            {(scores.length === 0 && defaultScores !== null) ? (
              <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="没有筛选到任何成绩" color="yellow">
                <Text size="sm">
                  请修改筛选条件后重试。
                </Text>
              </Alert>
            ) : (scores.length === 0 && defaultScores === null) ? (
              <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="没有获取到任何成绩" color="red">
                <Text size="sm" mb="md">
                  请检查你的查分器账号是否已经绑定 maimai DX 游戏账号。
                </Text>
                <Group>
                  <Button variant="outline" color="red" onClick={() => navigate("/user/sync")}>
                    同步游戏数据
                  </Button>
                </Group>
              </Alert>
            ) : null}
            <Group position="center">
              <Pagination total={totalPages} value={page} onChange={setPage} />
              <ScoreList scores={displayScores} />
              <Pagination total={totalPages} value={page} onChange={setPage} />
            </Group>
            <Space h="md" />
            <StatisticsSection scores={scores} />
          </>
        )
      )}
    </Container>
  );
}
