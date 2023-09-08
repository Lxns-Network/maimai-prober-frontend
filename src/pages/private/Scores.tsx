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
  Input,
  Loader,
  MultiSelect, Pagination, RangeSlider,
  rem,
  SimpleGrid,
  Text,
  Title
} from '@mantine/core';
import { getPlayerScores } from "../../utils/api/api";
import { useNavigate } from "react-router-dom";
import { useInputState } from "@mantine/hooks";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline, mdiArrowDown, mdiArrowUp, mdiMagnify, mdiReload } from "@mdi/js";
import { Score, ScoresProps } from '../../components/Scores/Score';

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
    color: theme.colorScheme === 'dark' ? theme.white : theme.colors.gray[9],
  },

  scoreCard: {
    cursor: 'pointer',
    transition: 'transform 200ms ease',

    '&:hover': {
      transform: 'scale(1.03)',
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
      boxShadow: theme.shadows.md,
      borderColor: theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2],
      borderRadius: theme.radius.md,
      zIndex: 1,
    }
  }
}));

const sortKeys = [
  { name: 'ID', key: 'id' },
  { name: '曲名', key: 'song_name' },
  { name: '达成率', key: 'achievements' },
  { name: 'DX Rating', key: 'dx_rating' },
  { name: '上传时间', key: 'upload_time' },
];

export default function Scores() {
  const { classes } = useStyles();
  const [defaultScores, setDefaultScores] = useState<ScoresProps[]>([]);
  const [scores, setScores] = useState<ScoresProps[]>([]);
  const [displayScores, setDisplayScores] = useState<ScoresProps[]>([]); // 用于分页显示的成绩列表
  const [isLoaded, setIsLoaded] = useState(false);

  // 排序相关
  const [sortBy, setSortBy] = useState();
  const [sortOrder, setSortOrder] = useState('asc');

  // 筛选相关
  const [search, setSearchValue] = useInputState('');
  const [difficulty, setDifficulty] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);

  // 分页相关
  const separator = 20;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const navigate = useNavigate();

  useEffect(() => {
    const getScores = async () => {
      const res = await getPlayerScores();
      if (res?.status !== 200) {
        return [];
      }
      return res?.json();
    }

    getScores().then((data) => {
      setDefaultScores(data.data);
      setScores(data.data);
      setDisplayScores(data.data.slice(0, separator));
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    setTotalPages(Math.ceil(scores.length / separator));
  }, [scores]);

  useEffect(() => {
    const start = (page - 1) * separator;
    const end = start + separator;
    setDisplayScores(scores.slice(start, end));
  }, [page]);

  useEffect(() => {
    handleFilter();
  }, [search, difficulty, type]);

  const resetFilter = () => {
    setSearchValue('');
    setDifficulty([]);
    setScores(defaultScores);
    setType([]);
  }

  const handleFilter = () => {
    const searchFilteredData = defaultScores.filter(
      (score) => score.song_name.toLowerCase().includes(search.toLowerCase())
    );

    const difficultyFilteredData = searchFilteredData.filter((score) => {
      if (difficulty?.length === 0) {
        return true;
      }
      return difficulty?.includes(score.level_index.toString());
    });

    const typeFilteredData = difficultyFilteredData.filter((score) => {
      if (type?.length === 0) {
        return true;
      }
      return type?.includes(score.type);
    })

    setScores(typeFilteredData);
    setPage(1);
    setDisplayScores(typeFilteredData.slice(0, separator));
  }

  const handleSort = (key: any) => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    if (sortBy !== key) {
      setSortBy(key);
    }

    const sortedElements = [...scores].sort((a: any, b: any) => {
      if (typeof a[key] === 'string') {
        return sortOrder === 'desc' ? a[key].localeCompare(b[key]) : b[key].localeCompare(a[key]);
      } else {
        return sortOrder === 'desc' ? a[key] - b[key] : b[key] - a[key];
      }
    });

    setScores(sortedElements);
    setPage(1);
    setDisplayScores(sortedElements.slice(0, separator));
  };

  const renderSortIndicator = (key: any) => {
    if (sortBy === key) {
      return <Icon path={
        sortOrder === 'asc' ? mdiArrowUp : mdiArrowDown
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
              onClick={() => handleSort(item.key)}
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
        <Accordion variant="filled" chevronPosition="left" defaultValue="advanced-filter">
          <Accordion.Item value="advanced-filter">
            <Accordion.Control>高级筛选设置</Accordion.Control>
            <Accordion.Panel>
              <Grid mb="xs">
                <Grid.Col span={6}>
                  <Text fz="xs" c="dimmed" mb={3}>筛选曲名</Text>
                  <Input
                    variant="filled"
                    icon={<Icon path={mdiMagnify} size={0.8} />}
                    placeholder="请输入曲名"
                    value={search}
                    onChange={setSearchValue}
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
                    defaultValue={[1, 15]}
                    marks={Array.from({ length: 15 }, (_, index) => ({
                      value: index + 1,
                      label: String(index + 1),
                    }))}
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
              </Grid>
              <Button leftIcon={<Icon path={mdiReload} size={0.8} />} variant="light" onClick={resetFilter}>
                重置筛选条件
              </Button>
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
            {scores.length === 0 && (
              <Alert radius="md" icon={<Icon path={mdiAlertCircleOutline} />} title="没有筛选到任何成绩" color="yellow">
                <Text size="sm">
                  请修改筛选条件后重试。
                </Text>
              </Alert>
            )}
            <Group position="center">
              <Pagination total={totalPages} value={page} onChange={setPage} />
              <SimpleGrid
                cols={2}
                spacing="xs"
                w="100%"
              >
                {displayScores.map((score) => (
                  <Score key={`${score.id}.${score.level_index}`} score={score} />
                ))}
              </SimpleGrid>
              <Pagination total={totalPages} value={page} onChange={setPage} />
            </Group>
          </>
        )
      )}
    </Container>
  );
}
