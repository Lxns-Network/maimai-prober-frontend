import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Group,
  Indicator,
  Loader,
  Menu,
  Pagination,
  Space,
  Text,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { AliasList } from "@/components/Alias/AliasList.tsx";
import { AnimatePresence, motion } from "motion/react";
import { match } from "ts-pattern";
import {
  IconArrowsSort,
  IconDatabaseOff,
  IconFilter,
  IconPlus,
  IconRestore,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";
import { SongCombobox } from "@/components/SongCombobox.tsx";
import { Page } from "@/components/Page/Page.tsx";
import { useAliases } from "@/hooks/queries/useAliases.ts";
import { useAliasVotes } from "@/hooks/queries/useAliasVotes.ts";
import useGame from "@/hooks/useGame.ts";
import useAliasStore from "@/hooks/useAliasStore.ts";

type SortKey = "alias" | "total_weight" | "alias_id";

const sortKeys: { name: string; key: SortKey }[] = [
  { name: "别名", key: "alias" },
  { name: "总权重", key: "total_weight" },
  { name: "提交时间", key: "alias_id" },
];

const AliasVoteContent = () => {
  const [game] = useGame();
  // true = 仅显示未被批准（待投票）的别名，是本页默认状态
  const [onlyNotApproved, setOnlyNotApproved] = useState(true);

  const { openModal: openCreateAliasModal } = useAliasStore();

  const [sortBy, setSortBy] = useState<SortKey | undefined>(undefined);
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  const [songId, setSongId] = useState<number>(0);

  const [page, setPage] = useState(1);
  const small = useMediaQuery("(max-width: 30rem)");
  const topRef = useRef<HTMLDivElement>(null);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const { aliases, pageCount, isLoading, invalidate } = useAliases(
    game,
    page,
    !onlyNotApproved,
    sortBy,
    reverseSortDirection ? "asc" : "desc",
    songId,
  );
  const { votes } = useAliasVotes(game);

  // 渲染期把用户投票并入别名列表(单一一致快照)。不再用 effect 写回 query 缓存:
  // 缓存原地变更 + 结构共享会让更新不可见,且 vote 与 weight 来自两个端点容易错位。
  const aliasesWithVotes = useMemo(
    () =>
      aliases.map((alias) => ({
        ...alias,
        vote: votes.find((vote) => vote.alias_id === alias.alias_id),
      })),
    [aliases, votes],
  );

  // 投票走乐观更新(calculateNewAliasWeight 与服务端同步 ±1),刷新交给窗口聚焦/翻页等自然时机。
  // 不在投票后立即 invalidate:列表与投票两个端点刷新有先后,合并时会出现 2→3→2→3 的闪烁。

  const sort = (key: SortKey, autoChangeReverse = true) => {
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

  const handleCreateAlias = () => {
    openCreateAliasModal({
      game: game,
      songId: songId,
      onClose: (values) => {
        values && invalidate();
      },
    });
  };

  const currentSortKey = sortKeys.find((item) => item.key === sortBy);

  const renderSortDirectionIcon = (size: number) =>
    reverseSortDirection ? <IconSortAscending size={size} /> : <IconSortDescending size={size} />;

  const sortMenu = (
    <Menu shadow="md" position="bottom-end" width={200} closeOnItemClick={false}>
      <Menu.Target>
        {small ? (
          <Indicator size={8} disabled={!sortBy} withBorder>
            <ActionIcon variant="default" size="input-sm" aria-label="排序方式">
              <IconArrowsSort size={20} />
            </ActionIcon>
          </Indicator>
        ) : (
          <Button
            variant="default"
            leftSection={sortBy ? renderSortDirectionIcon(20) : <IconArrowsSort size={20} />}
          >
            {currentSortKey ? currentSortKey.name : "排序"}
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>排序方式</Menu.Label>
        {sortKeys.map((item) => (
          <Menu.Item
            key={item.key}
            fw={sortBy === item.key ? 500 : undefined}
            rightSection={sortBy === item.key ? renderSortDirectionIcon(16) : null}
            onClick={() => sort(item.key)}
          >
            {item.name}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconRestore size={16} />}
          disabled={!sortBy}
          onClick={() => {
            setSortBy(undefined);
            setReverseSortDirection(false);
            setPage(1);
          }}
        >
          恢复默认排序
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const activeFilterCount = onlyNotApproved ? 0 : 1;

  const filterMenu = (
    <Menu shadow="md" position="bottom-end" width={260} closeOnItemClick={false}>
      <Menu.Target>
        {small ? (
          <Indicator
            label={activeFilterCount}
            size={16}
            disabled={activeFilterCount === 0}
            withBorder
          >
            <ActionIcon variant="default" size="input-sm" aria-label="筛选">
              <IconFilter size={20} />
            </ActionIcon>
          </Indicator>
        ) : (
          <Button
            variant="default"
            leftSection={<IconFilter size={20} />}
            rightSection={
              activeFilterCount > 0 ? (
                <Badge size="sm" circle>
                  {activeFilterCount}
                </Badge>
              ) : null
            }
          >
            筛选
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>筛选</Menu.Label>
        <Box px="sm" py="xs">
          <Checkbox
            label="仅显示未被批准的曲目别名"
            checked={onlyNotApproved}
            onChange={(event) => {
              setOnlyNotApproved(event.currentTarget.checked);
              setPage(1);
            }}
          />
        </Box>
      </Menu.Dropdown>
    </Menu>
  );

  const createButton = small ? (
    <ActionIcon
      size="input-sm"
      variant="filled"
      aria-label="创建曲目别名"
      onClick={handleCreateAlias}
    >
      <IconPlus size={20} />
    </ActionIcon>
  ) : (
    <Button leftSection={<IconPlus size={20} />} onClick={handleCreateAlias}>
      创建曲目别名
    </Button>
  );

  return (
    <div ref={topRef} style={{ scrollMarginTop: 16 }}>
      <Flex gap="xs" align="center" wrap="nowrap">
        <SongCombobox
          value={songId}
          onOptionSubmit={(value) => {
            setSongId(value);
            setPage(1);
          }}
          placeholder="搜索曲名、别名或曲目 ID"
          style={{ flex: 1, minWidth: 0 }}
        />
        {sortMenu}
        {filterMenu}
        {createButton}
      </Flex>
      <Space h="md" />
      <AnimatePresence mode="wait" initial={false}>
        {match({ hasAliases: pageCount > 0, isLoading })
          .with({ hasAliases: true }, () => (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Group justify="center">
                <Pagination
                  total={pageCount}
                  value={page}
                  onChange={handlePageChange}
                  size={small ? "sm" : "md"}
                  disabled={isLoading}
                />
                <AliasList aliases={aliasesWithVotes} onMutate={invalidate} />
                <Pagination
                  total={pageCount}
                  value={page}
                  onChange={handlePageChange}
                  size={small ? "sm" : "md"}
                  disabled={isLoading}
                />
              </Group>
            </motion.div>
          ))
          .with({ hasAliases: false, isLoading: true }, () => (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Group justify="center" mt="md" mb="md">
                <Loader />
              </Group>
            </motion.div>
          ))
          .with({ hasAliases: false, isLoading: false }, () => (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
                <IconDatabaseOff size={64} stroke={1.5} />
                <Text fz="sm">暂时没有可投票的曲目别名</Text>
              </Flex>
            </motion.div>
          ))
          .exhaustive()}
      </AnimatePresence>
    </div>
  );
};

export default function AliasVote() {
  return (
    <Page
      meta={{
        title: "曲目别名投票",
        description: "提交曲目别名，或为你喜欢的曲目别名投票",
      }}
      children={<AliasVoteContent />}
    />
  );
}
