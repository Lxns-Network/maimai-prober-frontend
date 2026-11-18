import { type ReactNode } from "react";
import {
  Card,
  Checkbox,
  HoverCard,
  ThemeIcon,
  Group,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconAdjustments, IconHelp, IconMovie } from "@tabler/icons-react";
import useChunithmChartSettingsStore from "@/hooks/useChunithmChartSettingsStore";
import { openConfirmModal } from "@/utils/modal";
import type { useChartPreview } from "../hooks/useChartPreview";
import { CANVAS_RESOLUTION_OPTIONS, type CanvasResolution } from "../runtime/canvasSize";
import { PLAY_TIMING_OPTIONS } from "../options/playTiming";
import { JUDGE_TIMING_OPTIONS } from "../options/judgeTiming";
import { JUDGE_POSITION_OPTIONS } from "../options/judgePosition";
import { OptionSlider } from "./OptionSlider";
import { SettingsCard } from "./SettingsCard";
import { AudioSettings } from "./AudioSettings";
import classes from "../../../Chart.module.css";

export function Controls({
  preview,
  children,
  disabled = false,
}: {
  preview: ReturnType<typeof useChartPreview>;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const ready = preview.status === "ready" && !disabled;
  const resolution = useChunithmChartSettingsStore((state) => state.resolution);
  const fpsLimit = useChunithmChartSettingsStore((state) => state.fpsLimit);
  const hasConfirmed4k = useChunithmChartSettingsStore((state) => state.hasConfirmed4k);
  const setOptions = useChunithmChartSettingsStore((state) => state.setOptions);

  return (
    <Stack gap="md">
      <Card className={classes.card} radius="lg" withBorder>
        <Stack gap="md">
          <OptionSlider
            label="流速"
            value={preview.speedValue}
            options={preview.speedOptions}
            markValue={preview.speedOptions.find((option) => option.label === "8")?.value}
            disabled={!ready}
            onChange={preview.selectSpeed}
          />
          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={500}>
                播放速度
              </Text>
              <Text size="sm" c="dimmed" ff="monospace">
                {preview.playbackSpeed.toPrecision(2)}x
              </Text>
            </Group>
            <Slider
              thumbLabel="播放速度"
              value={preview.playbackSpeed}
              onChange={preview.selectPlaybackSpeed}
              min={0.1}
              max={1.0}
              step={0.05}
              marks={[{ value: 0.5 }]}
              disabled={!ready}
              onKeyDown={(event) => {
                if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End")
                  event.stopPropagation();
              }}
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
              checked={preview.alwaysKeepHiSpeed}
              onChange={(event) => preview.selectKeepHiSpeed(event.currentTarget.checked)}
              disabled={!ready}
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
      {children}
      <SettingsCard label="显示设置" icon={<IconAdjustments size={20} />}>
        <Group justify="space-between">
          <Text size="sm">谱面镜像</Text>
          <Switch
            aria-label="谱面镜像"
            checked={preview.mirror}
            onChange={(event) => preview.selectMirror(event.currentTarget.checked)}
            disabled={!ready}
          />
        </Group>

        <Group justify="space-between">
          <Text size="sm">判定显示</Text>
          <Switch
            aria-label="判定显示"
            checked={preview.criticalDisplayValue === "0" || preview.criticalDisplayValue === "1"}
            onChange={(event) =>
              preview.selectCriticalDisplay(event.currentTarget.checked ? "0" : "3")
            }
            disabled={!ready}
          />
        </Group>
        <div>
          <Text size="sm" mb={4}>
            判定显示位置
          </Text>
          <SegmentedControl
            aria-label="判定显示位置"
            data={JUDGE_POSITION_OPTIONS.map(({ value, label }) => ({ value, label }))}
            value={preview.judgePositionValue}
            onChange={preview.selectJudgePosition}
            size="xs"
            fullWidth
            disabled={!ready}
          />
        </div>

        <div>
          <Text size="sm" mb={4}>
            轨道分割线
          </Text>
          <SegmentedControl
            aria-label="轨道分割线"
            data={preview.dividerOptions}
            value={preview.dividerValue ?? undefined}
            onChange={preview.selectDivider}
            size="xs"
            fullWidth
            disabled={!ready}
          />
        </div>

        <div>
          <Text size="sm" mb={4}>
            帧数限制
          </Text>
          <SegmentedControl
            aria-label="帧数限制"
            value={String(fpsLimit)}
            onChange={(value) => setOptions({ fpsLimit: Number(value) })}
            data={[
              { value: "0", label: "无限制" },
              { value: "120", label: "120 FPS" },
              { value: "60", label: "60 FPS" },
            ]}
            size="xs"
            fullWidth
            disabled={disabled}
          />
        </div>
        <div>
          <Text size="sm" mb={4}>
            渲染分辨率
          </Text>
          <SegmentedControl
            aria-label="渲染分辨率"
            data={CANVAS_RESOLUTION_OPTIONS}
            value={resolution}
            onChange={(value) => {
              if (value === "4k" && !hasConfirmed4k) {
                openConfirmModal(
                  "开启 4K 渲染",
                  "4K 渲染可能增加设备负载，导致发热或播放不流畅，确定开启吗？",
                  () => setOptions({ resolution: "4k", hasConfirmed4k: true }),
                );
              } else {
                setOptions({ resolution: value as CanvasResolution });
              }
            }}
            size="xs"
            fullWidth
            disabled={disabled}
          />
        </div>
        <OptionSlider
          label="判定时机 A（帧）"
          value={preview.playTimingValue}
          options={PLAY_TIMING_OPTIONS}
          markValue="20"
          startPointValue="20"
          disabled={!ready}
          onChange={preview.selectPlayTiming}
        />
        <OptionSlider
          label="判定时机 B（帧）"
          value={preview.judgeTimingValue}
          options={JUDGE_TIMING_OPTIONS}
          markValue="20"
          startPointValue="20"
          disabled={!ready}
          onChange={preview.selectJudgeTiming}
          onChangeEnd={preview.applyJudgeTiming}
        />
        <OptionSlider
          label="挡板位置"
          value={preview.fieldWallValue}
          options={preview.fieldWallOptions}
          disabled={!ready}
          onChange={preview.selectFieldWall}
        />
      </SettingsCard>
      <AudioSettings preview={preview} disabled={disabled} />
      <SettingsCard label="背景设置" icon={<IconMovie size={20} />}>
        <Group justify="space-between">
          <Text size="sm">显示谱面背景</Text>
          <Switch
            aria-label="显示谱面背景"
            disabled={disabled}
            checked={preview.stage.showBackground}
            onChange={(event) => preview.stage.selectBackground(event.currentTarget.checked)}
          />
        </Group>
        {preview.stage.fieldOptions.length > 0 && (
          <OptionSlider
            label="轨道亮度"
            markValue="0"
            value={preview.stage.fieldValue}
            options={preview.stage.fieldOptions}
            disabled={disabled || preview.stage.status !== "ready"}
            onChange={preview.stage.selectField}
          />
        )}
      </SettingsCard>
    </Stack>
  );
}
