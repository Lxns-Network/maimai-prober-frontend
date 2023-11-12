import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Card,
  Container,
  createStyles, Flex,
  Group, HoverCard,
  Loader,
  Pagination,
  rem, SegmentedControl, Select, Space,
  Text,
  Title,
} from '@mantine/core';
import { useLocalStorage } from "@mantine/hooks";
import Icon from "@mdi/react";
import {
  mdiArrowDown,
  mdiArrowUp,
  mdiDatabaseOffOutline,
  mdiHelpCircleOutline,
  mdiMagnify, mdiPlus
} from "@mdi/js";
import { getAliasList, getUserVotes } from "../../utils/api/alias.tsx";
import { AliasList } from "../../components/Alias/AliasList.tsx";
import { CreateAliasModal } from "../../components/Alias/CreateAliasModal.tsx";
import { notifications } from "@mantine/notifications";
import {SongList} from "../../utils/api/song.tsx";

export interface AliasProps {
  alias_id: number;
  song: {
    id: number;
    name: string;
  };
  song_type: string;
  difficulty: number;
  alias: string;
  approved: boolean;
  weight: {
    up: number;
    down: number;
    total: number;
  };
  uploader: {
    id: number;
    name: string;
  };
  upload_time: string;
  // extra
  vote?: VoteProps;
}

interface VoteProps {
  alias_id?: number;
  vote_id?: number;
  weight: number;
}

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
  { name: '别名', key: 'alias' },
  { name: '曲目 ID', key: 'song_id' },
  { name: '总权重', key: 'total_weight' },
  { name: '提交时间', key: 'alias_id' },
];

export default function Vote() {
  const { classes } = useStyles();
  const [displayAliases, setDisplayAliases] = useState<AliasProps[]>([]);
  const [aliases, setAliases] = useState<AliasProps[]>([]);
  const [votes, setVotes] = useState<VoteProps[]>([]);
  const [opened, setOpened] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [game, setGame] = useLocalStorage({ key: 'game' });
  const [songList, setSongList] = useState(new SongList());

  // 排序相关
  const [sortBy, setSortBy] = useState();
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  // 筛选相关
  const [songId, setSongId] = useState<number>(0);

  // 分页相关
  // const pageSize = 20;
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  const sort = (key: any, autoChangeReverse = true) => {
    let reversed = reverseSortDirection;
    if (autoChangeReverse) {
      reversed = key === sortBy ? !reverseSortDirection : false;
      setReverseSortDirection(reversed);
    }
    setSortBy(key);
    setPage(1);
  };

  const getUserVotesHandler = async () => {
    try {
      const res = await getUserVotes(game);
      if (res.status === 429) {
        notifications.show({
          title: '请求过于频繁',
          message: '请稍后再试',
          color: 'red',
        });
        return
      } else if (res.status !== 200) {
        return
      }
      const data = await res.json();
      if (data.data !== null) {
        setVotes(data.data)
      } else {
        setVotes([])
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getAliasListHandler = async () => {
    try {
      const res = await getAliasList(game, page, sortBy, reverseSortDirection ? 'asc' : 'desc', songId);
      if (res.status === 429) {
        notifications.show({
          title: '请求过于频繁',
          message: '请稍后再试',
          color: 'red',
        });
        return
      } else if (res.status !== 200) {
        setFetching(false);
        setPageCount(0);
        setAliases([]);
        return
      }
      const data = await res.json();
      if (data.data.aliases !== null) {
        setPageCount(data.data.page_count);
        setAliases(data.data.aliases);
      } else {
        setFetching(false);
        setPageCount(0);
        setAliases([]);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setDisplayAliases([]);
    }
  };

  const fetchHandler = async () => {
    setFetching(true);
    getAliasListHandler().then(() => {
      getUserVotesHandler();
    });
  }

  useEffect(() => {
    document.title = "曲目别名投票 | maimai DX 查分器";
  }, []);

  useEffect(() => {
    if (!game) return;

    songList.clear();
    songList.fetch(game).then(() => {
      setSongList(songList);
    });
    setSongId(0);

    if (page !== 1) {
      setPage(1);
    } else {
      fetchHandler();
    }
  }, [game]);

  useEffect(() => {
    aliases.forEach((alias, i) => {
      const vote = votes.find((vote) => vote.alias_id === alias.alias_id);
      if (vote) alias.vote = vote;
      aliases[i] = alias;
    })

    setFetching(false);
    setDisplayAliases(aliases);
  }, [votes]);

  useEffect(() => {
    if (!game) return;

    fetchHandler();
  }, [page]);

  useEffect(() => {
    if (!game) return;

    fetchHandler();
  }, [songId, sortBy, reverseSortDirection]);

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
      <CreateAliasModal opened={opened} onClose={() => {
        fetchHandler();
        setOpened(false);
      }} />
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        曲目别名投票
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        提交曲目别名，或为你喜欢的曲目别名投票
      </Text>
      <SegmentedControl size="sm" mb="md" color="blue" fullWidth value={game} onChange={(value) => {
        setGame(value);
        setFetching(true);
      }} data={[
        { label: '舞萌 DX', value: 'maimai' },
        { label: '中二节奏', value: 'chunithm' },
      ]} />
      <Card withBorder radius="md" className={classes.card} p={0}>
        <Group m="md" position="apart">
          <div>
            <Text fz="lg" fw={700}>
              筛选曲目别名
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              选择曲目别名的排序方式
            </Text>
          </div>
          <HoverCard shadow="md" withinPortal>
            <HoverCard.Target>
              <ActionIcon>
                <Icon path={mdiHelpCircleOutline} size={rem(20)} />
              </ActionIcon>
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Text size="sm">
                暂时不支持在其他页面使用曲目别名
              </Text>
            </HoverCard.Dropdown>
          </HoverCard>
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
              style={{ display: "flex" }}
            >
              {item.name}
            </Button>
          ))}
        </Group>
      </Card>
      <Space h="md" />
      <Flex align="center" justify="space-between" gap="xs">
        <Select
          variant="filled"
          placeholder="请选择曲目"
          icon={<Icon path={mdiMagnify} size={0.8} />}
          radius="md"
          dropdownPosition="bottom"
          data={songList.songs.map((song) => ({
            value: song.id.toString(),
            label: song.title,
          }))}
          value={songId === 0 ? null : songId.toString()}
          onChange={(value) => {
            if (value === null) {
              setSongId(0);
              return;
            }

            setSongId(parseInt(value));
          }}
          disabled={songList.songs.length === 0}
          clearable
          searchable
          style={{ flex: 1 }}
        />
        <Button variant="gradient" radius="md" leftIcon={<Icon path={mdiPlus} size={rem(20)} />} onClick={() => setOpened(true)}>
          创建曲目别名
        </Button>
      </Flex>
      <Space h="md" />
      {!fetching && pageCount === 0 && (
        <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
          <Icon path={mdiDatabaseOffOutline} size={rem(64)} />
          <Text fz="sm">暂时没有可投票的曲目别名</Text>
        </Flex>
      )}
      <Group position="center">
        <Pagination total={pageCount} value={page} onChange={setPage} />
          {fetching ? (
            <Group position="center" w="100%">
              <Loader />
            </Group>
          ) : (
            <AliasList aliases={displayAliases} onDelete={() => {
              fetchHandler();
            }} />
          )}
        <Pagination total={pageCount} value={page} onChange={setPage} />
      </Group>
    </Container>
  );
}
