import { useSyncExternalStore } from "react";
import { Paper, Stack, Text } from "@mantine/core";
import type { PreviewLiveState } from "../runtime/liveState";

export function FpsDisplay({ live }: { live: PreviewLiveState }) {
  const stats = useSyncExternalStore(live.frameStats.subscribe, live.frameStats.getSnapshot);
  if (!stats) return null;
  return (
    <Paper
      pos="absolute"
      bottom="var(--mantine-spacing-xs)"
      left="var(--mantine-spacing-xs)"
      bg="dark.9"
      c="white"
      px="xs"
      py={4}
      radius="sm"
      ff="monospace"
      aria-label="渲染帧率"
      style={{ pointerEvents: "none" }}
    >
      <Stack gap={2}>
        <Text size="sm" fw={700}>
          FPS {stats.fps}
        </Text>
        <Text size="xs">
          帧回调 {stats.callbacksPerSecond}/s · {stats.width} × {stats.height}
        </Text>
        <Text size="xs">
          帧处理 {stats.averageWorkMs.toFixed(1)} ms · 峰值 {stats.maximumWorkMs.toFixed(1)} ms
        </Text>
      </Stack>
    </Paper>
  );
}
