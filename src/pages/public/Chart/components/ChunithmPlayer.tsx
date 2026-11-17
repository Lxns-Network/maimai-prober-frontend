import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  Alert,
  AspectRatio,
  Box,
  Button,
  Card,
  Group,
  LoadingOverlay,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { usePageContext } from "vike-react/usePageContext";
import { navigate } from "vike/client/router";
import useSongListStore from "@/hooks/useSongListStore";
import useChunithmChartSettingsStore from "@/hooks/useChunithmChartSettingsStore";
import { getScoreCardBackgroundColor, getTransparentColor } from "@/utils/color";
import { useWakeLock } from "./ChartCanvas/hooks/useWakeLock";
import { useChartPreview } from "../chunithm/hooks/useChartPreview";
import { PlaybackActions } from "../chunithm/components/PlaybackActions";
import { Controls } from "../chunithm/components/Controls";
import { PlaySettings } from "../chunithm/components/PlaySettings";
import { selectChunithmChartDifficulty } from "../chunithm/assets/urls";
import { useChartAssets } from "../chunithm/hooks/useChartAssets";
import { useGameStore } from "../stores/useGameStore";
import { PlaybackButtons } from "./Controls/PlaybackButtons";
import { PlaybackTimeline } from "./NoteCountGraph/NoteCountGraph";
import type { DensityNote } from "./ChartDensityTimeline/ChartDensityTimeline";
import type { ChartPlayerProps } from "../types";
import classes from "../../Chart.module.css";
import controlClasses from "./Controls/Controls.module.css";
const emptyNotes: readonly DensityNote[] = [];
const emptyMeasures: readonly number[] = [];

function Timeline({
  preview,
  fullscreen,
  disabled = false,
}: {
  preview: ReturnType<typeof useChartPreview>;
  fullscreen?: boolean;
  disabled?: boolean;
}) {
  const live = preview.live;
  const chart = useSyncExternalStore(
    live.chart.subscribe,
    live.chart.getSnapshot,
    live.chart.getSnapshot,
  );
  const getCurrentTimeMs = useCallback(() => live.time.getSnapshot() * 1000, [live]);
  return (
    <PlaybackTimeline
      fullscreen={fullscreen}
      notes={chart?.notes ?? emptyNotes}
      durationMs={preview.durationSeconds * 1000}
      measureTimesMs={chart?.measureTimesMs ?? emptyMeasures}
      playing={preview.playing}
      currentTimeMs={getCurrentTimeMs()}
      getCurrentTimeMs={getCurrentTimeMs}
      subscribeTime={live.time.subscribe}
      scrubScheduling="player"
      disabled={disabled || preview.status !== "ready" || preview.changingDifficulty}
      onScrub={(milliseconds) => preview.scrub(milliseconds / 1000)}
      onSeek={(milliseconds) => preview.seek(milliseconds / 1000)}
    />
  );
}

function optionalNumber(value: string | undefined, name: string, integer = false) {
  if (value === undefined) return null;
  const number = Number(value);
  if (
    !value.trim() ||
    !Number.isFinite(number) ||
    number < 0 ||
    (integer && !Number.isSafeInteger(number))
  )
    throw new Error(`${name} 必须是非负${integer ? "整数" : "数值"}。`);
  return number;
}

type PreviewProps = {
  assetBase: string;
  stageBase: string;
  musicId: number;
  difficulty: number | undefined;
  initialSeconds: number;
  initialSpeedRow: number | null;
  musicUrl: string | null;
  jacketUrl: string | null;
  onRetry: () => void;
};

function Preview({ onRetry, children, ...options }: PreviewProps & ChartPlayerProps) {
  const resolution = useChunithmChartSettingsStore((state) => state.resolution);
  const preview = useChartPreview({ ...options, resolution });
  const [exporting, setExporting] = useState(false);
  const ready = preview.status === "ready" && !preview.changingDifficulty && !exporting;
  const title = useSongListStore((state) => state.chunithm.find(options.musicId)?.title);
  useWakeLock(preview.playing);

  useEffect(() => {
    if (!ready) return;
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        (event.target instanceof HTMLElement &&
          (event.target.isContentEditable ||
            event.target.closest(
              'input, textarea, select, button, a[href], [role="slider"], [role="combobox"], [role="menuitem"], [role="option"]',
            )))
      )
        return;
      switch (event.key) {
        case " ":
          event.preventDefault();
          preview.toggle();
          break;
        case "r":
        case "R":
          event.preventDefault();
          preview.restartMeasure();
          break;
        case "ArrowLeft":
        case "ArrowRight": {
          event.preventDefault();
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          preview.seek(
            Math.max(
              0,
              Math.min(
                preview.durationSeconds,
                preview.live.time.getSnapshot() + direction * (event.shiftKey ? 5 : 1),
              ),
            ),
          );
          break;
        }
        case "ArrowUp":
        case "ArrowDown": {
          event.preventDefault();
          const index = preview.speedOptions.findIndex(
            (option) => option.value === preview.speedValue,
          );
          const next = preview.speedOptions[index + (event.key === "ArrowUp" ? 1 : -1)];
          if (next) preview.selectSpeed(next.value);
          break;
        }
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [ready, preview]);

  const isFullscreen = useGameStore((state) => state.isFullscreen);
  return children({
    title,
    canvas: (
      <Stack gap="md">
        <Box
          pos="relative"
          className={classes.chunithmCanvas}
          data-fullscreen={isFullscreen || undefined}
          aria-busy={preview.status === "loading" || preview.seeking || preview.changingDifficulty}
        >
          <AspectRatio ratio={16 / 9}>
            <Box
              component="canvas"
              ref={preview.canvasRef}
              display="block"
              w="100%"
              bg="dark.9"
              aria-label="CHUNITHM 谱面预览"
              data-autoplay-status={preview.status}
            >
              浏览器不支持 Canvas。
            </Box>
          </AspectRatio>
          <LoadingOverlay visible={preview.status === "loading"} zIndex={1} />
        </Box>
        {preview.error && (
          <Alert color="red" title="谱面加载失败" role="alert">
            <Stack gap="sm">
              <Text size="sm">{preview.error}</Text>
              <Button variant="outline" color="red" onClick={onRetry} w="fit-content">
                重新加载
              </Button>
            </Stack>
          </Alert>
        )}
        {preview.stage.error && (
          <Alert color="yellow" title="背景加载失败">
            {preview.stage.error}
          </Alert>
        )}
      </Stack>
    ),
    controls: (
      <Box component="fieldset" disabled={exporting} m={0} p={0} bd={0}>
        <Controls preview={preview} disabled={exporting}>
          <PlaySettings preview={preview} disabled={exporting} />
          {preview.difficultyOptions.length > 0 && (
            <Group gap="xs" grow>
              {preview.difficultyOptions.map((option) => {
                const index = Number(option.value);
                const selected = option.value === preview.difficultyValue;
                const color = getScoreCardBackgroundColor("chunithm", index);
                const name = index === 5 ? "WORLD'S END" : option.label.split(" ")[0];
                const level = option.label.slice(name.length).trim();
                return (
                  <UnstyledButton
                    key={option.value}
                    aria-pressed={selected}
                    disabled={preview.status !== "ready" || exporting}
                    className={`${controlClasses.difficultyButton} ${selected ? controlClasses.difficultyButtonSelected : ""}`}
                    bg={selected ? color : getTransparentColor(color, 0.12)}
                    c={selected ? "white" : color}
                    onClick={() => {
                      if (!selected || preview.changingDifficulty)
                        void navigate(selectChunithmChartDifficulty(window.location.href, index));
                    }}
                  >
                    <Text span fz={10} lh={1}>
                      {name}
                    </Text>
                    <Text span fz="sm" fw={700} lh={1.2}>
                      {level}
                    </Text>
                  </UnstyledButton>
                );
              })}
            </Group>
          )}
        </Controls>
      </Box>
    ),
    playbackControls: (props) => (
      <Card
        className={classes.card}
        radius="lg"
        p="sm"
        withBorder={!props.isFullscreen}
        style={props.isFullscreen ? { background: "transparent" } : undefined}
      >
        <Stack gap="sm">
          <PlaybackActions {...props} preview={preview} onExporting={setExporting}>
            {(actions, selection) => (
              <>
                <Timeline preview={preview} fullscreen={props.isFullscreen} disabled={exporting} />
                {selection}
                <PlaybackButtons
                  {...props}
                  playing={preview.playing}
                  disabled={!ready}
                  toggle={preview.toggle}
                  restart={preview.restartMeasure}
                  restartLabel="重新播放当前小节"
                  stepMeasure={preview.stepMeasure}
                  stepLabel={["后退 5 秒", "前进 5 秒"]}
                  step={(direction) =>
                    preview.seek(
                      Math.max(
                        0,
                        Math.min(
                          preview.durationSeconds,
                          preview.live.time.getSnapshot() + direction * 5,
                        ),
                      ),
                    )
                  }
                >
                  {actions}
                </PlaybackButtons>
              </>
            )}
          </PlaybackActions>
        </Stack>
      </Card>
    ),
    restartLabel: "重新播放当前小节",
  });
}
export default function ChunithmPlayer({ children }: ChartPlayerProps) {
  const search = usePageContext().urlParsed.search;
  const [attempt, setAttempt] = useState(0);
  let parameters: Omit<PreviewProps, "onRetry" | "assetBase" | "stageBase"> | null = null;
  let error: string | null = null;
  try {
    if (search.chart_id !== undefined) {
      const musicId = optionalNumber(search.chart_id, "chart_id", true)!;
      parameters = {
        musicId,
        difficulty: optionalNumber(search.difficulty, "difficulty", true) ?? undefined,
        initialSeconds: optionalNumber(search.t, "t") ?? 0,
        initialSpeedRow: optionalNumber(search.speedRow, "speedRow", true),
        musicUrl: search.music?.trim() || null,
        jacketUrl: search.jacket?.trim() || null,
      };
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  const assets = useChartAssets(window.location.href, search.assets, parameters !== null);
  if (parameters && assets.data)
    return (
      <Preview
        key={JSON.stringify([
          assets.data.base,
          assets.data.stages,
          parameters.musicId,
          parameters.musicUrl,
          parameters.jacketUrl,
          parameters.initialSpeedRow,
          attempt,
        ])}
        {...parameters}
        assetBase={assets.data.base}
        stageBase={assets.data.stages}
        children={children}
        onRetry={() => setAttempt((value) => value + 1)}
      />
    );
  return children({
    canvas:
      error || assets.error ? (
        <Alert color="red" title="无法加载谱面" role="alert">
          <Stack gap="sm">
            <Text size="sm">{error ?? assets.error?.message}</Text>
            {!error && (
              <Button
                variant="outline"
                color="red"
                onClick={() => void assets.refetch()}
                w="fit-content"
              >
                重新加载
              </Button>
            )}
          </Stack>
        </Alert>
      ) : parameters ? (
        <AspectRatio ratio={16 / 9} pos="relative">
          <LoadingOverlay visible zIndex={1} />
        </AspectRatio>
      ) : null,
    controls: null,
    playbackControls: () => null,
    restartLabel: "重新播放",
  });
}
