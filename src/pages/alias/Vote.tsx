import { useEffect, useState } from 'react';
import { Button, Card, Checkbox, Flex, Group, Loader, Pagination, Space, Text } from '@mantine/core';
import { useMediaQuery, useToggle } from "@mantine/hooks";
import { AliasList } from "@/components/Alias/AliasList.tsx";
import { IconArrowDown, IconArrowUp, IconDatabaseOff, IconPlus } from "@tabler/icons-react";
import classes from "../Page.module.css"
import { SongCombobox } from "@/components/SongCombobox.tsx";
import { Page } from "@/components/Page/Page.tsx";
import { useAliases } from "@/hooks/swr/useAliases.ts";
import { useAliasVotes } from "@/hooks/swr/useAliasVotes.ts";
import useGame from "@/hooks/useGame.ts";
import useAliasStore from "@/hooks/useAliasStore.ts";

const sortKeys = [
  { name: '别名', key: 'alias' },
  { name: '总权重', key: 'total_weight' },
  { name: '提交时间', key: 'alias_id' },
];

const AliasVoteContent = () => {
  const [game] = useGame();
  const [onlyNotApproved, toggleOnlyNotApproved] = useToggle();

  const { openModal: openCreateAliasModal } = useAliasStore();

  // 排序相关
  const [sortBy, setSortBy] = useState();
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  // 筛选相关
  const [songId, setSongId] = useState<number>(0);

  // 分页相关
  // const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const small = useMediaQuery('(max-width: 30rem)');

  const {
    aliases, pageCount, pageSize, isLoading, mutate
  } = useAliases(game, page, onlyNotApproved, sortBy, reverseSortDirection ? 'asc' : 'desc', songId);
  const { votes, mutate: mutateVote } = useAliasVotes(game);

  const sort = (key: any, autoChangeReverse = true) => {
    let reversed = reverseSortDirection;
    if (autoChangeReverse) {
      reversed = key === sortBy ? !reverseSortDirection : false;
      setReverseSortDirection(reversed);
    }
    setSortBy(key);
    setPage(1);
  };

  useEffect(() => {
    setSongId(0);
    setPage(1);
  }, [game]);

  useEffect(() => {
    aliases.forEach((alias, i) => {
      const vote = votes.find((vote) => vote.alias_id === alias.alias_id);
      if (vote) alias.vote = vote;
      aliases[i] = alias;
    });

    mutate({
      aliases: aliases,
      page_count: pageCount,
      page_size: pageSize,
    });
  }, [aliases]);

  const renderSortIndicator = (key: any) => {
    if (sortBy === key) {
      return <>
        {reverseSortDirection ? <IconArrowUp size={20} /> : <IconArrowDown size={20} />}
      </>
    }
    return null;
  };

  const handleCreateAlias = () => {
    openCreateAliasModal({
      game: game,
      songId: songId,
      onClose: (values) => {
        values && mutate();
      },
    });
  }

  return (
    <div>
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
          value={songId}
          onOptionSubmit={(value) => setSongId(value)}
          style={{ flex: 1 }}
          radius="md"
        />
        <Button radius="md" leftSection={<IconPlus size={20} />} onClick={handleCreateAlias}>
          创建曲目别名
        </Button>
      </Flex>
      <Checkbox
        label="仅显示未被批准的曲目别名"
        defaultChecked={true}
        onChange={() => toggleOnlyNotApproved()}
        mt="xs"
      />
      <Space h="md" />
      {isLoading && pageCount === 0 ? (
        <Group justify="center" mt="md" mb="md">
          <Loader />
        </Group>
      ) : (pageCount === 0 && (
        <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
          <IconDatabaseOff size={64} stroke={1.5} />
          <Text fz="sm">暂时没有可投票的曲目别名</Text>
        </Flex>
      ))}
      <Group justify="center">
        <Pagination total={pageCount} value={page} onChange={setPage} size={small ? "sm" : "md"} disabled={isLoading} />
        <AliasList aliases={aliases} onVote={mutateVote} onDelete={mutate} />
        <Pagination total={pageCount} value={page} onChange={setPage} size={small ? "sm" : "md"} disabled={isLoading} />
      </Group>
    </div>
  );
}

export default function AliasVote() {
  return (
    <Page
      meta={{
        title: "曲目别名投票",
        description: "提交曲目别名，或为你喜欢的曲目别名投票",
      }}
      children={<AliasVoteContent />}
    />
  )
}