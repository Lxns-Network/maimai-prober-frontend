import { useEffect, useState } from 'react';
import {
  Accordion, Alert,
  Badge,
  Button,
  Card,
  Container,
  createStyles,
  Grid,
  Group,
  Input, Loader,
  MultiSelect,
  rem,
  SimpleGrid,
  Text,
  Title
} from '@mantine/core';
import { getPlayerScores } from "../../utils/api/api";
import { useNavigate } from "react-router-dom";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline, mdiArrowDown, mdiArrowUp, mdiMagnify, mdiReload } from "@mdi/js";
import useFormInput from "../../utils/useFormInput";

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

const difficultyColor = [
  [
    "rgb(129,217,85)",
    "rgb(248,183,9)",
    "rgb(249,126,138)",
    "rgb(192,69,227)",
    "rgb(233,233,233)",
  ],
  [
    "rgb(34,187,91)",
    "rgb(251,156,45)",
    "rgb(246,72,97)",
    "rgb(158,69,226)",
    "rgb(186,103,248)",
  ],
  [
    "rgb(14,117,54)",
    "rgb(213,117,12)",
    "rgb(188,38,52)",
    "rgb(111,24,173)",
    "rgb(192,69,227)",
  ]
]

const getScoreSecondaryColor = (level_index: number) => {
  return difficultyColor[2][level_index]
}

const getScoreCardBackgroundColor = (level_index: number) => {
  return difficultyColor[localStorage.getItem("theme") === "\"light\"" ? 0 : 1][level_index]
}

interface ScoresProps {
  id: number;
  song_name: string;
  level: string;
  level_index: number;
  achievements: number;
  fc: string;
  fs: string;
  dx_score: number;
  dx_rating: number;
  rate: string;
  type: string;
  upload_time: string;
}

const Score = ({ score }: { score: ScoresProps }) => {
  const { classes } = useStyles();

  return (
    <Card shadow="sm" radius="md" p={0} className={[classes.card, classes.scoreCard].join(' ')} style={{
      border: `2px solid ${getScoreSecondaryColor(score.level_index)}`,
      backgroundColor: getScoreCardBackgroundColor(score.level_index)
    }}>
      <Group position="apart" noWrap pt={5} pb={2} pl="xs" pr="xs" spacing="xs" style={{
        backgroundColor: difficultyColor[localStorage.getItem("theme") === "\"light\"" ? 1 : 2][score.level_index]
      }}>
        <Text size="sm" weight={500} truncate color="white">{score.song_name}</Text>
        {score.type === "standard" ? (
          <Badge variant="filled" color="blue" size="sm">标准</Badge>
        ) : (
          <Badge variant="filled" color="orange" size="sm">DX</Badge>
        )}
      </Group>
      <Group position="apart" m={10} mt={5} mb={5}>
        <div>
          <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
            {parseInt(String(score.achievements))}
            <span style={{ fontSize: rem(16) }}>.{
              String(score.achievements).split(".")[1]
            }%</span>
          </Text>
          <Text size="xs">
            DX Rating: {parseInt(String(score.dx_rating))}
          </Text>
        </div>
        <Card w={30} h={30} shadow="sm" padding={0} radius="md" withBorder>
          <Text size="md" weight={500} align="center" pt={2}>
            {score.level}
          </Text>
        </Card>
      </Group>
    </Card>
  )
}

export default function Scores() {
  const { classes } = useStyles();
  const [sortBy, setSortBy] = useState();
  const [sortOrder, setSortOrder] = useState('asc');

  const [defaultScores, setDefaultScores] = useState<ScoresProps[]>([]);
  const [scores, setScores] = useState<ScoresProps[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const searchInput = useFormInput('');
  const [difficulty, setDifficulty] = useState<string[]>();

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
      setIsLoaded(true);
    });
  }, []);

  useEffect(() => {
    handleSearchAndDifficulty();
  }, [searchInput.value, difficulty]);

  const resetFilter = () => {
    searchInput.setValue("");
    setDifficulty([]);
    setScores(defaultScores);
  }

  const handleSearchAndDifficulty = () => {
    const searchFilteredData = defaultScores.filter(
      (score) => score.song_name.toLowerCase().includes(searchInput.value.toLowerCase())
    );

    const filteredData = searchFilteredData.filter((score) => {
      if (difficulty?.length === 0) {
        return true;
      }
      return difficulty?.includes(score.level_index.toString());
    });

    setScores(filteredData);
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
        账号成绩管理
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
                    {...searchInput}
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
            <SimpleGrid
              cols={2}
              spacing="xs"
            >
              {scores.map((score) => (
                <Score key={`${score.id}.${score.level_index}`} score={score} />
              ))}
            </SimpleGrid>
          </>
        )
      )}
    </Container>
  );
}
