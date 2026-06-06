import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { notifications } from "@mantine/notifications";
import {
  ActionIcon,
  Button,
  Card,
  Checkbox,
  Collapse,
  Group,
  HoverCard,
  Menu,
  Progress,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconVolume,
  IconVolumeOff,
  IconMusic,
  IconChevronDown,
  IconAdjustments,
  IconHelp,
  IconMaximize,
  IconMinimize,
  IconCamera,
  IconShare,
  IconClipboard,
  IconMovie,
  IconUpload,
  IconLink,
} from "@tabler/icons-react";
import { useGameStore, playbackTimeRef } from "../../stores/useGameStore";
import { useGameSettingsStore } from "../../stores/useGameSettingsStore";
import {
  parseSimaiChart,
  type ChartDifficulty,
  DIFFICULTY_NAMES,
  DIFFICULTY_COLORS,
} from "@lxns-network/maimai-chart-engine";
import { NoteCountGraph } from "../NoteCountGraph";
import { ChartDensityTimeline } from "../ChartDensityTimeline/ChartDensityTimeline";
import { ExportRangeOverlay } from "../ExportRangeOverlay/ExportRangeOverlay";
import { SimaiStatementList } from "../SimaiStatementList";
import { exportChartGif } from "../../utils/exportChartGif";
import { useExportRange } from "../../hooks/useExportRange";
import { getChartIdForFilename, downloadBlob } from "../../utils/fileDownload";
import { formatDuration } from "../../utils/format";
import { clamp } from "../../utils/math";
import { beatsToMs, msToBeats } from "../../utils/timeConversion";
import classes from "./Controls.module.css";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getDifficultyTextColor(
  isSelected: boolean,
  isLightColor: boolean,
  fallback: string,
): string {
  if (isSelected && isLightColor) return "#BE6FF8";
  if (isSelected) return "#fff";
  if (isLightColor) return "#c4b5fd";
  return fallback;
}

function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith("audio/")) return true;

  const lowerName = file.name.toLowerCase();
  return [".mp3", ".wav", ".ogg", ".m4a", ".flac"].some((extension) =>
    lowerName.endsWith(extension),
  );
}

type DifficultyAnchor = {
  difficulty: number;
  index: number;
  line: number;
};

const DEBUG_DIFFICULTY_NAMES: Record<number, string> = {
  0: "EASY",
  ...DIFFICULTY_NAMES,
};

function getDebugDifficultyLabel(difficulty: number): string {
  return DEBUG_DIFFICULTY_NAMES[difficulty] ?? String(difficulty);
}

function getDifficultyAnchors(simaiText: string): DifficultyAnchor[] {
  const anchors: DifficultyAnchor[] = [];
  const pattern = /^&inote_(\d+)=/gim;
  let match: RegExpExecArray | null;
  let line = 1;
  let lastNewlineIdx = -1;

  while ((match = pattern.exec(simaiText)) !== null) {
    for (; lastNewlineIdx < match.index; lastNewlineIdx++) {
      if (simaiText[lastNewlineIdx] === "\n") line++;
    }
    anchors.push({ difficulty: Number(match[1]), index: match.index, line });
  }

  return anchors;
}

type PlaybackControlsProps = {
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
};

export function PlaybackControls({ onToggleFullscreen, isFullscreen }: PlaybackControlsProps) {
  const {
    isPlaying,
    pendingPlay,
    togglePlayback,
    restartCurrentMeasure,
    stepMeasure,
    stepPosition,
    getCurrentTimeInBeats,
    getCurrentTimeInMs,
    setPreciseTime,
    chartData,
    pause,
    timeline,
  } = useGameStore(useShallow((state) => state));

  const totalDurationMs = chartData
    ? beatsToMs(
        Math.max(0, timeline.totalMeasures - 1) * timeline.beatsPerMeasure,
        chartData.bpmEvents,
        chartData.bpm,
      )
    : 0;
  const {
    range: exportRange,
    start: startExportRange,
    update: updateExportRange,
    clear: clearExportRange,
  } = useExportRange(totalDurationMs);
  const exportActive = exportRange !== null;

  // 放大镜窗口：全长 / 4，限制在 15s-60s，可在全曲范围拖拽。
  const [panStartMs, setPanStartMs] = useState<number | null>(null);
  const zoomWindowDurationMs = useMemo(() => {
    if (totalDurationMs <= 0) return 0;
    return clamp(totalDurationMs / 4, 15000, 60000);
  }, [totalDurationMs]);
  const getCenteredZoomStart = useCallback(
    (range: { startMs: number; endMs: number }) => {
      const centerMs = (range.startMs + range.endMs) / 2;
      return clamp(
        centerMs - zoomWindowDurationMs / 2,
        0,
        Math.max(0, totalDurationMs - zoomWindowDurationMs),
      );
    },
    [totalDurationMs, zoomWindowDurationMs],
  );
  // 可拖拽的窗口起点。下方放大轴里的背景、标签、playhead 和选区 overlay 都使用它。
  const zoomStartMs = useMemo(() => {
    if (!exportRange || totalDurationMs <= 0) return 0;
    return panStartMs ?? getCenteredZoomStart(exportRange);
  }, [exportRange, totalDurationMs, panStartMs, getCenteredZoomStart]);
  const zoomEndMs = zoomStartMs + zoomWindowDurationMs;

  const zoomStartMsRef = useRef(zoomStartMs);
  zoomStartMsRef.current = zoomStartMs;
  const zoomWindowDurationMsRef = useRef(zoomWindowDurationMs);
  zoomWindowDurationMsRef.current = zoomWindowDurationMs;

  const currentMs = chartData ? getCurrentTimeInMs() : 0;
  const [isExportingGif, setIsExportingGif] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const exportOriginalBeatsRef = useRef<number | null>(null);
  const exportZoomPlayheadRef = useRef<HTMLDivElement>(null);

  const { soundEnabled, setSoundEnabled } = useGameSettingsStore(
    useShallow((state) => ({
      soundEnabled: state.soundEnabled,
      setSoundEnabled: state.setSoundEnabled,
    })),
  );

  const restoreExportPosition = useCallback(() => {
    if (exportOriginalBeatsRef.current !== null) {
      setPreciseTime(exportOriginalBeatsRef.current, true);
      exportOriginalBeatsRef.current = null;
    }
  }, [setPreciseTime]);

  const exportCurrentFrame = () => {
    window.dispatchEvent(new Event("maimai-chart-export-frame"));
  };

  const copyCurrentFrame = () => {
    window.dispatchEvent(new Event("maimai-chart-copy-frame"));
  };

  const startGifExportSelection = () => {
    if (!chartData || totalDurationMs <= 0) {
      notifications.show({ title: "无法导出", message: "当前没有可导出的谱面", color: "red" });
      return;
    }

    pause();
    const currentBeats = getCurrentTimeInBeats();
    exportOriginalBeatsRef.current = currentBeats;
    setPanStartMs(null);
    startExportRange(getCurrentTimeInMs());
  };

  const cancelGifExportSelection = () => {
    if (isExportingGif) return;
    setPanStartMs(null);
    clearExportRange();
    restoreExportPosition();
  };

  const previewExportPosition = useCallback(
    (ms: number) => {
      if (!chartData) return;
      setPreciseTime(msToBeats(ms, chartData.bpmEvents, chartData.bpm), true);
    },
    [chartData, setPreciseTime],
  );

  const updateExportZoomPlayhead = useCallback((ms: number) => {
    const el = exportZoomPlayheadRef.current;
    const dur = zoomWindowDurationMsRef.current;
    if (!el || dur <= 0) return;
    el.style.left = `${clamp(((ms - zoomStartMsRef.current) / dur) * 100, 0, 100)}%`;
  }, []);

  const panZoomWindow = useCallback(
    (deltaMs: number) => {
      if (!exportRange || totalDurationMs <= 0) return;

      const currentStart = panStartMs ?? zoomStartMs;
      const nextStart = clamp(
        currentStart + deltaMs,
        0,
        Math.max(0, totalDurationMs - zoomWindowDurationMs),
      );
      const actualDeltaMs = nextStart - currentStart;
      const rangeDurationMs = exportRange.endMs - exportRange.startMs;
      const nextRangeStartMs = clamp(
        exportRange.startMs + actualDeltaMs,
        0,
        Math.max(0, totalDurationMs - rangeDurationMs),
      );

      setPanStartMs(nextStart);
      updateExportRange({
        startMs: nextRangeStartMs,
        endMs: nextRangeStartMs + rangeDurationMs,
      });
      previewExportPosition(nextRangeStartMs);
    },
    [
      totalDurationMs,
      zoomWindowDurationMs,
      zoomStartMs,
      panStartMs,
      exportRange,
      updateExportRange,
      previewExportPosition,
    ],
  );

  const confirmGifExport = async () => {
    if (!chartData || !exportRange) return;

    const durationMs = exportRange.endMs - exportRange.startMs;
    if (durationMs <= 0) {
      notifications.show({ title: "无法导出", message: "导出范围为空", color: "red" });
      return;
    }

    setIsExportingGif(true);
    setExportProgress(0);

    try {
      // 让出主线程，使进度条 UI 在阻塞式导出开始前完成渲染。
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => window.setTimeout(resolve, 0));
      });
      const blob = await exportChartGif({
        chart: chartData,
        range: exportRange,
        settings: useGameSettingsStore.getState(),
        onProgress: setExportProgress,
      });

      // GIF 已生成，关闭进度条。
      setIsExportingGif(false);
      setExportProgress(0);

      const chartId = getChartIdForFilename();
      const filename = `maimai-chart-${chartId}-${Math.round(exportRange.startMs)}ms-${formatDuration(durationMs, "s")}.gif`;
      const file = new File([blob], filename, { type: "image/gif" });

      const canShare = navigator.canShare?.({ files: [file] });
      if (canShare) {
        try {
          await navigator.share({ files: [file] });
          clearExportRange();
          restoreExportPosition();
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") return;
        }
      }

      downloadBlob(blob, filename);
      clearExportRange();
      restoreExportPosition();
      notifications.show({ title: "已保存", message: "GIF 已下载", color: "green" });
    } catch (error) {
      setIsExportingGif(false);
      setExportProgress(0);
      notifications.show({ title: "导出失败", message: getErrorMessage(error), color: "red" });
    }
  };

  const copyCurrentTimeUrl = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("beat", String(Math.round(getCurrentTimeInBeats())));

    try {
      await navigator.clipboard.writeText(url.toString());
      notifications.show({
        title: "已复制",
        message: "当前时间点链接已复制到剪贴板",
        color: "green",
      });
    } catch {
      notifications.show({
        title: "复制失败",
        message: "剪贴板不可用",
        color: "red",
      });
    }
  };

  useEffect(() => {
    const handler = (event: Event) => {
      const { title, message, color } = (event as CustomEvent).detail as {
        title: string;
        message: string;
        color: string;
      };
      notifications.show({ title, message, color });
    };
    window.addEventListener("maimai-chart-notify", handler);
    return () => window.removeEventListener("maimai-chart-notify", handler);
  }, []);

  useEffect(() => {
    if (!exportRange || totalDurationMs <= 0 || panStartMs !== null) return;
    setPanStartMs(getCenteredZoomStart(exportRange));
  }, [exportRange, totalDurationMs, panStartMs, getCenteredZoomStart]);

  useEffect(() => {
    if (!exportRange || !chartData || zoomWindowDurationMs <= 0) return;

    updateExportZoomPlayhead(getCurrentTimeInMs());

    if (!isPlaying) return;

    let animationFrameId: number | null = null;
    const update = () => {
      updateExportZoomPlayhead(
        beatsToMs(playbackTimeRef.current, chartData.bpmEvents, chartData.bpm),
      );
      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
    // updateExportZoomPlayhead 通过 ref 读取最新值，引用稳定，无需列入 deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportRange, chartData, zoomWindowDurationMs, isPlaying]);

  return (
    <Card
      className={classes.card}
      padding="sm"
      radius="lg"
      withBorder={!isFullscreen}
      style={isFullscreen ? { background: "transparent" } : undefined}
    >
      <Stack gap="sm">
        <div className={classes.timelineExportHost}>
          <NoteCountGraph fullscreen={isFullscreen} />
          {exportRange && totalDurationMs > 0 && (
            <div className={classes.exportOverviewOverlay}>
              <div
                className={classes.exportOverviewShade}
                style={{ left: 0, width: `${(exportRange.startMs / totalDurationMs) * 100}%` }}
              />
              <div
                className={classes.exportOverviewSelection}
                style={{
                  left: `${(exportRange.startMs / totalDurationMs) * 100}%`,
                  width: `${((exportRange.endMs - exportRange.startMs) / totalDurationMs) * 100}%`,
                }}
              />
              <div
                className={classes.exportOverviewShade}
                style={{
                  left: `${(exportRange.endMs / totalDurationMs) * 100}%`,
                  width: `${100 - (exportRange.endMs / totalDurationMs) * 100}%`,
                }}
              />
            </div>
          )}
        </div>

        {exportRange && zoomWindowDurationMs > 0 && (
          <div className={classes.exportZoomTrack}>
            {chartData && (
              <ChartDensityTimeline
                notes={chartData.notes}
                windowStartMs={zoomStartMs}
                durationMs={zoomWindowDurationMs}
                scaleWindowStartMs={0}
                scaleDurationMs={totalDurationMs}
                barMaxHeight={22}
                className={classes.exportZoomDensityTimeline}
              />
            )}
            <div className={classes.exportZoomLabel} style={{ left: 0 }}>
              {formatDuration(zoomStartMs, "s")}
            </div>
            <div className={classes.exportZoomLabel} style={{ right: 0 }}>
              {formatDuration(zoomEndMs, "s")}
            </div>
            <div
              ref={exportZoomPlayheadRef}
              className={classes.exportZoomPlayhead}
              style={{
                left: `${clamp(((currentMs - zoomStartMs) / zoomWindowDurationMs) * 100, 0, 100)}%`,
              }}
            />
            <ExportRangeOverlay
              range={{
                startMs: exportRange.startMs - zoomStartMs,
                endMs: exportRange.endMs - zoomStartMs,
              }}
              totalDurationMs={zoomWindowDurationMs}
              onChange={(nextRange) =>
                updateExportRange({
                  startMs: nextRange.startMs + zoomStartMs,
                  endMs: nextRange.endMs + zoomStartMs,
                })
              }
              onPreview={(ms) => previewExportPosition(ms + zoomStartMs)}
              onViewportPan={panZoomWindow}
            />
          </div>
        )}

        {exportActive && (
          <div className={classes.exportConfirmBar}>
            {isExportingGif ? (
              <>
                <Text size="xs" c="dimmed">
                  正在生成 GIF
                </Text>
                <Progress
                  className={classes.exportProgress}
                  size="sm"
                  radius="xl"
                  value={exportProgress * 100}
                />
              </>
            ) : (
              <>
                <Group gap="xs" justify="center">
                  <Button size="xs" variant="light" color="gray" onClick={cancelGifExportSelection}>
                    取消
                  </Button>
                  <Button size="xs" onClick={() => void confirmGifExport()}>
                    确认导出
                  </Button>
                </Group>
              </>
            )}
          </div>
        )}

        <Group justify="center" gap="xs" wrap="wrap">
          <Tooltip label="上一小节">
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? "white" : "gray"}
              size="lg"
              onClick={() => stepMeasure(-1)}
            >
              <IconChevronsLeft size={20} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="上一位置">
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? "white" : "gray"}
              size="lg"
              onClick={() => stepPosition(-1)}
            >
              <IconChevronLeft size={20} />
            </ActionIcon>
          </Tooltip>

          {pendingPlay && !isPlaying ? (
            <ActionIcon variant="filled" size="xl" radius="xl" loading={true} />
          ) : (
            <Tooltip label={isPlaying ? "暂停" : "播放"}>
              <ActionIcon variant="filled" size="xl" radius="xl" onClick={togglePlayback}>
                {isPlaying ? <IconPlayerPause size={24} /> : <IconPlayerPlay size={24} />}
              </ActionIcon>
            </Tooltip>
          )}

          <Tooltip label="下一位置">
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? "white" : "gray"}
              size="lg"
              onClick={() => stepPosition(1)}
            >
              <IconChevronRight size={20} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="下一小节">
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? "white" : "gray"}
              size="lg"
              onClick={() => stepMeasure(1)}
            >
              <IconChevronsRight size={20} />
            </ActionIcon>
          </Tooltip>

          <div className={classes.separator} />

          <Tooltip label="重新播放当前小节">
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? "white" : "gray"}
              size="lg"
              onClick={restartCurrentMeasure}
            >
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={soundEnabled ? "关闭正解音" : "开启正解音"}>
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? "white" : "gray"}
              size="lg"
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? <IconVolume size={20} /> : <IconVolumeOff size={20} />}
            </ActionIcon>
          </Tooltip>

          <Menu shadow="md" width={160}>
            <Menu.Target>
              <Tooltip label="分享当前帧">
                <ActionIcon variant="subtle" color={isFullscreen ? "white" : "gray"} size="lg">
                  <IconCamera size={20} />
                </ActionIcon>
              </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconShare size={14} />} onClick={exportCurrentFrame}>
                分享图片
              </Menu.Item>
              <Menu.Item leftSection={<IconClipboard size={14} />} onClick={copyCurrentFrame}>
                复制到剪贴板
              </Menu.Item>
              <Menu.Item
                leftSection={<IconMovie size={14} />}
                onClick={exportActive ? cancelGifExportSelection : startGifExportSelection}
                disabled={isExportingGif}
                color={exportActive ? "red" : undefined}
              >
                {exportActive ? "取消 GIF 导出" : "导出 GIF"}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>

          <Tooltip label="复制当前时间点 URL">
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? "white" : "gray"}
              size="lg"
              onClick={() => void copyCurrentTimeUrl()}
              aria-label="复制当前时间点 URL"
            >
              <IconLink size={20} />
            </ActionIcon>
          </Tooltip>

          {onToggleFullscreen && (
            <Tooltip label={isFullscreen ? "退出全屏" : "全屏预览"}>
              <ActionIcon
                variant="subtle"
                color={isFullscreen ? "white" : "gray"}
                size="lg"
                onClick={onToggleFullscreen}
              >
                {isFullscreen ? <IconMinimize size={20} /> : <IconMaximize size={20} />}
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

export function Controls() {
  const {
    playbackSpeed,
    rawSimaiText,
    selectedDifficulty,
    availableDifficulties,
    chartData,
    setPlaybackSpeed,
    setChartData,
    setSelectedDifficulty,
    setRawSimaiText,
    setMusicUrl,
  } = useGameStore(useShallow((state) => state));

  // 手动编辑当前 simai 文本并重新加载
  const [debugSimai, setDebugSimai] = useState(rawSimaiText);
  const debugSimaiTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const importedMusicUrlRef = useRef<string | null>(null);
  const difficultyAnchors = useMemo(() => getDifficultyAnchors(debugSimai), [debugSimai]);
  const difficultyAnchorOptions = useMemo(
    () =>
      difficultyAnchors.map((anchor) => ({
        value: String(anchor.index),
        label: `${getDebugDifficultyLabel(anchor.difficulty)} #${anchor.difficulty}`,
      })),
    [difficultyAnchors],
  );
  const [selectedDifficultyAnchor, setSelectedDifficultyAnchor] = useState<string | null>(null);
  useEffect(() => {
    setDebugSimai(rawSimaiText);
  }, [rawSimaiText]);

  useEffect(() => {
    if (
      selectedDifficultyAnchor &&
      !difficultyAnchors.some((anchor) => String(anchor.index) === selectedDifficultyAnchor)
    ) {
      setSelectedDifficultyAnchor(null);
    }
  }, [difficultyAnchors, selectedDifficultyAnchor]);

  useEffect(() => {
    return () => {
      const importedMusicUrl = importedMusicUrlRef.current;
      if (importedMusicUrl) {
        if (useGameStore.getState().musicUrl === importedMusicUrl) {
          setMusicUrl("");
        }
        URL.revokeObjectURL(importedMusicUrl);
      }
    };
  }, [setMusicUrl]);

  const jumpToDifficulty = useCallback((anchor: DifficultyAnchor) => {
    const textarea = debugSimaiTextareaRef.current;
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(anchor.index, anchor.index);

    requestAnimationFrame(() => {
      const styles = window.getComputedStyle(textarea);
      const lineHeight = parseFloat(styles.lineHeight) || 18;
      textarea.scrollTop = Math.max(0, (anchor.line - 2) * lineHeight);
    });
  }, []);

  const applyDebugSimai = useCallback(() => {
    try {
      const chart = parseSimaiChart(debugSimai, selectedDifficulty ?? undefined);
      setRawSimaiText(debugSimai);
      setChartData(chart);
      notifications.show({
        title: "谱面已重载",
        message: "当前 Simai 文本已重新解析",
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: "谱面重载失败",
        message: getErrorMessage(error),
        color: "red",
      });
    }
  }, [debugSimai, selectedDifficulty, setRawSimaiText, setChartData]);

  const handleMusicImport = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = "";

      if (!file) return;

      try {
        if (!isSupportedAudioFile(file)) {
          throw new Error("请选择音频文件");
        }

        const musicUrl = URL.createObjectURL(file);
        const previousMusicUrl = importedMusicUrlRef.current;

        importedMusicUrlRef.current = musicUrl;
        setMusicUrl(musicUrl);

        if (previousMusicUrl) {
          URL.revokeObjectURL(previousMusicUrl);
        }

        notifications.show({
          title: "音乐已导入",
          message: `${file.name} 已覆盖当前音乐`,
          color: "green",
        });
      } catch (error) {
        notifications.show({
          title: "音乐导入失败",
          message: getErrorMessage(error),
          color: "red",
        });
      }
    },
    [setMusicUrl],
  );

  const {
    hiSpeed,
    alwaysKeepHiSpeed,
    slideRotation,
    mirrorMode,
    judgmentLineDesign,
    pinkSlideStart,
    highlightExNotes,
    normalColorBreakSlide,
    showFireworks,
    showHitEffect,
    musicVolume,
    musicOffset,
    soundOffset,
    setHiSpeed,
    setAlwaysKeepHiSpeed,
    setSlideRotation,
    setMirrorMode,
    setJudgmentLineDesign,
    setPinkSlideStart,
    setHighlightExNotes,
    setNormalColorBreakSlide,
    setShowFireworks,
    setShowHitEffect,
    fpsLimit,
    setFpsLimit,
    setMusicVolume,
    setMusicOffset,
    setSoundOffset,
    fullscreenQuality,
    setFullscreenQuality,
  } = useGameSettingsStore(useShallow((state) => state));

  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [showMusicSettings, setShowMusicSettings] = useState(false);

  const handleDifficultyChange = useCallback(
    (difficulty: ChartDifficulty) => {
      if (!rawSimaiText.trim()) return;

      setSelectedDifficulty(difficulty);
      const chart = parseSimaiChart(rawSimaiText, difficulty);
      setChartData(chart);

      const url = new URL(window.location.href);
      url.searchParams.set("difficulty", String(difficulty - 2));
      window.history.replaceState({}, "", url.toString());
    },
    [rawSimaiText, setSelectedDifficulty, setChartData],
  );

  return (
    <Stack gap="md">
      {import.meta.env.DEV && (
        <Card className={classes.card} radius="lg" withBorder>
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Simai 调试
            </Text>
            {difficultyAnchors.length > 0 && (
              <Select
                size="xs"
                label="跳转到难度段"
                placeholder="选择 inote 段"
                data={difficultyAnchorOptions}
                value={selectedDifficultyAnchor}
                onChange={(value) => {
                  setSelectedDifficultyAnchor(value);
                  const anchor = difficultyAnchors.find((anchor) => String(anchor.index) === value);
                  if (anchor) jumpToDifficulty(anchor);
                }}
                allowDeselect={false}
              />
            )}
            <Textarea
              ref={debugSimaiTextareaRef}
              value={debugSimai}
              onChange={(e) => setDebugSimai(e.currentTarget.value)}
              autosize
              minRows={4}
              maxRows={10}
              styles={{ input: { fontFamily: "monospace", fontSize: 12 } }}
            />
            <Group gap="xs">
              <Button size="xs" onClick={applyDebugSimai}>
                应用并重新解析
              </Button>
              <Button
                size="xs"
                variant="light"
                component="label"
                leftSection={<IconUpload size={14} />}
              >
                导入音乐
                <input
                  type="file"
                  accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
                  hidden
                  onChange={handleMusicImport}
                />
              </Button>
            </Group>
          </Stack>
        </Card>
      )}

      <SimaiStatementList simaiText={rawSimaiText} difficulty={selectedDifficulty} />

      <Card className={classes.card} radius="lg" withBorder>
        <Stack gap="md">
          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={500}>
                流速
              </Text>
              <Text size="sm" c="dimmed" ff="monospace">
                {hiSpeed}
              </Text>
            </Group>
            <Slider
              value={hiSpeed}
              onChange={setHiSpeed}
              min={3}
              max={9}
              step={0.25}
              marks={[{ value: 3 }, { value: 6 }, { value: 9 }]}
            />
            <Group justify="space-between">
              <Text size="xs" c="dimmed" ff="monospace">
                3
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                6
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                9
              </Text>
            </Group>
          </div>

          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={500}>
                播放速度
              </Text>
              <Text size="sm" c="dimmed" ff="monospace">
                {playbackSpeed.toPrecision(2)}x
              </Text>
            </Group>
            <Slider
              value={playbackSpeed}
              onChange={setPlaybackSpeed}
              min={0.1}
              max={1.0}
              step={0.05}
              marks={[{ value: 0.1 }, { value: 0.5 }, { value: 1.0 }]}
            />
            <Group justify="space-between">
              <Text size="xs" c="dimmed" ff="monospace">
                0.1x
              </Text>
              <Text size="xs" c="dimmed" ff="monospace">
                1.0x
              </Text>
            </Group>
          </div>

          <Group gap="xs" align="center">
            <Checkbox
              label="保持谱面流速"
              checked={alwaysKeepHiSpeed}
              onChange={(e) => setAlwaysKeepHiSpeed(e.currentTarget.checked)}
            />
            <HoverCard width={280} shadow="md" withArrow>
              <HoverCard.Target>
                <ThemeIcon variant="subtle" color="gray" size="xs" style={{ cursor: "pointer" }}>
                  <IconHelp />
                </ThemeIcon>
              </HoverCard.Target>
              <HoverCard.Dropdown>
                <Text size="sm">降低播放速度时，自动提高谱面流速，使音符的视觉速度保持不变。</Text>
              </HoverCard.Dropdown>
            </HoverCard>
          </Group>
        </Stack>
      </Card>

      {chartData?.title.indexOf("UTAGE") === -1 &&
        Object.keys(availableDifficulties).length > 0 && (
          <Group gap="xs" grow>
            {([1, 2, 3, 4, 5, 6] as ChartDifficulty[]).map((diff) => {
              const isAvailable = availableDifficulties[diff];
              const isSelected = selectedDifficulty === diff;
              const level = chartData?.level?.[`lv_${diff}` as keyof typeof chartData.level];
              const color = DIFFICULTY_COLORS[diff];

              if (!isAvailable) return null;

              const isLightColor = diff === 6;
              const textColor = getDifficultyTextColor(isSelected, isLightColor, color);

              return (
                <UnstyledButton
                  key={diff}
                  onClick={() => handleDifficultyChange(diff)}
                  className={`${classes.difficultyButton} ${isSelected ? classes.difficultyButtonSelected : ""}`}
                  style={{
                    backgroundColor: isSelected ? color : isLightColor ? "#c4b5fd30" : `${color}20`,
                    color: textColor,
                  }}
                >
                  <span className={classes.difficultyName}>{DIFFICULTY_NAMES[diff]}</span>
                  {level && <span className={classes.difficultyLevel}>{level}</span>}
                </UnstyledButton>
              );
            })}
          </Group>
        )}

      <Card className={classes.card} radius="lg" withBorder>
        <UnstyledButton onClick={() => setShowDisplaySettings(!showDisplaySettings)} w="100%">
          <Group justify="space-between">
            <Group gap="xs">
              <IconAdjustments size={20} />
              <Text size="sm" fw={500}>
                显示设置
              </Text>
            </Group>
            <IconChevronDown
              size={16}
              style={{
                transition: "transform 0.2s",
                transform: showDisplaySettings ? "rotate(180deg)" : "none",
              }}
            />
          </Group>
        </UnstyledButton>

        <Collapse expanded={showDisplaySettings}>
          <Stack gap="md" mt="md">
            <div>
              <Text size="sm" mb={4}>
                镜像
              </Text>
              <SegmentedControl
                value={mirrorMode}
                onChange={(value) =>
                  setMirrorMode(value as "none" | "horizontal" | "vertical" | "rotate180")
                }
                data={[
                  { value: "none", label: "无" },
                  { value: "horizontal", label: "左右反" },
                  { value: "vertical", label: "上下反" },
                  { value: "rotate180", label: "全反" },
                ]}
                size="xs"
                fullWidth
              />
            </div>

            {/* Judgment Line Design */}
            <div>
              <Text size="sm" mb={4}>
                判定线
              </Text>
              <SegmentedControl
                value={judgmentLineDesign}
                onChange={(value) =>
                  setJudgmentLineDesign(value as "blind" | "noLine" | "simple" | "sensor")
                }
                data={[
                  { value: "blind", label: "无" },
                  { value: "noLine", label: "判定点" },
                  { value: "simple", label: "判定线" },
                  { value: "sensor", label: "判定区" },
                ]}
                size="xs"
                fullWidth
              />
            </div>

            <Group justify="space-between">
              <Text size="sm">显示判定点打击特效</Text>
              <Switch
                checked={showHitEffect}
                onChange={(e) => setShowHitEffect(e.currentTarget.checked)}
              />
            </Group>

            <Group justify="space-between">
              <Text size="sm">星星头旋转</Text>
              <Switch
                checked={slideRotation}
                onChange={(e) => setSlideRotation(e.currentTarget.checked)}
              />
            </Group>

            <Group justify="space-between">
              <Text size="sm">使用粉色星星头</Text>
              <Switch
                checked={pinkSlideStart}
                onChange={(e) => setPinkSlideStart(e.currentTarget.checked)}
              />
            </Group>

            <Group justify="space-between">
              <Text size="sm">高亮保护套</Text>
              <Switch
                checked={highlightExNotes}
                onChange={(e) => setHighlightExNotes(e.currentTarget.checked)}
              />
            </Group>

            <Group justify="space-between">
              <Text size="sm">使用标准颜色的绝赞星星</Text>
              <Switch
                checked={normalColorBreakSlide}
                onChange={(e) => setNormalColorBreakSlide(e.currentTarget.checked)}
              />
            </Group>

            <Group justify="space-between">
              <Text size="sm">显示烟花特效</Text>
              <Switch
                checked={showFireworks}
                onChange={(e) => setShowFireworks(e.currentTarget.checked)}
              />
            </Group>

            <div>
              <Text size="sm" mb={4}>
                帧数限制
              </Text>
              <SegmentedControl
                value={String(fpsLimit)}
                onChange={(value) => setFpsLimit(Number(value))}
                data={[
                  { value: "0", label: "无限制" },
                  { value: "120", label: "120 FPS" },
                  { value: "60", label: "60 FPS" },
                ]}
                size="xs"
                fullWidth
              />
            </div>

            <div>
              <Text size="sm" mb={4}>
                全屏画质
              </Text>
              <SegmentedControl
                value={fullscreenQuality}
                onChange={(value) => setFullscreenQuality(value as "smooth" | "balanced" | "high")}
                data={[
                  { value: "smooth", label: "流畅" },
                  { value: "balanced", label: "均衡" },
                  { value: "high", label: "高画质" },
                ]}
                size="xs"
                fullWidth
              />
            </div>
          </Stack>
        </Collapse>
      </Card>

      <Card className={classes.card} radius="lg" withBorder>
        <UnstyledButton onClick={() => setShowMusicSettings(!showMusicSettings)} w="100%">
          <Group justify="space-between">
            <Group gap="xs">
              <IconMusic size={20} />
              <Text size="sm" fw={500}>
                音频设置
              </Text>
            </Group>
            <IconChevronDown
              size={16}
              style={{
                transition: "transform 0.2s",
                transform: showMusicSettings ? "rotate(180deg)" : "none",
              }}
            />
          </Group>
        </UnstyledButton>

        <Collapse expanded={showMusicSettings}>
          <Stack gap="md" mt="md">
            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm">音乐音量</Text>
                <Text size="sm" c="dimmed" ff="monospace">
                  {Math.round(musicVolume * 100)}%
                </Text>
              </Group>
              <Slider value={musicVolume} onChange={setMusicVolume} min={0} max={1} step={0.1} />
            </div>

            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm">音乐偏移</Text>
                <Group gap={4}>
                  <Text size="sm" c="dimmed" ff="monospace">
                    {musicOffset}ms
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="重置音乐偏移"
                    onClick={() => setMusicOffset(0)}
                  >
                    <IconRefresh size={14} />
                  </ActionIcon>
                </Group>
              </Group>
              <Slider
                value={musicOffset}
                onChange={setMusicOffset}
                min={-2000}
                max={2000}
                step={10}
                marks={[{ value: -2000 }, { value: 0 }, { value: 2000 }]}
              />
              <Group justify="space-between">
                <Text size="xs" c="dimmed" ff="monospace">
                  -2000
                </Text>
                <Text size="xs" c="dimmed" ff="monospace">
                  0
                </Text>
                <Text size="xs" c="dimmed" ff="monospace">
                  +2000
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>
                正值: 音乐延后 | 负值: 音乐提前
              </Text>
            </div>

            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm">正解音偏移</Text>
                <Group gap={4}>
                  <Text size="sm" c="dimmed" ff="monospace">
                    {soundOffset}ms
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="重置正解音偏移"
                    onClick={() => setSoundOffset(0)}
                  >
                    <IconRefresh size={14} />
                  </ActionIcon>
                </Group>
              </Group>
              <Slider
                value={soundOffset}
                onChange={setSoundOffset}
                min={-200}
                max={200}
                step={5}
                marks={[{ value: -200 }, { value: 0 }, { value: 200 }]}
              />
              <Group justify="space-between">
                <Text size="xs" c="dimmed" ff="monospace">
                  -200
                </Text>
                <Text size="xs" c="dimmed" ff="monospace">
                  0
                </Text>
                <Text size="xs" c="dimmed" ff="monospace">
                  +200
                </Text>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>
                正值: 正解音延后 | 负值: 正解音提前
              </Text>
            </div>
          </Stack>
        </Collapse>
      </Card>
    </Stack>
  );
}

export default Controls;
