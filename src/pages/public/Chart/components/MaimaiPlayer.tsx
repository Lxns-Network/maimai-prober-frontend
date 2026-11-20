import { useEffect, useCallback, useState } from "react";
import { Alert, Button, Stack, Text } from "@mantine/core";
import { usePageContext } from "vike-react/usePageContext";
import {
  parseSimaiChart,
  getAvailableDifficulties,
  type ChartDifficulty,
} from "@lxns-network/maimai-chart-engine";
import { ChartCanvas } from "./ChartCanvas";
import { Controls, PlaybackControls } from "./Controls";
import { usePreviewAudio } from "../hooks/usePreviewAudio";
import { useGameStore } from "../stores/useGameStore";
import { useGameSettingsStore } from "../stores/useGameSettingsStore";
import { isMaimaiUtageSongId } from "@/utils/score";
import type { ChartPlayerProps } from "../types";
async function fetchChartData(chartId: number, signal: AbortSignal): Promise<string> {
  const response = await fetch(`https://assets2.lxns.net/maimai/chart/${chartId}.txt`, { signal });
  if (!response.ok) throw new Error(`谱面加载失败（${response.status}）。`);
  return response.text();
}

function useKeyboardShortcuts() {
  const togglePlayback = useGameStore((s) => s.togglePlayback);
  const restartCurrentMeasure = useGameStore((s) => s.restartCurrentMeasure);
  const stepMeasure = useGameStore((s) => s.stepMeasure);
  const stepPosition = useGameStore((s) => s.stepPosition);
  const setHiSpeed = useGameSettingsStore((s) => s.setHiSpeed);
  const hiSpeed = useGameSettingsStore((s) => s.hiSpeed);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        !useGameStore.getState().chartData ||
        e.defaultPrevented ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        (e.target instanceof HTMLElement &&
          (e.target.isContentEditable ||
            e.target.closest(
              'input, textarea, select, button, a[href], [role="slider"], [role="combobox"], [role="menuitem"], [role="option"], [role="dialog"]',
            )))
      )
        return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlayback();
          break;
        case "r":
        case "R":
          e.preventDefault();
          restartCurrentMeasure();
          break;
        case "ArrowLeft":
          e.preventDefault();
          e.shiftKey ? stepMeasure(-1) : stepPosition(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          e.shiftKey ? stepMeasure(1) : stepPosition(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          setHiSpeed(Math.min(9, hiSpeed + 0.25));
          break;
        case "ArrowDown":
          e.preventDefault();
          setHiSpeed(Math.max(3, hiSpeed - 0.25));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlayback, restartCurrentMeasure, stepMeasure, stepPosition, setHiSpeed, hiSpeed]);
}

export default function MaimaiPlayer({ children }: ChartPlayerProps) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reset = useGameStore((s) => s.reset);
  const setRawSimaiText = useGameStore((s) => s.setRawSimaiText);
  const setMusicUrl = useGameStore((s) => s.setMusicUrl);
  const setChartData = useGameStore((s) => s.setChartData);
  const setPreciseTime = useGameStore((s) => s.setPreciseTime);
  const setAvailableDifficulties = useGameStore((s) => s.setAvailableDifficulties);
  const setSelectedDifficulty = useGameStore((s) => s.setSelectedDifficulty);
  const chartData = useGameStore((s) => s.chartData);
  const searchParams = usePageContext().urlParsed.search;
  const chartIdParam = searchParams.chart_id;
  const difficultyParam = searchParams.difficulty;
  const beatParam = searchParams.beat;
  const chartId = chartIdParam ? parseInt(chartIdParam) : null;
  const difficulty = difficultyParam ? ((parseInt(difficultyParam) + 2) as ChartDifficulty) : null;
  const beatValue = Number(beatParam);
  const initialBeat = beatParam && Number.isFinite(beatValue) && beatValue >= 0 ? beatValue : null;

  useKeyboardShortcuts();
  const previewAudio = usePreviewAudio();
  const backend = useGameSettingsStore((state) => state.rendererBackend);

  const loadChart = useCallback(
    async (signal: AbortSignal) => {
      if (!chartId) return;

      setError(null);
      setChartData(null);
      setRawSimaiText("");
      setAvailableDifficulties({});
      try {
        const simai = await fetchChartData(chartId, signal);
        if (signal.aborted) return;
        const available = getAvailableDifficulties(simai);
        const availableList = Object.keys(available)
          .map(Number)
          .sort((a, b) => b - a) as ChartDifficulty[];
        const diffToUse = difficulty && available[difficulty] ? difficulty : availableList[0];
        if (!diffToUse) throw new Error("这首歌没有可预览的谱面。");
        const chart = parseSimaiChart(simai, diffToUse);
        setRawSimaiText(simai);
        setAvailableDifficulties(available);
        setSelectedDifficulty(diffToUse);
        setChartData(chart);
        setMusicUrl(`https://assets2.lxns.net/maimai/music/${chartId % 10000}.mp3`);
        if (initialBeat !== null) {
          const beats = Math.min(initialBeat, chart.measures * 4);
          setPreciseTime(beats, true);
        }
      } catch (cause) {
        if (!signal.aborted) {
          setMusicUrl("");
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    },
    [
      chartId,
      difficulty,
      initialBeat,
      setRawSimaiText,
      setMusicUrl,
      setChartData,
      setPreciseTime,
      setAvailableDifficulties,
      setSelectedDifficulty,
    ],
  );

  useEffect(() => {
    const loading = new AbortController();
    void loadChart(loading.signal);
    return () => loading.abort();
  }, [loadChart, attempt]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  return children({
    title: chartData?.title,
    canvas: error ? (
      <Alert color="red" title="谱面加载失败" role="alert">
        <Stack gap="sm">
          <Text size="sm">{error}</Text>
          <Button
            variant="outline"
            color="red"
            onClick={() => setAttempt((value) => value + 1)}
            w="fit-content"
          >
            重新加载
          </Button>
        </Stack>
      </Alert>
    ) : (
      <ChartCanvas key={backend} backend={backend} previewAudio={previewAudio} />
    ),
    controls: (
      <Controls
        isUtage={chartId !== null && isMaimaiUtageSongId(chartId)}
        calibrateMusic={previewAudio.calibrateMusic}
      />
    ),
    playbackControls: (props) => <PlaybackControls {...props} />,
    restartLabel: "重新播放当前小节",
  });
}
