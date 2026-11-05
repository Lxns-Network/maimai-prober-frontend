import { useMemo, useState } from "react";
import {
  Button,
  Card,
  Group,
  Progress,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconDatabaseOff, IconUserOff } from "@tabler/icons-react";
import { AnimatedGrid } from "@/components/AnimatedGrid";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { ResponsivePagination } from "@/components/ResponsivePagination";
import { AdvancedFilter } from "@/components/Scores/AdvancedFilter";
import { ScoreFilterButton, ScoreFilterDrawer } from "@/components/Scores/ScoreFilterDrawer";
import { ScoreSortMenu } from "@/components/Scores/ScoreSortMenu";
import profileClasses from "@/components/Profile/Profile.module.css";
import { usePlayer } from "@/hooks/queries/usePlayer";
import { useScores } from "@/hooks/queries/useScores";
import {
  countActiveFilters,
  scoreRatingRanges,
  useFilteredScores,
} from "@/hooks/useFilteredScores";
import useGame from "@/hooks/useGame";
import { ScoreFilters, useScoreFilters } from "@/hooks/useScoreFilters";
import useSongListStore from "@/hooks/useSongListStore";
import { FriendItem } from "@/types/friend";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import {
  CompareMetric,
  chartKey,
  chartLevelValue,
  compareScores,
  metricValue,
  ratingGap,
} from "@/utils/scoreCompare";
import { FriendVsCard } from "./FriendVsCard";
import { FriendVsHeader } from "./FriendVsHeader";
import { GAME_NAMES } from "./gameNames";
import { LoadingBlock } from "./LoadingBlock";

const PAGE_SIZE = 30;

type View = "behind" | "ahead";

type SortKey = "gap" | "rating" | "level";

const SORT_OPTIONS: { key: SortKey; name: string }[] = [
  { key: "gap", name: "差距" },
  { key: "rating", name: "Rating 差" },
  { key: "level", name: "定数" },
];

type AnyScore = MaimaiScoreProps | ChunithmScoreProps;

interface VsItem {
  mine?: AnyScore;
  theirs: AnyScore;
  gap: number;
}

const vsItemKey = (item: VsItem) => chartKey(item.theirs);

const VIEW_EMPTY: Record<View, string> = {
  behind: "没有落后于 TA 的谱面",
  ahead: "没有领先于 TA 的谱面",
};

/**
 * 只看谱面本身的条件；FC、FS、DX 星级与上传时间只按 TA 的成绩判断。
 * 「显示未游玩谱面」不交给 useFilteredScores 补占位成绩，而是由对比结果里仅 TA 玩过的谱面并入落后列表。
 */
const chartOnly = (filters: ScoreFilters): ScoreFilters => ({
  ...filters,
  fullCombo: [],
  fullSync: [],
  deluxeStar: [],
  uploadTime: [null, null],
  showUnplayed: false,
});

const hasScoreConditions = ({ fullCombo, fullSync, deluxeStar, uploadTime }: ScoreFilters) =>
  fullCombo.length > 0 ||
  fullSync.length > 0 ||
  deluxeStar.length > 0 ||
  !!uploadTime[0] ||
  !!uploadTime[1];

/**
 * 与好友逐谱面对比：双方各自的最佳成绩按谱面配对，全部在本地计算。
 * 调用方负责确认双方是好友，并传入对方的全部成绩；筛选条件随组件卸载丢弃，切换游戏时需重新挂载。
 */
export const FriendScoreComparison = ({
  friend,
  theirScores,
}: {
  friend: Pick<FriendItem, "games">;
  theirScores: (MaimaiScoreProps | ChunithmScoreProps)[];
}) => {
  const [game] = useGame();
  const { player, isLoading: playerLoading } = usePlayer(game);
  const { scores: myScores, isLoading, error, invalidate } = useScores(game);
  const [view, setView] = useState<View>("behind");
  const [metric, setMetric] = useState<CompareMetric>("score");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [reverseSortDirection, setReverseSortDirection] = useState(false);
  const sortKey: SortKey = sortBy ?? "gap";
  const songList = useSongListStore((state) => state[game]);
  const [filterOpened, filterDrawer] = useDisclosure(false);

  const ratingRange = scoreRatingRanges[game];
  const defaultFilters = useMemo(
    () => ({ rating: ratingRange, endRating: ratingRange }),
    [ratingRange],
  );
  const { filters, setFilter, resetFilters, isDefault } = useScoreFilters(defaultFilters);
  const chartFilters = useMemo(() => chartOnly(filters), [filters]);
  const activeFilterCount = countActiveFilters(filters, ratingRange);
  const chartFiltersDefault = countActiveFilters(chartFilters, ratingRange) === 0;
  const myScoresInScope = useFilteredScores(myScores, chartFilters, chartFiltersDefault);
  const theirScoresInScope = useFilteredScores(theirScores, chartFilters, chartFiltersDefault);
  const theirFilters = useMemo(() => ({ ...filters, showUnplayed: false }), [filters]);
  const theirMatchedScores = useFilteredScores(theirScores, theirFilters, isDefault);

  const activeMetric: CompareMetric = game === "maimai" ? metric : "score";
  const comparison = useMemo(() => {
    const result = compareScores(myScoresInScope, theirScoresInScope, activeMetric);
    if (!hasScoreConditions(filters)) return result;
    const matched = new Set(theirMatchedScores.map(chartKey));
    const keep = (pair: { theirs: AnyScore }) => matched.has(chartKey(pair.theirs));
    return {
      ...result,
      ahead: result.ahead.filter(keep),
      behind: result.behind.filter(keep),
      tied: result.tied.filter(keep),
      onlyTheirs: result.onlyTheirs.filter((theirs) => matched.has(chartKey(theirs))),
    };
  }, [myScoresInScope, theirScoresInScope, theirMatchedScores, filters, activeMetric]);

  const setComparisonFilter = <K extends keyof ScoreFilters>(key: K, value: ScoreFilters[K]) => {
    setFilter(key, value);
    setPage(1);
  };

  const resetComparisonFilters = () => {
    resetFilters();
    setPage(1);
  };

  const gameName = GAME_NAMES[game];

  if (playerLoading || (player && isLoading)) return <LoadingBlock />;

  if (!player) {
    return (
      <EmptyState
        icon={<IconUserOff size={64} stroke={1.5} />}
        title={`你尚未绑定「${gameName}」`}
      />
    );
  }

  if (error) {
    return (
      <QueryErrorState
        title="你的成绩加载失败"
        description="请检查网络连接后重试"
        onRetry={() => void invalidate()}
      />
    );
  }

  const { ahead, behind, tied, onlyTheirs, onlyMineCount } = comparison;
  const common = ahead.length + behind.length + tied.length;
  const percent = (count: number) => (common > 0 ? (count / common) * 100 : 0);

  const behindItems: VsItem[] = filters.showUnplayed
    ? [
        ...behind,
        ...onlyTheirs.map((theirs) => ({ theirs, gap: -metricValue(theirs, activeMetric) })),
      ].sort((a, b) => a.gap - b.gap)
    : behind;
  const viewItems: VsItem[] = view === "behind" ? behindItems : ahead;
  const direction = view === "behind" ? 1 : -1;
  const sign = reverseSortDirection ? -1 : 1;
  const items = viewItems
    .map((item) => ({
      item,
      value:
        sortKey === "gap"
          ? -direction * item.gap
          : sortKey === "rating"
            ? -direction * ratingGap(item.mine, item.theirs)
            : chartLevelValue(songList, item.theirs),
    }))
    .sort((a, b) => {
      if (a.value === undefined || b.value === undefined) {
        return Number(a.value === undefined) - Number(b.value === undefined);
      }
      return sign * (b.value - a.value || direction * (a.item.gap - b.item.gap));
    })
    .map(({ item }) => item);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const pageItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <Stack gap="md">
      <Card className={profileClasses.card} withBorder radius="md" p="md">
        <Stack gap="sm">
          <FriendVsHeader game={game} mine={player} theirs={friend.games[game].profile} />

          {common > 0 && (
            <>
              <Progress.Root size="lg" radius="xl">
                <Tooltip label={`你领先 ${ahead.length} 张`}>
                  <Progress.Section value={percent(ahead.length)} color="teal" />
                </Tooltip>
                <Tooltip label={`持平 ${tied.length} 张`}>
                  <Progress.Section value={percent(tied.length)} color="gray" />
                </Tooltip>
                <Tooltip label={`你落后 ${behind.length} 张`}>
                  <Progress.Section value={percent(behind.length)} color="red" />
                </Tooltip>
              </Progress.Root>
              <Group justify="space-between" gap="xs">
                <Text size="xs" c="teal" lh={1}>
                  领先 {ahead.length} 张
                </Text>
                <Text size="xs" c="dimmed" lh={1}>
                  持平 {tied.length} 张
                </Text>
                <Text size="xs" c="red" lh={1}>
                  落后 {behind.length} 张
                </Text>
              </Group>
            </>
          )}

          <Text size="xs" c="dimmed" lh={1}>
            共同游玩 {common} 张 · 仅 TA 玩过 {onlyTheirs.length} 张 · 仅我玩过 {onlyMineCount} 张
          </Text>
        </Stack>
      </Card>

      <Group gap="xs">
        <SegmentedControl
          value={view}
          onChange={(value) => {
            setView(value as View);
            setPage(1);
          }}
          flex={1}
          miw={200}
          data={[
            { value: "behind", label: `落后 ${behindItems.length}` },
            { value: "ahead", label: `领先 ${ahead.length}` },
          ]}
        />
        <Group gap="xs" ml="auto" wrap="nowrap">
          {game === "maimai" && (
            <SegmentedControl
              value={metric}
              onChange={(value) => {
                setMetric(value as CompareMetric);
                setPage(1);
              }}
              data={[
                { value: "score", label: "达成率" },
                { value: "dx_score", label: "DX 分数" },
              ]}
            />
          )}
          <ScoreSortMenu
            options={SORT_OPTIONS}
            sortBy={sortBy}
            reverseSortDirection={reverseSortDirection}
            onChange={(key, reverse) => {
              setSortBy(key as SortKey | null);
              setReverseSortDirection(reverse);
              setPage(1);
            }}
          />
          <ScoreFilterButton count={activeFilterCount} onClick={filterDrawer.open} />
        </Group>
      </Group>

      {items.length === 0 ? (
        <EmptyState icon={<IconDatabaseOff size={64} stroke={1.5} />} title={VIEW_EMPTY[view]}>
          {activeFilterCount > 0 && (
            <Button mt="xs" variant="light" size="xs" onClick={resetComparisonFilters}>
              重置筛选条件
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <AnimatedGrid
            items={pageItems}
            getKey={vsItemKey}
            cols={{ base: 1, "600px": 2 }}
            renderItem={(item) => (
              <FriendVsCard
                game={game}
                mine={item.mine}
                theirs={item.theirs}
                metric={activeMetric}
                ratingGap={sortKey === "rating" ? ratingGap(item.mine, item.theirs) : undefined}
              />
            )}
          />
          <ResponsivePagination
            total={totalPages}
            value={currentPage}
            onChange={setPage}
            hideWithOnePage
          />
        </>
      )}

      <ScoreFilterDrawer
        opened={filterOpened}
        onClose={filterDrawer.close}
        count={activeFilterCount}
      >
        <AdvancedFilter
          filters={filters}
          setFilter={setComparisonFilter}
          resetFilters={resetComparisonFilters}
        />
      </ScoreFilterDrawer>
    </Stack>
  );
};
