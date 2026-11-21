import { ActionIcon, Button, Group, Text, Slider, Stack } from "@mantine/core";
import { IconMetronome, IconRefresh, IconVolume } from "@tabler/icons-react";
import useChunithmChartSettingsStore from "@/hooks/useChunithmChartSettingsStore";
import { MusicCalibration } from "@/pages/public/Chart/components/MusicCalibration/MusicCalibration";
import type { useChartPreview } from "../hooks/useChartPreview";
import { SettingsCard } from "./SettingsCard";

export function AudioSettings({
  preview,
  disabled = false,
}: {
  preview: ReturnType<typeof useChartPreview>;
  disabled?: boolean;
}) {
  const musicVolume = useChunithmChartSettingsStore((state) => state.musicVolume);
  const soundVolume = useChunithmChartSettingsStore((state) => state.soundVolume);
  const musicOffset = useChunithmChartSettingsStore((state) => state.musicOffset);
  const soundOffset = useChunithmChartSettingsStore((state) => state.soundOffset);
  const setMusicOffset = (value: number) => setOptions({ musicOffset: value });
  const setSoundOffset = (value: number) => setOptions({ soundOffset: value });
  const setOptions = useChunithmChartSettingsStore((state) => state.setOptions);
  const calibrationDisabled = disabled || preview.status !== "ready" || preview.changingDifficulty;
  return (
    <>
      <SettingsCard label="音频设置" icon={<IconVolume size={20} />}>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm">音乐音量</Text>
            <Text size="sm" c="dimmed" ff="monospace">
              {Math.round(musicVolume * 100)}%
            </Text>
          </Group>
          <Slider
            disabled={disabled}
            thumbLabel="音乐音量"
            value={musicVolume}
            min={0}
            max={1}
            step={0.01}
            marks={[{ value: 0.5 }]}
            label={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => setOptions({ musicVolume: value })}
          />
        </Stack>
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm">音效音量</Text>
            <Text size="sm" c="dimmed" ff="monospace">
              {Math.round(soundVolume * 100)}%
            </Text>
          </Group>
          <Slider
            disabled={disabled}
            thumbLabel="音效音量"
            value={soundVolume}
            min={0}
            max={1}
            step={0.01}
            marks={[{ value: 0.5 }]}
            label={(value) => `${Math.round(value * 100)}%`}
            onChange={(value) => setOptions({ soundVolume: value })}
          />
          {preview.playMode && preview.liveSoundsMuted && (
            <Text size="xs" c="dimmed">
              预计反馈延迟较高，游玩打击音效已静音。
            </Text>
          )}
        </Stack>
        <div>
          <Group justify="space-between" mb={4}>
            <Group gap="xs">
              <Text size="sm">音乐偏移</Text>
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconMetronome size={14} />}
                aria-label="校准音乐偏移"
                disabled={calibrationDisabled}
                onClick={preview.openMusicCalibration}
              >
                校准
              </Button>
            </Group>
            <Group gap={4}>
              <Text size="sm" c="dimmed" ff="monospace">
                {musicOffset}ms
              </Text>
              <ActionIcon
                disabled={disabled}
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
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End")
                event.stopPropagation();
            }}
            thumbLabel="音乐偏移"
            value={musicOffset}
            onChange={setMusicOffset}
            min={-2000}
            max={2000}
            step={10}
            label={(value) => `${value}ms`}
            marks={[{ value: 0 }]}
            startPointValue={0}
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
            <Text size="sm">音效偏移</Text>
            <Group gap={4}>
              <Text size="sm" c="dimmed" ff="monospace">
                {soundOffset}ms
              </Text>
              <ActionIcon
                disabled={disabled}
                variant="subtle"
                color="gray"
                size="sm"
                aria-label="重置音效偏移"
                onClick={() => setSoundOffset(0)}
              >
                <IconRefresh size={14} />
              </ActionIcon>
            </Group>
          </Group>
          <Slider
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End")
                event.stopPropagation();
            }}
            thumbLabel="音效偏移"
            value={soundOffset}
            onChange={setSoundOffset}
            min={-200}
            max={200}
            step={5}
            label={(value) => `${value}ms`}
            marks={[{ value: 0 }]}
            startPointValue={0}
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
            正值: 音效延后 | 负值: 音效提前
          </Text>
        </div>
      </SettingsCard>
      <MusicCalibration
        opened={preview.musicCalibrationOpened}
        onClose={preview.closeMusicCalibration}
        disabled={calibrationDisabled}
        muted={musicVolume === 0}
        controllerConnected={preview.controllerConnected}
        currentOffset={musicOffset}
        start={preview.startMusicCalibration}
        onApply={(value) => setOptions({ musicOffset: value, hasSeenMusicCalibration: true })}
      />
    </>
  );
}
