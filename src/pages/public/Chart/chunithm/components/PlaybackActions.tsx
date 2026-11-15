import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  NumberInput,
  Progress,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
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
}: PlaybackControlsProps & {
  preview: ReturnType<typeof useChartPreview>;
  onExporting(value: boolean): void;
}) {
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
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
  const exportGif = () =>
    void run(async () => {
      if (!range) return;
      const controller = new AbortController();
      abort.current = controller;
      const name = filename("gif");
      setProgress(0);
      onExporting(true);
      try {
        const blob = await preview.exportGif(range, controller.signal, setProgress);
        downloadBlob(blob, name);
        setRange(null);
      } finally {
        abort.current = null;
        setProgress(null);
        onExporting(false);
      }
    });
  return (
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
      {range && (
        <Stack gap="xs" w="100%">
          <Text size="sm">GIF 导出范围（秒）</Text>
          <Group grow>
            <NumberInput
              aria-label="GIF 起点"
              value={range.start}
              min={0}
              max={preview.durationSeconds}
              decimalScale={2}
              step={0.5}
              disabled={disabled}
              onChange={(value) =>
                typeof value === "number" && setRange({ ...range, start: value })
              }
            />
            <NumberInput
              aria-label="GIF 终点"
              value={range.end}
              min={0}
              max={preview.durationSeconds}
              decimalScale={2}
              step={0.5}
              disabled={disabled}
              onChange={(value) => typeof value === "number" && setRange({ ...range, end: value })}
            />
          </Group>
          <Text size="xs" c="dimmed">
            按当前播放速度导出，最长 15 秒。
          </Text>
          {progress !== null && <Progress value={progress} />}
          <Group justify="flex-end">
            <Button
              size="xs"
              variant="light"
              color="gray"
              onClick={() => (progress !== null ? abort.current?.abort() : setRange(null))}
            >
              取消
            </Button>
            <Button
              size="xs"
              onClick={exportGif}
              loading={progress !== null}
              disabled={
                disabled ||
                range.start < 0 ||
                range.end > preview.durationSeconds ||
                range.end - range.start < 0.5 ||
                (range.end - range.start) / preview.playbackSpeed > 15
              }
            >
              下载 GIF
            </Button>
          </Group>
        </Stack>
      )}
    </>
  );
}
