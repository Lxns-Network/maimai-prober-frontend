import {
  Accordion,
  ActionIcon,
  Badge,
  Center,
  CloseButton,
  Container,
  Flex,
  Group,
  Indicator,
  Overlay,
  Paper,
  Space,
  Text,
  TextInput,
} from "@mantine/core";
import { useReducedMotion } from "@mantine/hooks";
import { IconArrowsSort, IconDots, IconFilter, IconPlus } from "@tabler/icons-react";
import clsx from "clsx";
import { memo, type ReactNode, useEffect, useRef, useState } from "react";
import { AnimatedGrid } from "@/components/AnimatedGrid";
import { AdvancedFilter } from "@/components/Scores/AdvancedFilter";
import { ScoreCard } from "@/components/Scores/ScoreList";
import { rankData } from "@/components/Scores/ScoreHistory";
import { MaimaiChart } from "@/components/Scores/maimai/Chart";
import { MaimaiScoreHistory } from "@/components/Scores/maimai/ScoreHistory";
import { MaimaiScoreModalContent } from "@/components/Scores/maimai/ScoreModal";
import { countActiveFilters, scoreRatingRanges } from "@/hooks/useFilteredScores";
import { type ScoreFilters, useScoreFilters } from "@/hooks/useScoreFilters";
import type { MaimaiScoreProps } from "@/types/score";
import { getDifficulty, type MaimaiDifficultyProps } from "@/utils/api/song/maimai";
import classes from "./ScoreShowcase.module.css";
import {
  showcaseDetailScore,
  showcaseHistory,
  showcaseScores,
  showcaseSong,
} from "./scoreShowcaseData";

const ratingRange = scoreRatingRanges.maimai;

const defaultFilters: Partial<ScoreFilters> = { rating: ratingRange, endRating: ratingRange };

const initialFilters: Partial<ScoreFilters> = {
  ...defaultFilters,
  difficulty: ["3"],
  rating: [14, 15],
  endRating: [14, 15],
};

const keyOf = (score: MaimaiScoreProps) => `${score.id}:${score.type}:${score.level_index}`;

/** 成绩列表页的移动端布局，筛选抽屉按样式表里的关键帧循环打开与收起。 */
export function ScoreListScene() {
  const { filters, setFilter, resetFilters } = useScoreFilters(defaultFilters, initialFilters);
  const activeFilterCount = countActiveFilters(filters, ratingRange);

  return (
    <div className={classes.scene}>
      <Flex gap="xs" align="center" wrap="nowrap" mb="sm">
        <TextInput
          placeholder="搜索曲名、别名或曲目 ID"
          readOnly
          style={{ flex: 1, minWidth: 0 }}
        />
        <Indicator size={8} disabled withBorder>
          <ActionIcon variant="default" size="input-sm" aria-label="排序方式">
            <IconArrowsSort size={20} />
          </ActionIcon>
        </Indicator>
        <span className={classes.tapAnchor}>
          <Indicator label={activeFilterCount} size={16} withBorder>
            <ActionIcon variant="default" size="input-sm" aria-label="筛选成绩">
              <IconFilter size={20} />
            </ActionIcon>
          </Indicator>
          <span className={clsx(classes.tapRing, classes.tapOpen)} />
        </span>
        <ActionIcon size="input-sm" variant="filled" aria-label="创建成绩">
          <IconPlus size={20} />
        </ActionIcon>
      </Flex>
      <AnimatedGrid
        items={showcaseScores}
        getKey={keyOf}
        cols={{ base: 1 }}
        renderItem={(score) => <ScoreCard game="maimai" score={score} />}
      />
      <Overlay className={classes.overlay} backgroundOpacity={0.6} zIndex={300} radius={0} />
      <span className={clsx(classes.tapRing, classes.tapClose)} />
      <Paper className={classes.sheet} shadow="xl" radius={0}>
        <div className={classes.dragHandle} />
        <Group gap="xs" wrap="nowrap" h={25} mb="md">
          <IconFilter size={20} />
          <Text fw={700}>筛选成绩</Text>
          <Badge variant="light" size="sm">
            {activeFilterCount}
          </Badge>
        </Group>
        <AdvancedFilter
          game="maimai"
          filters={filters}
          setFilter={setFilter}
          resetFilters={resetFilters}
        />
      </Paper>
    </div>
  );
}

function TapLabel({
  value,
  active,
  children,
}: {
  value: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <span className={classes.tapAnchor} data-tap={value}>
      {children}
      {active && <span className={clsx(classes.tapRing, classes.tapOnce)} />}
    </span>
  );
}

const HistoryChart = memo(function HistoryChart() {
  return <MaimaiScoreHistory scores={showcaseHistory} minAchievements={rankData.maimai.A} />;
});

const ChartDetails = memo(function ChartDetails({
  difficulty,
}: {
  difficulty: MaimaiDifficultyProps;
}) {
  return <MaimaiChart difficulty={difficulty} />;
});

const DETAIL_CYCLE_MS = 12000;
const MODAL_HEADER_HEIGHT = 60;

export function ScoreDetailScene() {
  const reducedMotion = useReducedMotion();
  const viewport = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [tapping, setTapping] = useState<string | null>(null);
  const difficulty = getDifficulty(
    showcaseSong,
    showcaseDetailScore.type,
    showcaseDetailScore.level_index,
  );

  useEffect(() => {
    if (reducedMotion) {
      setOpened("history");
      return;
    }

    const timers = new Set<number>();
    const after = (ms: number, run: () => void) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        run();
      }, ms);
      timers.add(id);
    };

    const measure = (value: string) => {
      const box = viewport.current;
      const item = box?.querySelector<HTMLElement>(`[data-item="${value}"]`);
      if (!box || !item) return null;
      const boxRect = box.getBoundingClientRect();
      const scale = box.offsetWidth > 0 ? boxRect.width / box.offsetWidth : 1;
      const rect = item.getBoundingClientRect();
      return {
        box,
        top: (rect.top - boxRect.top) / scale,
        bottom: (rect.bottom - boxRect.top) / scale,
      };
    };

    const ensureVisible = (value: string) => {
      const found = measure(value);
      if (!found) return;
      const { box, top, bottom } = found;
      const safeTop = MODAL_HEADER_HEIGHT + 8;
      if (top >= safeTop && bottom <= box.clientHeight - 8) return;
      const delta = top - safeTop;
      if (Math.abs(delta) < 12) return;
      box.scrollTo({ top: box.scrollTop + delta, behavior: "smooth" });
    };

    const tap = (value: string) => {
      ensureVisible(value);
      after(500, () => setTapping(value));
      after(800, () => setOpened(value));
      after(1200, () => setTapping(null));
      after(1500, () => ensureVisible(value));
    };

    const cycle = () => {
      setOpened(null);
      if (viewport.current && viewport.current.scrollTop > 0) {
        viewport.current.scrollTo({ top: 0, behavior: "smooth" });
      }
      // 先点谱面详情，再点游玩历史记录时它位于谱面详情上方
      after(2400, () => tap("chart"));
      after(7000, () => tap("history"));
      after(DETAIL_CYCLE_MS, cycle);
    };

    cycle();
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [reducedMotion]);

  return (
    <div ref={viewport} className={classes.modalScene}>
      <Group
        className={classes.modalHeader}
        justify="space-between"
        wrap="nowrap"
        px="md"
        h={MODAL_HEADER_HEIGHT}
      >
        <Text>成绩详情</Text>
        <Group wrap="nowrap" gap="xs">
          <ActionIcon variant="subtle" color="gray" aria-label="更多操作">
            <IconDots size={18} stroke={1.5} />
          </ActionIcon>
          <CloseButton aria-label="关闭" />
        </Group>
      </Group>
      <Container>
        <MaimaiScoreModalContent score={showcaseDetailScore} song={showcaseSong} />
      </Container>
      <Space h="md" />
      <div>
        <Accordion
          chevronPosition="left"
          variant="filled"
          radius={0}
          value={opened}
          onChange={setOpened}
        >
          <Accordion.Item value="history" data-item="history">
            <Center>
              <Accordion.Control>
                <TapLabel value="history" active={tapping === "history"}>
                  游玩历史记录
                </TapLabel>
              </Accordion.Control>
              <ActionIcon variant="subtle" color="gray" mr="xs" aria-label="最低评级">
                <IconDots size={18} stroke={1.5} />
              </ActionIcon>
            </Center>
            <Accordion.Panel>
              <HistoryChart />
            </Accordion.Panel>
          </Accordion.Item>
          {difficulty && (
            <Accordion.Item value="chart" data-item="chart">
              <Accordion.Control>
                <TapLabel value="chart" active={tapping === "chart"}>
                  谱面详情
                </TapLabel>
              </Accordion.Control>
              <Accordion.Panel>
                <ChartDetails difficulty={difficulty} />
              </Accordion.Panel>
            </Accordion.Item>
          )}
          <Accordion.Item value="comment">
            <Accordion.Control>
              <Group>
                <span>评分与评论</span>
                <Badge color="gray" variant="light">
                  12
                </Badge>
              </Group>
            </Accordion.Control>
          </Accordion.Item>
          <Accordion.Item value="ranking">
            <Accordion.Control>排行榜</Accordion.Control>
          </Accordion.Item>
        </Accordion>
      </div>
    </div>
  );
}
