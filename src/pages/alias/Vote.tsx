import { useEffect, useState } from 'react';
import {
  Button,
  Card, Checkbox,
  Container,
  Flex,
  Group, HoverCard,
  Loader,
  Pagination,
  SegmentedControl, Space,
  Text, ThemeIcon,
  Title,
} from '@mantine/core';
import { useLocalStorage, useToggle } from "@mantine/hooks";
import { getAliasList, getUserVotes } from "../../utils/api/alias.tsx";
import { AliasList } from "../../components/Alias/AliasList.tsx";
import { CreateAliasModal } from "../../components/Alias/CreateAliasModal.tsx";
import {
  IconArrowDown,
  IconArrowUp,
  IconDatabaseOff,
  IconHelp,
  IconPlus,
} from "@tabler/icons-react";
import { SongList } from "../../utils/api/song/song.tsx";
import { MaimaiSongList } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongList } from "../../utils/api/song/chunithm.tsx";
import classes from "../Page.module.css"
import { openAlertModal } from "../../utils/modal.tsx";
import { SongCombobox } from "../../components/SongCombobox.tsx";

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

const sortKeys = [
  { name: '别名', key: 'alias' },
  { name: '总权重', key: 'total_weight' },
  { name: '提交时间', key: 'alias_id' },
];

export default function Vote() {
  const [displayAliases, setDisplayAliases] = useState<AliasProps[]>([]);
  const [aliases, setAliases] = useState<AliasProps[]>([]);
  const [votes, setVotes] = useState<VoteProps[]>([]);
  const [opened, setOpened] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [game, setGame] = useLocalStorage({ key: 'game' });
  const [songList, setSongList] = useState(new SongList());
  const [onlyNotApproved, toggleOnlyNotApproved] = useToggle();

  // 排序相关
  const [sortBy, setSortBy] = useState();
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  // 筛选相关
  const [songId, setSongId] = useState<number>(0);

  // 分页相关
  // const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);

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
        openAlertModal("投票获取失败", "请求过于频繁，请稍后再试。")
        return
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setVotes(data.data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const getAliasListHandler = async () => {
    try {
      const res = await getAliasList(game, page, onlyNotApproved, sortBy, reverseSortDirection ? 'asc' : 'desc', songId);
      if (res.status === 429) {
        openAlertModal("曲目别名获取失败", "请求过于频繁，请稍后再试。")
        return
      }
      const data = await res.json();
      if (!data.success || !data.data || !data.data.aliases) {
        setFetching(false);
        setTotalPages(0);
        setAliases([]);
        if (data.message) {
          throw new Error(data.message);
        }
        return;
      }
      setTotalPages(data.data.page_count);
      setAliases(data.data.aliases);
    } catch (error) {
      console.error(error);
    } finally {
      setDisplayAliases([]);
    }
  };

  const fetchHandler = async () => {
    if (!game) return;

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

    let newSongList: any;
    if (game === "maimai") {
      newSongList = new MaimaiSongList();
    } else {
      newSongList = new ChunithmSongList();
    }
    newSongList.fetch().then(() => {
      setSongId(0);
      setSongList(newSongList);
    });
    fetchHandler();
    setPage(1);
  }, [game]);

  useEffect(() => {
    aliases.forEach((alias, i) => {
      const vote = votes.find((vote) => vote.alias_id === alias.alias_id);
      if (vote) alias.vote = vote;
      aliases[i] = alias;
    });
    setFetching(false);
    setDisplayAliases(aliases);
  }, [votes]);

  useEffect(() => {
    fetchHandler();
  }, [onlyNotApproved, page, songId, sortBy, reverseSortDirection]);

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
      <CreateAliasModal opened={opened} onClose={(alias) => {
        if (alias) fetchHandler();
        setOpened(false);
      }} />
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        曲目别名投票
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
        提交曲目别名，或为你喜欢的曲目别名投票
      </Text>
      <SegmentedControl mb="md" radius="md" fullWidth value={game} onChange={(value) => {
        setGame(value);
        setFetching(true);
      }} data={[
        { label: '舞萌 DX', value: 'maimai' },
        { label: '中二节奏', value: 'chunithm' },
      ]} />
      <Card withBorder radius="md" className={classes.card} p={0}>
        <Group m="md" justify="space-between">
          <div>
            <Text fz="lg" fw={700}>
              排序方式
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              选择曲目别名的排序方式
            </Text>
          </div>
          <HoverCard shadow="md" withinPortal>
            <HoverCard.Target>
              <ThemeIcon variant="subtle" color="default">
                <IconHelp size={20} stroke={1.5} />
              </ThemeIcon>
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Text size="sm">
                可以在成绩管理页使用曲目别名进行查询
              </Text>
            </HoverCard.Dropdown>
          </HoverCard>
        </Group>
        <Flex gap="md" m="md" mt={0} wrap="wrap">
          {sortKeys.map((item) => (
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
        </Flex>
      </Card>
      <Space h="md" />
      <Flex align="center" justify="space-between" gap="xs">
        <SongCombobox
          songs={songList.songs}
          value={songId}
          onOptionSubmit={(value) => setSongId(value)}
          style={{ flex: 1 }}
          radius="md"
        />
        <Button radius="md" leftSection={<IconPlus size={20} />} onClick={() => setOpened(true)}>
          创建曲目别名
        </Button>
      </Flex>
      <Space h="xs" />
      <Checkbox
        label="仅显示未被批准的曲目别名"
        defaultChecked={true}
        onChange={() => toggleOnlyNotApproved()}
      />
      <Space h="md" />
      {fetching ? (
        <Group justify="center" mt="md">
          <Loader />
        </Group>
      ) : (totalPages === 0 ? (
        <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
          <IconDatabaseOff size={64} stroke={1.5} />
          <Text fz="sm">暂时没有可投票的曲目别名</Text>
        </Flex>
      ) : (
        <Group justify="center">
          {totalPages > 1 && (
            <Pagination total={totalPages} value={page} onChange={setPage} />
          )}
          <AliasList aliases={displayAliases} onDelete={() => {
            fetchHandler();
          }} />
          {totalPages > 1 && (
            <Pagination total={totalPages} value={page} onChange={setPage} />
          )}
        </Group>
      ))}
    </Container>
  );
}
