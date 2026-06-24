import React, { useEffect, useMemo, useRef, useState } from "react";
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
  ScrollArea,
  Space,
  Stack,
  Text,
} from "@mantine/core";
import classes from "./ScoreListSection.module.css";
import { AnimatePresence, motion } from "motion/react";
import { match } from "ts-pattern";
import { EmptyState } from "@/components/EmptyState.tsx";
import { AdvancedFilter } from "@/components/Scores/AdvancedFilter.tsx";
import { SongCombobox } from "@/components/SongCombobox.tsx";
import { ScoreList } from "@/components/Scores/ScoreList.tsx";
import { MaimaiStatisticsSection } from "@/components/Scores/maimai/StatisticsSection.tsx";
import { ChunithmStatisticsSection } from "@/components/Scores/chunithm/StatisticsSection.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";
import useCreateScoreStore from "@/hooks/useCreateScoreStore.ts";
import { usePlayer } from "@/hooks/queries/usePlayer.ts";
import { ScoreFilters, useScoreFilters } from "@/hooks/useScoreFilters.ts";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { ResponsivePagination } from "@/components/ResponsivePagination.tsx";
import {
  countActiveFilters,
  scoreRatingRanges,
  useFilteredScores,
} from "@/hooks/useFilteredScores.ts";
import type { Game } from "@/types/game";

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

type ScoreListUrlState = {
  page: number;
  search: string;
  sortBy: string | null;
  reverseSortDirection: boolean;
  filters: Partial<ScoreFilters>;
};

const scoreListSearchParams = [
  "page",
  "search",
  "sort",
  "order",
  "difficulty",
  "type",
  "genre",
  "version",
  "rating",
  "full_combo",
  "full_sync",
  "deluxe_star",
  "unplayed",
  "upload_from",
  "upload_to",
];

function parseListParam(value: string | null) {
  return value ? value.split(",").filter(Boolean) : [];
}

function parseNumberListParam(value: string | null) {
  return parseListParam(value)
    .map(Number)
    .filter((item) => Number.isFinite(item));
}

function parseRatingParam(value: string | null, ratingRange: [number, number]) {
  const [min, max] = parseNumberListParam(value);
  if (min === undefined || max === undefined || min > max) return ratingRange;
  const bounded = [Math.max(ratingRange[0], min), Math.min(ratingRange[1], max)] as [
    number,
    number,
  ];
  return bounded[0] <= bounded[1] ? bounded : ratingRange;
}

function readScoreListUrlState(
  game: Game,
  ratingRange: [number, number],
  params: URLSearchParams,
): ScoreListUrlState {
  const page = Number(params.get("page"));
  const sort = params.get("sort");
  const sortBy = sortKeys[game].some((item) => item.key === sort) ? sort : null;
  const rating = parseRatingParam(params.get("rating"), ratingRange);
  const isMaimai = game === "maimai";

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    search: params.get("search") ?? "",
    sortBy,
    reverseSortDirection: sortBy ? params.get("order") === "asc" : false,
    filters: {
      difficulty: parseListParam(params.get("difficulty")),
      type: isMaimai ? parseListParam(params.get("type")) : [],
      genre: parseListParam(params.get("genre")),
      version: parseNumberListParam(params.get("version")),
      rating,
      endRating: rating,
      fullCombo: parseListParam(params.get("full_combo")),
      fullSync: parseListParam(params.get("full_sync")),
      deluxeStar: isMaimai ? parseNumberListParam(params.get("deluxe_star")) : [],
      showUnplayed: params.get("unplayed") === "1",
      uploadTime: [params.get("upload_from"), params.get("upload_to")],
    },
  };
}

function writeListParam(params: URLSearchParams, key: string, values: string[] | number[]) {
  if (values.length > 0) {
    params.set(key, values.join(","));
  }
}

function writeScoreListUrlState(state: ScoreListUrlState, ratingRange: [number, number]) {
  const url = new URL(window.location.href);
  scoreListSearchParams.forEach((param) => url.searchParams.delete(param));

  if (state.page > 1) {
    url.searchParams.set("page", String(state.page));
  }

  const search = state.search.trim();
  if (search) {
    url.searchParams.set("search", search);
  }

  if (state.sortBy) {
    url.searchParams.set("sort", state.sortBy);
    url.searchParams.set("order", state.reverseSortDirection ? "asc" : "desc");
  }

  const { filters } = state;
  writeListParam(url.searchParams, "difficulty", filters.difficulty ?? []);
  writeListParam(url.searchParams, "type", filters.type ?? []);
  writeListParam(url.searchParams, "genre", filters.genre ?? []);
  writeListParam(url.searchParams, "version", filters.version ?? []);
  writeListParam(url.searchParams, "full_combo", filters.fullCombo ?? []);
  writeListParam(url.searchParams, "full_sync", filters.fullSync ?? []);
  writeListParam(url.searchParams, "deluxe_star", filters.deluxeStar ?? []);

  const rating = filters.endRating ?? ratingRange;
  if (rating[0] !== ratingRange[0] || rating[1] !== ratingRange[1]) {
    url.searchParams.set("rating", rating.join(","));
  }

  if (filters.showUnplayed) {
    url.searchParams.set("unplayed", "1");
  }

  if (filters.uploadTime?.[0]) {
    url.searchParams.set("upload_from", filters.uploadTime[0]);
  }
  if (filters.uploadTime?.[1]) {
    url.searchParams.set("upload_to", filters.uploadTime[1]);
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
  }
}

export const ScoreListSection = () => {
  const [game] = useGame();
  const ratingRange = scoreRatingRanges[game];
  const [initialUrlState] = useState(() =>
    readScoreListUrlState(game, ratingRange, new URLSearchParams(window.location.search)),
  );

  const { player } = usePlayer(game);
  const { scores, isLoading, invalidate } = useScores(game);
  const [filteredSongs, setFilteredSongs] = useState<
    (MaimaiSongProps | ChunithmSongProps)[] | null
  >(null);
  const [search, setSearch] = useState(initialUrlState.search);

  const [sortBy, setSortBy] = useState<string | null>(initialUrlState.sortBy);
  const [reverseSortDirection, setReverseSortDirection] = useState(
    initialUrlState.reverseSortDirection,
  );

  const [page, setPage] = useState(initialUrlState.page);
  const [filterOpened, { open: openFilter, close: closeFilter }] = useDisclosure(false);
  useBackDismiss(filterOpened, closeFilter);

  const defaultFilters = useMemo(
    () => ({
      rating: ratingRange,
      endRating: ratingRange,
    }),
    [ratingRange],
  );
  const { filters, setFilter, resetFilters, isDefault } = useScoreFilters(
    defaultFilters,
    initialUrlState.filters,
  );
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
  const previousGameRef = useRef(game);

  useEffect(() => {
    if (previousGameRef.current === game) return;
    previousGameRef.current = game;

    setSearch("");
    setFilteredSongs(null);
    setSortBy(null);
    setReverseSortDirection(false);
    setPage(1);
    resetFilters();
    writeScoreListUrlState(
      {
        page: 1,
        search: "",
        sortBy: null,
        reverseSortDirection: false,
        filters: defaultFilters,
      },
      ratingRange,
    );
  }, [defaultFilters, game, ratingRange, resetFilters]);

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
  // Clamp during render rather than in an effect: when the list shrinks below the
  // current page, React re-renders synchronously without an extra commit cycle.
  if (totalPages > 0 && page > totalPages) {
    setPage(totalPages);
  }
  const displayScores = sortedScores.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const currentSortKey = sortKeys[game].find((item) => item.key === sortBy);

  useEffect(() => {
    writeScoreListUrlState(
      {
        page,
        search,
        sortBy,
        reverseSortDirection,
        filters,
      },
      ratingRange,
    );
  }, [filters, page, ratingRange, reverseSortDirection, search, sortBy]);

  const setScoreFilter = <K extends keyof ScoreFilters>(key: K, value: ScoreFilters[K]) => {
    setFilter(key, value);
    setPage(1);
  };

  const resetScoreFilters = () => {
    resetFilters();
    setPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

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
          searchValue={search}
          onSearchChange={handleSearchChange}
          onSongsChange={setFilteredSongs}
          placeholder="搜索曲名、别名或曲目 ID"
          style={{ flex: 1, minWidth: 0 }}
        />
        {sortMenu}
        {filterTrigger}
        {createButton}
      </Flex>
      <Flex gap="md" align="flex-start">
        <Box style={{ flex: 1, minWidth: 0 }}>
          <AnimatePresence mode="wait" initial={false}>
            {match({ hasResults: totalPages > 0, isLoading })
              .with({ hasResults: true }, () => (
                <motion.div
                  key="list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {totalPages > 1 && (
                    <Group justify="center" mb="md">
                      <ResponsivePagination
                        total={totalPages}
                        value={page}
                        onChange={handlePageChange}
                        disabled={isLoading}
                      />
                    </Group>
                  )}
                  <ScoreList
                    scores={displayScores}
                    cols={{ base: 1, "400px": 2 }}
                    onScoreChange={(score) => {
                      score && invalidate();
                    }}
                  />
                  {totalPages > 1 && (
                    <Group justify="center" mt="md">
                      <ResponsivePagination
                        total={totalPages}
                        value={page}
                        onChange={handlePageChange}
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
                  <EmptyState
                    icon={<IconDatabaseOff size={64} stroke={1.5} />}
                    title="没有获取或筛选到任何成绩"
                  >
                    {activeFilterCount > 0 && (
                      <Button mt="xs" variant="light" size="xs" onClick={resetScoreFilters}>
                        重置筛选条件
                      </Button>
                    )}
                  </EmptyState>
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
          <AdvancedFilter
            filters={filters}
            setFilter={setScoreFilter}
            resetFilters={resetScoreFilters}
          />
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
        <AdvancedFilter
          filters={filters}
          setFilter={setScoreFilter}
          resetFilters={resetScoreFilters}
        />
      </Drawer>
    </div>
  );
};
