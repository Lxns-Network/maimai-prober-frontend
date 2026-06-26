import { useEffect, useMemo, useState } from "react";
import { Card, Divider, Group, Progress, SimpleGrid, Stack, Text } from "@mantine/core";
import {
  TimingTimeline,
  isHoldEndNote,
  isHoldStartNote,
  isSlideNote,
  isTapNote,
  isTouchNote,
  isTouchHoldStartNote,
  type Chart,
  type MaimaiAchievementNoteCounts,
  type Note,
  calculateMaimaiAchievementProgress,
} from "@lxns-network/maimai-chart-engine";
import { IconFileAnalytics } from "@tabler/icons-react";
import { useShallow } from "zustand/react/shallow";
import {
  useCanvasDebugInfoStore,
  type CanvasDebugInfo,
} from "../../stores/useCanvasDebugInfoStore";
import { useGameStore } from "../../stores/useGameStore";
import {
  DEFAULT_BUCKET_DURATION_MS,
  calculateNoteCounts,
  getBucketAtMs,
  getBucketDensityPerSecond,
} from "../../utils/chartDensity";
import classes from "./ChartInfoPanel.module.css";

const INFO_PANEL_REFRESH_MS = 250;
const FPS_GRAPH_WIDTH = 240;
const FPS_GRAPH_HEIGHT = 48;

interface ChartStats {
  noteCompletionTimes: number[];
  breakCompletionTimes: number[];
  tapTimes: number[];
  holdTimes: number[];
  slideTimes: number[];
  touchTimes: number[];
}

interface ProgressStatProps {
  label: string;
  completed: number;
  total: number;
  color: string;
}

interface FullscreenNoteRowProps {
  label: string;
  completed: number;
  total: number;
  totalRow?: boolean;
}

function getSlidePathEndMs(note: Extract<Note, { type: "slide" }>, index: number): number {
  const delayMs = note.allDelayMs?.[index] ?? note.delayMs ?? 0;
  const durationMs = note.allDurationMs?.[index] ?? note.durationMs ?? 0;
  return note.timingMs + delayMs + durationMs;
}

function buildChartStats(chart: Chart): ChartStats {
  const noteCompletionTimes: number[] = [];
  const breakCompletionTimes: number[] = [];
  const tapTimes: number[] = [];
  const holdTimes: number[] = [];
  const slideTimes: number[] = [];
  const touchTimes: number[] = [];

  for (const note of chart.notes) {
    if (
      isTapNote(note) ||
      isHoldEndNote(note) ||
      (isSlideNote(note) && !note.isHeadless) ||
      isTouchNote(note) ||
      note.type === "touch-hold-end"
    ) {
      noteCompletionTimes.push(note.timingMs);
    }

    if (isTapNote(note) && note.type !== "break") {
      tapTimes.push(note.timingMs);
    }
    if (isHoldStartNote(note)) {
      holdTimes.push(note.timingMs);
    }
    if (isTouchNote(note) || isTouchHoldStartNote(note)) {
      touchTimes.push(note.timingMs);
    }

    if (isSlideNote(note)) {
      const pathCount = note.allSlideSegments?.length ?? 1;
      for (let i = 0; i < pathCount; i++) {
        noteCompletionTimes.push(getSlidePathEndMs(note, i));
        slideTimes.push(getSlidePathEndMs(note, i));
      }
    }

    const isBreak =
      note.type === "break" ||
      (isSlideNote(note) && note.isStartBreak) ||
      (isHoldStartNote(note) && note.isBreakHold);

    if (isBreak) {
      breakCompletionTimes.push(note.timingMs);
    }

    if (isSlideNote(note) && note.allSlideBreaks) {
      for (let i = 0; i < note.allSlideBreaks.length; i++) {
        if (note.allSlideBreaks[i]) {
          breakCompletionTimes.push(getSlidePathEndMs(note, i));
        }
      }
    }
  }

  return {
    noteCompletionTimes: noteCompletionTimes.sort((a, b) => a - b),
    breakCompletionTimes: breakCompletionTimes.sort((a, b) => a - b),
    tapTimes: tapTimes.sort((a, b) => a - b),
    holdTimes: holdTimes.sort((a, b) => a - b),
    slideTimes: slideTimes.sort((a, b) => a - b),
    touchTimes: touchTimes.sort((a, b) => a - b),
  };
}

function countCompleted(sortedTimes: readonly number[], currentTimeMs: number): number {
  let lo = 0;
  let hi = sortedTimes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedTimes[mid] <= currentTimeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function formatNumber(value: number, digits: number = 2): string {
  return value.toFixed(digits).replace(/\.?0+$/, "");
}

function formatClock(ms: number): string {
  const totalMs = Math.max(0, Math.round(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function getFpsGraphMax(fpsHistory: readonly number[], currentFps: number): number {
  return Math.max(60, currentFps, ...fpsHistory);
}

function getFpsGraphPoints(fpsHistory: readonly number[], maxFps: number): string {
  if (fpsHistory.length === 0) return "";
  const lastIndex = Math.max(1, fpsHistory.length - 1);
  return fpsHistory
    .map((fps, index) => {
      const x = (index / lastIndex) * FPS_GRAPH_WIDTH;
      const y = FPS_GRAPH_HEIGHT - (Math.min(fps, maxFps) / maxFps) * FPS_GRAPH_HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className={classes.metric}>
      <span className={classes.metricLabel}>{label}</span>
      <span className={classes.metricValue}>{value}</span>
    </div>
  );
}

function ProgressStat({ label, completed, total, color }: ProgressStatProps) {
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className={classes.statRow}>
      <Group justify="space-between" gap="xs">
        <Text size="xs" c="dimmed">
          {label}
        </Text>
        <Text size="xs" ff="monospace" fw={700}>
          {completed} / {total}
        </Text>
      </Group>
      <Progress value={progress} size="xs" radius="xs" color={color} />
    </div>
  );
}

function FullscreenNoteRow({ label, completed, total, totalRow = false }: FullscreenNoteRowProps) {
  return (
    <div
      className={totalRow ? `${classes.hudNoteRow} ${classes.hudNoteRowTotal}` : classes.hudNoteRow}
    >
      <span className={classes.hudNoteLabel}>{label}</span>
      <span className={classes.hudNoteValue}>
        {completed} / {total}
      </span>
    </div>
  );
}

function RenderDebug({ debugInfo }: { debugInfo: CanvasDebugInfo }) {
  const averageFps =
    debugInfo.fpsHistory.length > 0
      ? debugInfo.fpsHistory.reduce((sum, fps) => sum + fps, 0) / debugInfo.fpsHistory.length
      : null;
  const graphMax = getFpsGraphMax(debugInfo.fpsHistory, debugInfo.fps);
  const graphPoints = getFpsGraphPoints(debugInfo.fpsHistory, graphMax);

  return (
    <div className={classes.renderDebug}>
      <Group justify="space-between" gap="xs" mb={6}>
        <Text size="xs" fw={700}>
          渲染
        </Text>
        <Text size="xs" c="dimmed" ff="monospace">
          {averageFps !== null ? `avg ${averageFps.toFixed(1)}` : "avg -"} / now{" "}
          {debugInfo.fps || "-"}
        </Text>
      </Group>
      <div className={classes.debugGrid}>
        <span>Canvas</span>
        <span>
          {debugInfo.backingWidth} x {debugInfo.backingHeight}
        </span>
        <span>CSS</span>
        <span>
          {debugInfo.cssWidth} x {debugInfo.cssHeight}
        </span>
        <span>DPR</span>
        <span>
          {debugInfo.canvasDpr.toFixed(2)} / {debugInfo.deviceDpr.toFixed(2)}
        </span>
        <span>Clock</span>
        <span>{debugInfo.clockSource}</span>
      </div>
      <svg
        className={classes.fpsGraph}
        viewBox={`0 0 ${FPS_GRAPH_WIDTH} ${FPS_GRAPH_HEIGHT}`}
        aria-hidden="true"
      >
        <line x1="0" y1={FPS_GRAPH_HEIGHT / 2} x2={FPS_GRAPH_WIDTH} y2={FPS_GRAPH_HEIGHT / 2} />
        {graphPoints && <polyline points={graphPoints} />}
      </svg>
    </div>
  );
}

export function ChartInfoPanel({ fullscreen = false }: { fullscreen?: boolean }) {
  const { chartData, isPlaying, timeline } = useGameStore(
    useShallow((state) => ({
      chartData: state.chartData,
      isPlaying: state.isPlaying,
      timeline: state.timeline,
    })),
  );
  const debugInfo = useCanvasDebugInfoStore((state) => state.debugInfo);
  const [currentBeats, setCurrentBeats] = useState(0);
  const timelineEndBeats = Math.max(0, timeline.totalMeasures - 1) * timeline.beatsPerMeasure;

  useEffect(() => {
    const updateCurrentBeats = () => {
      setCurrentBeats(useGameStore.getState().getCurrentTimeInBeats());
    };

    updateCurrentBeats();
    if (!isPlaying) return;

    const intervalId = window.setInterval(updateCurrentBeats, INFO_PANEL_REFRESH_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [
    chartData,
    isPlaying,
    timeline.currentMeasure,
    timeline.currentPosition,
    timeline.preciseTime,
  ]);

  const timingTimeline = useMemo(
    () => (chartData ? TimingTimeline.fromChart(chartData) : null),
    [chartData],
  );
  const chartStats = useMemo(() => (chartData ? buildChartStats(chartData) : null), [chartData]);
  const densityBuckets = useMemo(() => {
    if (!chartData || !timingTimeline) return [];

    const totalMs = timingTimeline.msFromBeat(timelineEndBeats);
    return calculateNoteCounts(chartData.notes, 0, totalMs);
  }, [chartData, timingTimeline, timelineEndBeats]);

  if (!chartData || !timingTimeline || !chartStats) {
    if (fullscreen) {
      return (
        <div className={classes.hud}>
          <div className={classes.hudSection}>
            <div className={`${classes.hudTitle} ${classes.hudTitleNoteCount}`}>NOTE COUNT</div>
            <div className={classes.hudLoading}>LOADING</div>
          </div>
        </div>
      );
    }

    return (
      <Card className={classes.card} radius="lg" withBorder>
        <Stack gap={4}>
          <Group gap="xs">
            <IconFileAnalytics size={20} />
            <Text size="sm" fw={500}>
              谱面信息
            </Text>
          </Group>
          <Text size="xs" c="dimmed">
            等待谱面加载
          </Text>
        </Stack>
      </Card>
    );
  }

  const currentMs = timingTimeline.msFromBeat(currentBeats);
  const divisor = timingTimeline.divisorAtBeat(currentBeats);
  const totalMs = timingTimeline.msFromBeat(timelineEndBeats);
  const position = `${formatNumber(currentBeats, 2)} beat`;
  const completedNotes = countCompleted(chartStats.noteCompletionTimes, currentMs);
  const completedBreaks = countCompleted(chartStats.breakCompletionTimes, currentMs);
  const completedTaps = countCompleted(chartStats.tapTimes, currentMs);
  const completedHolds = countCompleted(chartStats.holdTimes, currentMs);
  const completedSlides = countCompleted(chartStats.slideTimes, currentMs);
  const completedTouches = countCompleted(chartStats.touchTimes, currentMs);
  const totalNotes = chartStats.noteCompletionTimes.length;
  const completedCounts: MaimaiAchievementNoteCounts = {
    tap: completedTaps,
    hold: completedHolds,
    slide: completedSlides,
    touch: completedTouches,
    break: completedBreaks,
  };
  const totalCounts: MaimaiAchievementNoteCounts = {
    tap: chartStats.tapTimes.length,
    hold: chartStats.holdTimes.length,
    slide: chartStats.slideTimes.length,
    touch: chartStats.touchTimes.length,
    break: chartStats.breakCompletionTimes.length,
  };
  const achievement = calculateMaimaiAchievementProgress(completedCounts, totalCounts);
  const currentDensity = getBucketDensityPerSecond(
    getBucketAtMs(densityBuckets, currentMs),
    DEFAULT_BUCKET_DURATION_MS,
  );

  if (fullscreen) {
    return (
      <div className={classes.hud}>
        <div className={classes.hudSection}>
          <div className={`${classes.hudTitle} ${classes.hudTitleAchievement}`}>ACHIEVEMENT</div>
          <div className={classes.hudAchievementValue}>
            <span>{achievement.toFixed(4)}</span>
            <span className={classes.hudPercent}>%</span>
          </div>
        </div>

        <div className={classes.hudSection}>
          <div className={`${classes.hudTitle} ${classes.hudTitleCombo}`}>COMBO</div>
          <div className={classes.hudComboValue}>{completedNotes}</div>
        </div>

        <div className={classes.hudSection}>
          <div className={`${classes.hudTitle} ${classes.hudTitleNoteCount}`}>NOTE COUNT</div>
          <div className={classes.hudNoteRows}>
            <FullscreenNoteRow label="TAP" completed={completedTaps} total={totalCounts.tap} />
            <FullscreenNoteRow label="HOLD" completed={completedHolds} total={totalCounts.hold} />
            <FullscreenNoteRow
              label="SLIDE"
              completed={completedSlides}
              total={totalCounts.slide}
            />
            <FullscreenNoteRow
              label="TOUCH"
              completed={completedTouches}
              total={totalCounts.touch}
            />
            <FullscreenNoteRow
              label="BREAK"
              completed={completedBreaks}
              total={totalCounts.break}
            />
            <FullscreenNoteRow
              label="TOTAL"
              completed={completedNotes}
              total={totalNotes}
              totalRow
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className={classes.card} radius="lg" withBorder>
      <Stack gap="sm">
        <Group align="flex-start" gap="xs" wrap="nowrap">
          <IconFileAnalytics size={20} />
          <div className={classes.heading}>
            <Text size="sm" fw={500}>
              谱面信息
            </Text>
          </div>
        </Group>

        <SimpleGrid cols={2} spacing="xs">
          <InfoMetric label="位置" value={position} />
          <InfoMetric label="时间" value={`${formatClock(currentMs)} / ${formatClock(totalMs)}`} />
          <InfoMetric label="分音" value={`1/${divisor}`} />
          <InfoMetric label="密度" value={`${Math.round(currentDensity)} note/s`} />
        </SimpleGrid>

        <Stack gap="xs">
          <ProgressStat
            label="连击"
            completed={completedNotes}
            total={chartStats.noteCompletionTimes.length}
            color="violet"
          />
          <ProgressStat
            label="TAP"
            completed={completedTaps}
            total={chartStats.tapTimes.length}
            color="pink"
          />
          <ProgressStat
            label="HOLD"
            completed={completedHolds}
            total={chartStats.holdTimes.length}
            color="grape"
          />
          <ProgressStat
            label="SLIDE"
            completed={completedSlides}
            total={chartStats.slideTimes.length}
            color="cyan"
          />
          <ProgressStat
            label="TOUCH"
            completed={completedTouches}
            total={chartStats.touchTimes.length}
            color="teal"
          />
          <ProgressStat
            label="BREAK"
            completed={completedBreaks}
            total={chartStats.breakCompletionTimes.length}
            color="orange"
          />
        </Stack>

        {import.meta.env.DEV && debugInfo && (
          <>
            <Divider />
            <RenderDebug debugInfo={debugInfo} />
          </>
        )}
      </Stack>
    </Card>
  );
}

export default ChartInfoPanel;
