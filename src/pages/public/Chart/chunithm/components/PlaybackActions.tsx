import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Box,
  Progress,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { ExportRangeOverlay } from "../../components/ExportRangeOverlay/ExportRangeOverlay";
import { ChartDensityTimeline } from "../../components/ChartDensityTimeline/ChartDensityTimeline";
import classes from "../../components/Controls/Controls.module.css";
import { notifications } from "@mantine/notifications";
import {
  IconCamera,
  IconClipboard,
  IconDownload,
  IconLink,
  IconMovie,
  IconRepeat,
  IconShare,
} from "@tabler/icons-react";
import type { useChartPreview } from "../hooks/useChartPreview";
import type { PlaybackControlsProps } from "../../types";
import { downloadBlob, getChartIdForFilename } from "../../utils/fileDownload";
import { formatChartTimeForFilename, formatDuration } from "../../utils/format";

export function PlaybackActions({
  preview,
  isFullscreen,
  portalTarget,
  onExporting,
  children,
}: PlaybackControlsProps & {
  preview: ReturnType<typeof useChartPreview>;
  onExporting(value: boolean): void;
  children(actions: ReactNode, selection: ReactNode): ReactNode;
}) {
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [windowStart, setWindowStart] = useState(0);
  const chart = useSyncExternalStore(
    preview.live.chart.subscribe,
    preview.live.chart.getSnapshot,
    preview.live.chart.getSnapshot,
  );
  const windowDuration = Math.min(
    preview.durationSeconds,
    Math.max(15 * preview.playbackSpeed, 15, Math.min(60, preview.durationSeconds / 4)),
  );
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const portalProps = isFullscreen && portalTarget ? { target: portalTarget } : undefined;
  const disabled = preview.status !== "ready" || preview.changingDifficulty || progress !== null;
  const color = isFullscreen ? "white" : "gray";
  const filename = (extension: string) =>
    `chunithm-chart-${getChartIdForFilename()}-${formatChartTimeForFilename(preview.live.time.getSnapshot() * 1000)}.${extension}`;
  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notifications.show({
        title: "操作失败",
        message: error instanceof Error ? error.message : String(error),
        color: "red",
      });
    }
  };
  const capture = (action: "download" | "copy" | "share") =>
    void run(async () => {
      if (
        action === "copy" &&
        (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
      )
        throw new Error("当前浏览器不支持复制图片");
      const name = filename("png");
      const image = preview.captureFrame();
      if (action === "copy") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
      } else if (action === "download") downloadBlob(await image, name);
      else {
        const file = new File([await image], name, { type: "image/png" });
        if (!navigator.canShare?.({ files: [file] })) throw new Error("当前浏览器不支持分享图片");
        await navigator.share({ files: [file] });
      }
    });
  const exportGif = (action: "download" | "share") =>
    void run(async () => {
      if (!range) return;
      const controller = new AbortController();
      abort.current = controller;
      const name = filename("gif");
      setProgress(0);
      onExporting(true);
      try {
        const blob = await preview.exportGif(range, controller.signal, setProgress);
        if (action === "download") downloadBlob(blob, name);
        else await navigator.share({ files: [new File([blob], name, { type: "image/gif" })] });
        setRange(null);
      } finally {
        abort.current = null;
        setProgress(null);
        onExporting(false);
      }
    });
  const actions = (
    <>
      <Menu shadow="md" width={220} position="top" portalProps={portalProps}>
        <Menu.Target>
          <Tooltip label="区间循环" portalProps={portalProps}>
            <ActionIcon
              aria-label="区间循环"
              size="lg"
              variant={preview.loop?.enabled ? "light" : "subtle"}
              color={preview.loop?.enabled ? undefined : color}
              disabled={disabled}
            >
              <IconRepeat size={20} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>区间循环</Menu.Label>
          <Menu.Item onClick={preview.markLoopPoint}>
            {!preview.loop
              ? "设当前为起点"
              : preview.loop.end === null
                ? "设当前为终点"
                : "清除选区"}
          </Menu.Item>
          {preview.loop && (
            <Menu.Label>
              {formatDuration(preview.loop.start * 1000, "s")}
              {preview.loop.end === null
                ? " · 待设终点"
                : ` — ${formatDuration(preview.loop.end * 1000, "s")}`}
            </Menu.Label>
          )}
          <Menu.Divider />
          <Menu.Item
            disabled={preview.loop?.end == null}
            onClick={preview.toggleLoop}
            closeMenuOnClick={false}
          >
            {preview.loop?.enabled ? "关闭循环" : "开启循环"}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Menu shadow="md" width={180} portalProps={portalProps}>
        <Menu.Target>
          <Tooltip label="画面导出" portalProps={portalProps}>
            <ActionIcon
              aria-label="画面导出"
              size="lg"
              variant="subtle"
              color={color}
              disabled={disabled}
            >
              <IconCamera size={20} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>导出当前帧</Menu.Label>
          <Menu.Item leftSection={<IconShare size={14} />} onClick={() => capture("share")}>
            系统分享
          </Menu.Item>
          <Menu.Item leftSection={<IconDownload size={14} />} onClick={() => capture("download")}>
            下载图片
          </Menu.Item>
          <Menu.Item leftSection={<IconClipboard size={14} />} onClick={() => capture("copy")}>
            复制到剪贴板
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<IconMovie size={14} />}
            onClick={() => {
              const start = Math.min(
                preview.live.time.getSnapshot(),
                Math.max(0, preview.durationSeconds - 0.5),
              );
              if (preview.playing) preview.toggle();
              setWindowStart(
                Math.max(
                  0,
                  Math.min(
                    start + 4 * preview.playbackSpeed - windowDuration / 2,
                    preview.durationSeconds - windowDuration,
                  ),
                ),
              );
              setRange({
                start,
                end: Math.min(start + 8 * preview.playbackSpeed, preview.durationSeconds),
              });
            }}
          >
            导出 GIF
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <Tooltip label="复制当前时间点 URL" portalProps={portalProps}>
        <ActionIcon
          aria-label="复制当前时间点 URL"
          size="lg"
          variant="subtle"
          color={color}
          disabled={disabled}
          onClick={() =>
            void run(async () => {
              const url = new URL(window.location.href);
              url.searchParams.set("t", preview.live.time.getSnapshot().toFixed(3));
              url.searchParams.delete("beat");
              await navigator.clipboard.writeText(url.href);
              notifications.show({
                title: "已复制",
                message: "当前时间点链接已复制到剪贴板",
                color: "green",
              });
            })
          }
        >
          <IconLink size={20} />
        </ActionIcon>
      </Tooltip>
    </>
  );
  const selection = range && (
    <Stack gap="sm" data-mantine-color-scheme={isFullscreen ? "dark" : undefined}>
      <Box
        component="fieldset"
        disabled={progress !== null}
        m={0}
        p={0}
        bd={0}
        style={progress !== null ? { pointerEvents: "none" } : undefined}
      >
        <div className={classes.exportZoomTrack}>
          {chart && (
            <ChartDensityTimeline
              notes={chart.notes}
              windowStartMs={windowStart * 1000}
              durationMs={windowDuration * 1000}
              scaleWindowStartMs={0}
              scaleDurationMs={preview.durationSeconds * 1000}
              barMaxHeight={22}
              className={classes.exportZoomDensityTimeline}
            />
          )}
          <Box className={classes.exportZoomLabel} left={0}>
            {formatDuration(windowStart * 1000, "s")}
          </Box>
          <Box className={classes.exportZoomLabel} right={0}>
            {formatDuration((windowStart + windowDuration) * 1000, "s")}
          </Box>
          <ExportRangeOverlay
            range={{
              startMs: (range.start - windowStart) * 1000,
              endMs: (range.end - windowStart) * 1000,
            }}
            totalDurationMs={windowDuration * 1000}
            maxDurationMs={15000 * preview.playbackSpeed}
            onChange={(next) =>
              setRange({
                start: next.startMs / 1000 + windowStart,
                end: next.endMs / 1000 + windowStart,
              })
            }
            onPreview={(ms) => preview.seek(ms / 1000 + windowStart)}
            onViewportPan={(ms) => {
              const next = Math.max(
                0,
                Math.min(windowStart + ms / 1000, preview.durationSeconds - windowDuration),
              );
              const delta = next - windowStart;
              setWindowStart(next);
              setRange({ start: range.start + delta, end: range.end + delta });
              preview.seek(range.start + delta);
            }}
          />
        </div>
      </Box>
      <div className={classes.exportConfirmBar}>
        {progress !== null ? (
          <>
            <Text size="xs" c="dimmed">
              正在生成 GIF
            </Text>
            <Progress className={classes.exportProgress} size="sm" radius="xl" value={progress} />
            <Button size="xs" variant="light" color="gray" onClick={() => abort.current?.abort()}>
              取消
            </Button>
          </>
        ) : (
          <Group gap="xs" justify="center">
            <Button size="xs" variant="light" color="gray" onClick={() => setRange(null)}>
              取消
            </Button>
            <Menu shadow="md" width={160} position="top" portalProps={portalProps}>
              <Menu.Target>
                <Button
                  size="xs"
                  disabled={disabled || (range.end - range.start) / preview.playbackSpeed > 15}
                >
                  确认导出
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconShare size={14} />}
                  disabled={
                    !navigator.canShare?.({
                      files: [new File([], "chart.gif", { type: "image/gif" })],
                    })
                  }
                  onClick={() => exportGif("share")}
                >
                  系统分享
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconDownload size={14} />}
                  onClick={() => exportGif("download")}
                >
                  下载 GIF
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        )}
      </div>
    </Stack>
  );
  return children(actions, selection);
}
