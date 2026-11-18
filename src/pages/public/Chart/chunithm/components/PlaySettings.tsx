import { useState, useSyncExternalStore } from "react";
import {
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconDeviceGamepad2 } from "@tabler/icons-react";
import { LANE_COUNT } from "@lxns-network/chunithm-chart-engine/chart/play/input";
import useChunithmChartSettingsStore from "@/hooks/useChunithmChartSettingsStore";
import { BINDING_PRESETS, bindKey, keyLabel } from "../input/keyboard";
import type { useChartPreview } from "../hooks/useChartPreview";
import { useGameStore } from "../../stores/useGameStore";
import classes from "../../../Chart.module.css";
import { ControllerInput } from "./ControllerInput";
import styles from "./PlaySettings.module.css";

const RESULTS = [
  { label: "J-CRITICAL", color: "yellow" },
  { label: "JUSTICE", color: "orange" },
  { label: "ATTACK", color: "teal" },
  { label: "MISS", color: "gray" },
] as const;

const AIR = -1;
const panelBackground = "var(--mantine-color-gray-light)";

/** Lanes and AIR keys, each clickable to bind the next key pressed. */
function KeyMap({ disabled }: { disabled: boolean }) {
  const bindings = useChunithmChartSettingsStore((state) => state.keyBindings);
  const activePreset = BINDING_PRESETS.find(
    (preset) => JSON.stringify(preset.bindings) === JSON.stringify(bindings),
  );
  const setOptions = useChunithmChartSettingsStore((state) => state.setOptions);
  const [listening, setListening] = useState<number | null>(null);
  const cell = (lane: number, keys: string[], label: string) => (
    <Button
      key={lane}
      aria-label={`${label}：${keys.map(keyLabel).join("、") || "未绑定"}`}
      aria-pressed={listening === lane}
      disabled={disabled}
      onClick={(event) => {
        event.currentTarget.focus();
        setListening(listening === lane ? null : lane);
      }}
      onBlur={() => setListening(null)}
      onKeyDown={(event) => {
        if (listening !== lane || event.code === "Tab") return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat || event.nativeEvent.isComposing) return;
        if (event.code !== "Escape")
          setOptions({ keyBindings: bindKey(bindings, event.code, lane) });
        setListening(null);
      }}
      variant={listening === lane ? "filled" : "default"}
      size="xs"
      ff="monospace"
      px={lane === AIR ? "xs" : 0}
    >
      {listening === lane ? "…" : keys.map(keyLabel).join(" ") || "—"}
    </Button>
  );
  return (
    <>
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500}>
          键位预设
        </Text>
        <Select
          size="xs"
          w={96}
          aria-label="键位预设"
          data={BINDING_PRESETS}
          value={activePreset?.value ?? null}
          searchValue={activePreset?.label ?? "自定义"}
          allowDeselect={false}
          onChange={(value) => {
            const preset = BINDING_PRESETS.find((item) => item.value === value);
            if (preset) setOptions({ keyBindings: preset.bindings });
          }}
          disabled={disabled}
        />
      </Group>
      <Divider />
      <Text size="xs" c="dimmed">
        地键
      </Text>
      <SimpleGrid cols={LANE_COUNT / 2} spacing={4} className={styles.keyRows}>
        {Array.from({ length: LANE_COUNT }, (_, lane) =>
          cell(lane, bindings.lanes[lane] ?? [], `分区 ${lane + 1}`),
        )}
      </SimpleGrid>
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="dimmed">
          AIR 输入
        </Text>
        {cell(AIR, bindings.air, "AIR")}
      </Group>
      {listening !== null && (
        <Text size="xs" c="dimmed">
          请按下{listening === AIR ? " AIR " : `分区 ${listening + 1} `}的按键
        </Text>
      )}
    </>
  );
}

interface PlaySettingsProps {
  preview: ReturnType<typeof useChartPreview>;
  disabled?: boolean;
}

function PlayProgress({
  preview,
  disabled,
  controllerSelected,
}: PlaySettingsProps & { controllerSelected: boolean }) {
  const ready =
    preview.status === "ready" && !disabled && (!controllerSelected || preview.controllerConnected);
  const liveStats = useSyncExternalStore(
    preview.live.play.subscribe,
    preview.live.play.getSnapshot,
  );
  const stats = preview.playMode ? liveStats : null;
  const fullCombo = stats?.finished && !stats.partial && stats.counts[3] === 0;
  let resultLabel: string | undefined;
  if (stats?.partial) resultLabel = stats.finished ? "练习完成" : "区间练习";
  else if (stats?.finished) resultLabel = fullCombo ? "FULL COMBO" : "完成";
  return (
    <>
      <Group justify="space-between">
        <Group gap="xs">
          <IconDeviceGamepad2 size={20} aria-hidden />
          <Text size="sm" fw={500}>
            游玩模式
          </Text>
          {resultLabel && (
            <Badge variant="light" color={fullCombo ? "yellow" : "blue"}>
              {resultLabel}
            </Badge>
          )}
        </Group>
        <Switch
          aria-label="游玩模式"
          checked={preview.playMode}
          onChange={(event) => preview.selectPlayMode(event.currentTarget.checked)}
          disabled={!ready}
        />
      </Group>
      <Paper radius="md" p="xs" bg={panelBackground}>
        <SimpleGrid cols={4} spacing="xs">
          {RESULTS.map(({ label, color }, index) => (
            <Stack key={label} gap={0} align="center">
              <Text
                fz="lg"
                fw={700}
                ff="monospace"
                c={`color-mix(in srgb, var(--mantine-color-${color}-text) 65%, var(--mantine-color-text))`}
              >
                {stats?.counts[index] ?? "—"}
              </Text>
              <Text fz={10} c="dimmed">
                {label}
              </Text>
            </Stack>
          ))}
        </SimpleGrid>
      </Paper>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          最大连击{" "}
          <Text span ff="monospace" c="var(--mantine-color-text)">
            {stats?.maxCombo ?? "—"}
          </Text>
        </Text>
        <Text size="xs" c="dimmed">
          FAST{" "}
          <Text span ff="monospace" c="blue">
            {stats?.fast ?? "—"}
          </Text>{" "}
          / LATE{" "}
          <Text span ff="monospace" c="red">
            {stats?.late ?? "—"}
          </Text>
        </Text>
      </Group>
    </>
  );
}

export function PlaySettings({ preview, disabled = false }: PlaySettingsProps) {
  const isFullscreen = useGameStore((state) => state.isFullscreen);
  const [input, setInput] = useState("keyboard");
  const flickNeedsMotion = useChunithmChartSettingsStore((state) => state.flickNeedsMotion);
  const setOptions = useChunithmChartSettingsStore((state) => state.setOptions);
  const ready = preview.status === "ready" && !disabled;
  return (
    <Card
      className={classes.card}
      radius="lg"
      withBorder
      display={isFullscreen ? "none" : undefined}
    >
      <Stack gap="md">
        <PlayProgress
          preview={preview}
          disabled={disabled}
          controllerSelected={input === "controller"}
        />
        <Stack gap="xs">
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm">输入设备</Text>
            <SegmentedControl
              size="xs"
              aria-label="输入设备"
              value={input}
              data={[
                { value: "keyboard", label: "键盘" },
                { value: "controller", label: "控制器" },
              ]}
              disabled={disabled}
              onChange={(value) => {
                if (value === "controller") preview.selectPlayMode(false);
                else if (preview.controllerConnected) {
                  preview.controllerInput(null, performance.now());
                  preview.selectPlayMode(preview.playMode);
                }
                setInput(value);
              }}
            />
          </Group>
          <Paper
            radius="md"
            p="sm"
            bg={panelBackground}
            role="group"
            aria-label={input === "keyboard" ? "键盘键位" : "控制器连接"}
          >
            <Stack gap="xs">
              {input === "keyboard" ? (
                <KeyMap disabled={!ready} />
              ) : (
                <ControllerInput
                  onInput={preview.controllerInput}
                  onLights={preview.setControllerLights}
                />
              )}
            </Stack>
          </Paper>
        </Stack>
        {input === "keyboard" && (
          <Group justify="space-between">
            <Text size="sm">FLICK 需要擦动</Text>
            <Switch
              aria-label="FLICK 需要擦动"
              checked={flickNeedsMotion}
              onChange={(event) => setOptions({ flickNeedsMotion: event.currentTarget.checked })}
              disabled={!ready}
            />
          </Group>
        )}
      </Stack>
    </Card>
  );
}
