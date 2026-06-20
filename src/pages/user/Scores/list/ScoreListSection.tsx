import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { useScores } from "@/hooks/queries/useScores.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import {
  IconArrowsSort,
  IconDatabaseOff,
  IconFilter,
  IconPlus,
  IconRestore,
  IconSortAscending,
  IconSortDescending,
  IconX,
} from "@tabler/icons-react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Drawer,
  Flex,
  Group,
  Indicator,
  Loader,
  Menu,
  NumberFormatter,
  Pagination,
  ScrollArea,
  Space,
  Stack,
  Text,
} from "@mantine/core";
import classes from "./ScoreListSection.module.css";
import { AnimatePresence, motion } from "motion/react";
import { match } from "ts-pattern";
import { AdvancedFilter } from "@/components/Scores/AdvancedFilter.tsx";
import { SongCombobox } from "@/components/SongCombobox.tsx";
import { ScoreList } from "@/components/Scores/ScoreList.tsx";
import { MaimaiStatisticsSection } from "@/components/Scores/maimai/StatisticsSection.tsx";
import { ChunithmStatisticsSection } from "@/components/Scores/chunithm/StatisticsSection.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";
import useCreateScoreStore from "@/hooks/useCreateScoreStore.ts";
import { usePlayer } from "@/hooks/queries/usePlayer.ts";
import { useScoreFilters } from "@/hooks/useScoreFilters.ts";
import {
  countActiveFilters,
  scoreRatingRanges,
  useFilteredScores,
} from "@/hooks/useFilteredScores.ts";

const sortKeys = {
  maimai: [
    { name: "曲目 ID", key: "id" },
    { name: "曲名", key: "song_name" },
    { name: "定数", key: "level_value" },
    { name: "达成率", key: "achievements" },
    { name: "DX Rating", key: "dx_rating" },
    { name: "最后游玩时间", key: "last_played_time" },
  ],
  chunithm: [
    { name: "曲目 ID", key: "id" },
    { name: "曲名", key: "song_name" },
    { name: "定数", key: "level_value" },
    { name: "成绩", key: "score" },
    { name: "Rating", key: "rating" },
    { name: "最后游玩时间", key: "last_played_time" },
  ],
};

const PAGE_SIZE = 20;

// 桌面端筛选面板从该断点起常驻侧栏，以下则使用抽屉
const FILTER_PANEL_BREAKPOINT = "lg";

export const ScoreListSection = () => {
  const [game] = useGame();

  const { player } = usePlayer(game);
  const { scores, isLoading, invalidate } = useScores(game);
  const [filteredSongs, setFilteredSongs] = useState<(MaimaiSongProps | ChunithmSongProps)[]>([]);
  const [songId, setSongId] = useState<number>(0);

  const [sortBy, setSortBy] = useState<string | null>(null);
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  const [page, setPage] = useState(1);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);

  const ratingRange = scoreRatingRanges[game];
  const { filters, setFilter, resetFilters, isDefault } = useScoreFilters({
    rating: ratingRange,
    endRating: ratingRange,
  });
  const filteredScores = useFilteredScores(scores, filters, isDefault);
  const activeFilterCount = useMemo(
    () => countActiveFilters(filters, ratingRange),
    [filters, ratingRange],
  );

  const { openModal: openCreateScoreModal } = useCreateScoreStore();
  const getSongList = useSongListStore((state) => state.getSongList);
  const songList = getSongList(game);
  const small = useMediaQuery("(max-width: 30rem)");

  const topRef = useRef<HTMLDivElement>(null);
  const countRowRef = useRef<HTMLDivElement>(null);
  const [countRowHeight, setCountRowHeight] = useState(0);

  useLayoutEffect(() => {
    const el = countRowRef.current;
    if (!el) return;
    const update = () => setCountRowHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSongId(0);
    setSortBy(null);
    setReverseSortDirection(false);
    resetFilters();
  }, [game]);

  useEffect(() => {
    setPage(1);
  }, [filteredScores]);

  const searchedScores = useMemo(() => {
    if (!filteredScores || isLoading) return [];
    if (!filteredSongs) return filteredScores;
    const songIds = new Set(filteredSongs.map((song) => song.id));
    return filteredScores.filter((score) => songIds.has(score.id));
  }, [filteredScores, filteredSongs, isLoading]);

  const sortedScores = useMemo(() => {
    if (!searchedScores.length || !sortBy || !songList) return searchedScores;

    const getCompareValue = (
      score: MaimaiScoreProps | ChunithmScoreProps,
      key: string,
    ): string | number | null => {
      if (key === "level_value") {
        const song = songList.find(score.id);
        if (!song) return null;
        if (songList instanceof MaimaiSongList && "type" in score) {
          const difficulty = songList.getDifficulty(
            song as MaimaiSongProps,
            score.type,
            score.level_index,
          );
          return difficulty?.level_value ?? null;
        } else if (songList instanceof ChunithmSongList) {
          const difficulty = songList.getDifficulty(song as ChunithmSongProps, score.level_index);
          return difficulty?.level_value ?? null;
        }
        return null;
      }
      if (key in score) {
        return (score as unknown as Record<string, string | number>)[key];
      }
      return null;
    };

    return [...searchedScores].sort((a, b) => {
      const valueA = getCompareValue(a, sortBy);
      const valueB = getCompareValue(b, sortBy);

      if (valueA === null || valueB === null) {
        if (valueA === null && valueB === null) return 0;
        return valueA === null ? 1 : -1;
      }

      if (typeof valueA === "string" && typeof valueB === "string") {
        return reverseSortDirection ? valueA.localeCompare(valueB) : valueB.localeCompare(valueA);
      }

      if (typeof valueA === "number" && typeof valueB === "number") {
        const dxRatingA = "dx_rating" in a ? (a.dx_rating ?? 0) : 0;
        const dxRatingB = "dx_rating" in b ? (b.dx_rating ?? 0) : 0;
        return reverseSortDirection
          ? valueA - valueB || dxRatingA - dxRatingB
          : valueB - valueA || dxRatingA - dxRatingB;
      }

      return 0;
    });
  }, [searchedScores, reverseSortDirection, sortBy, songList]);

  const totalPages = Math.ceil(sortedScores.length / PAGE_SIZE);
  const displayScores = sortedScores.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const currentSortKey = sortKeys[game].find((item) => item.key === sortBy);

  const handleSort = (key: string) => {
    if (sortBy === key) {
      setReverseSortDirection(!reverseSortDirection);
    } else {
      setSortBy(key);
      setReverseSortDirection(false);
    }
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleCreateScore = () => {
    openCreateScoreModal({
      game,
      onClose: (values) => {
        values && invalidate();
      },
    });
  };

  // 底部抽屉下滑关闭手势
  const sheetDrag = useRef<{ startY: number; content: HTMLElement } | null>(null);

  const handleSheetPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const content = event.currentTarget.closest(".mantine-Drawer-content") as HTMLElement | null;
    if (!content) return;
    sheetDrag.current = { startY: event.clientY, content };
    content.style.transition = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSheetPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = sheetDrag.current;
    if (!drag) return;
    const offsetY = Math.max(0, event.clientY - drag.startY);
    drag.content.style.transform = `translateY(${offsetY}px)`;
  };

  const handleSheetPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = sheetDrag.current;
    if (!drag) return;
    sheetDrag.current = null;
    const offsetY = Math.max(0, event.clientY - drag.startY);
    drag.content.style.transition = "transform 200ms ease";
    if (event.type !== "pointercancel" && offsetY > 72) {
      drag.content.style.transform = "translateY(100%)";
      const overlay = document.querySelector<HTMLElement>(".mantine-Drawer-overlay");
      if (overlay) {
        overlay.style.transition = "opacity 200ms ease";
        overlay.style.opacity = "0";
      }
      window.setTimeout(closeFilter, 200);
    } else {
      drag.content.style.transform = "";
    }
  };

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
        {sortKeys[game].map((item) => (
          <Menu.Item
            key={item.key}
            fw={sortBy === item.key ? 500 : undefined}
            rightSection={sortBy === item.key ? renderSortDirectionIcon(16) : null}
            onClick={() => handleSort(item.key)}
          >
            {item.name}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconRestore size={16} />}
          disabled={!sortBy}
          onClick={() => {
            setSortBy(null);
            setReverseSortDirection(false);
            setPage(1);
          }}
        >
          恢复默认排序
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );

  const filterTrigger = small ? (
    <Indicator
      label={activeFilterCount}
      size={16}
      disabled={activeFilterCount === 0}
      withBorder
      hiddenFrom={FILTER_PANEL_BREAKPOINT}
    >
      <ActionIcon variant="default" size="input-sm" aria-label="筛选成绩" onClick={openFilter}>
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
      onClick={openFilter}
      hiddenFrom={FILTER_PANEL_BREAKPOINT}
    >
      筛选
    </Button>
  );

  const createButton = small ? (
    <ActionIcon
      size="input-sm"
      variant="filled"
      disabled={!player}
      aria-label="创建成绩"
      onClick={handleCreateScore}
    >
      <IconPlus size={20} />
    </ActionIcon>
  ) : (
    <Button leftSection={<IconPlus size={20} />} disabled={!player} onClick={handleCreateScore}>
      创建成绩
    </Button>
  );

  const filterPanelTitle = (
    // 固定行高，避免角标出现/消失时标题行高度变化
    <Group gap="xs" wrap="nowrap" h={25}>
      <IconFilter size={20} />
      <Text fw={700}>筛选成绩</Text>
      {activeFilterCount > 0 && (
        <Badge variant="light" size="sm">
          {activeFilterCount}
        </Badge>
      )}
    </Group>
  );

  return (
    <div ref={topRef} className={classes.scrollAnchor}>
      <Flex gap="xs" align="center" wrap="nowrap" mb="sm">
        <SongCombobox
          value={songId}
          onSongsChange={(filteredSongs) => {
            setFilteredSongs(filteredSongs);
            setPage(1);
          }}
          placeholder="搜索曲名、别名或曲目 ID"
          style={{ flex: 1, minWidth: 0 }}
        />
        {sortMenu}
        {filterTrigger}
        {createButton}
      </Flex>
      <Flex gap="md" align="flex-start">
        <Box style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <Box
            ref={countRowRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 1,
              opacity: sortedScores.length > 0 || activeFilterCount > 0 ? 1 : 0,
              pointerEvents: sortedScores.length > 0 || activeFilterCount > 0 ? undefined : "none",
              transition: "opacity 0.2s ease",
            }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Text fz="sm" c="dimmed">
                共 <NumberFormatter value={sortedScores.length} thousandSeparator /> 条成绩
              </Text>
              {activeFilterCount > 0 && (
                <Button
                  variant="subtle"
                  color="gray"
                  size="compact-xs"
                  leftSection={<IconX size={14} />}
                  onClick={() => resetFilters()}
                >
                  清除筛选
                </Button>
              )}
            </Group>
          </Box>
          <AnimatePresence mode="wait" initial={false}>
            {match({ hasResults: totalPages > 0, isLoading })
              .with({ hasResults: true }, () => (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{
                    paddingTop: `calc(${countRowHeight || 28}px + var(--mantine-spacing-sm))`,
                  }}
                >
                  <ScoreList
                    scores={displayScores}
                    cols={{ base: 1, "400px": 2 }}
                    onScoreChange={(score) => {
                      score && invalidate();
                    }}
                  />
                  {totalPages > 1 && (
                    <Group justify="center" mt="md">
                      <Pagination
                        total={totalPages}
                        value={page}
                        onChange={handlePageChange}
                        size={small ? "sm" : "md"}
                        disabled={isLoading}
                      />
                    </Group>
                  )}
                </motion.div>
              ))
              .with({ hasResults: false, isLoading: true }, () => (
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
              .with({ hasResults: false, isLoading: false }, () => (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Flex gap="xs" align="center" direction="column" c="dimmed" p="xl">
                    <IconDatabaseOff size={64} stroke={1.5} />
                    <Text fz="sm">没有获取或筛选到任何成绩</Text>
                    {activeFilterCount > 0 && (
                      <Button mt="xs" variant="light" size="xs" onClick={() => resetFilters()}>
                        重置筛选条件
                      </Button>
                    )}
                  </Flex>
                </motion.div>
              ))
              .exhaustive()}
          </AnimatePresence>
        </Box>
        <Card
          withBorder
          radius="md"
          w={360}
          visibleFrom={FILTER_PANEL_BREAKPOINT}
          style={{ flexShrink: 0 }}
        >
          <Group justify="space-between" mb="md">
            {filterPanelTitle}
          </Group>
          <AdvancedFilter filters={filters} setFilter={setFilter} resetFilters={resetFilters} />
        </Card>
      </Flex>
      <Space h="md" />
      {game === "maimai" && (
        <MaimaiStatisticsSection scores={searchedScores as MaimaiScoreProps[]} />
      )}
      {game === "chunithm" && (
        <ChunithmStatisticsSection scores={searchedScores as ChunithmScoreProps[]} />
      )}
      <Drawer
        opened={filterOpened}
        onClose={closeFilter}
        position={small ? "bottom" : "right"}
        size={small ? "85%" : "md"}
        withCloseButton={!small}
        classNames={
          small
            ? {
                content: classes.bottomSheetContent,
                title: classes.bottomSheetTitle,
                body: classes.bottomSheetBody,
              }
            : undefined
        }
        scrollAreaComponent={ScrollArea.Autosize}
        title={
          small ? (
            <Stack
              gap={8}
              style={{ touchAction: "none" }}
              onPointerDown={handleSheetPointerDown}
              onPointerMove={handleSheetPointerMove}
              onPointerUp={handleSheetPointerEnd}
              onPointerCancel={handleSheetPointerEnd}
            >
              <div className={classes.dragHandle} />
              {filterPanelTitle}
            </Stack>
          ) : (
            filterPanelTitle
          )
        }
      >
        <AdvancedFilter filters={filters} setFilter={setFilter} resetFilters={resetFilters} />
      </Drawer>
    </div>
  );
};
