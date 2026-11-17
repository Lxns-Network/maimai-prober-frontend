import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Badge,
  Button,
  Card,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconDeviceGamepad2 } from "@tabler/icons-react";
import useChunithmChartSettingsStore from "@/hooks/useChunithmChartSettingsStore";
import {
  BINDING_PRESETS,
  LANES,
  bindKey,
  keyLabel,
  type KeyBindings,
} from "../options/keyBindings";
import type { useChartPreview } from "../hooks/useChartPreview";
import { useGameStore } from "../../stores/useGameStore";
import classes from "../../../Chart.module.css";

const RESULTS = [
  { label: "J-CRITICAL", color: "yellow" },
  { label: "JUSTICE", color: "orange" },
  { label: "ATTACK", color: "teal" },
  { label: "MISS", color: "gray" },
] as const;

const AIR = -1;

const presetOf = (bindings: KeyBindings) =>
  BINDING_PRESETS.find((preset) => JSON.stringify(preset.bindings) === JSON.stringify(bindings))
    ?.value ?? "custom";

/** Lanes and AIR keys, each clickable to bind the next key pressed. */
function KeyMap({ disabled }: { disabled: boolean }) {
  const bindings = useChunithmChartSettingsStore((state) => state.keyBindings);
  const setOptions = useChunithmChartSettingsStore((state) => state.setOptions);
  const [listening, setListening] = useState<number | null>(null);
  useEffect(() => {
    if (listening === null) return;
    const capture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code !== "Escape")
        setOptions({ keyBindings: bindKey(bindings, event.code, listening) });
      setListening(null);
    };
    window.addEventListener("keydown", capture, { capture: true });
    return () => window.removeEventListener("keydown", capture, { capture: true });
  }, [bindings, listening, setOptions]);
  const cell = (lane: number, keys: string[], label: string) => (
    <Button
      key={lane}
      aria-label={`${label}：${keys.map(keyLabel).join("、") || "未绑定"}`}
      aria-pressed={listening === lane}
      disabled={disabled}
      onClick={() => setListening(listening === lane ? null : lane)}
      variant={listening === lane ? "filled" : "default"}
      size="compact-xs"
      ff="monospace"
      px={0}
    >
      {listening === lane ? "…" : keys.map(keyLabel).join(" ") || "—"}
    </Button>
  );
  return (
    <Stack gap={6}>
      <Group justify="space-between">
        <Text size="sm">键位</Text>
        <SegmentedControl
          size="xs"
          aria-label="键位预设"
          value={presetOf(bindings)}
          onChange={(value) => {
            const preset = BINDING_PRESETS.find((item) => item.value === value);
            if (preset) setOptions({ keyBindings: preset.bindings });
          }}
          data={[
            ...BINDING_PRESETS.map(({ value, label }) => ({ value, label })),
            { value: "custom", label: "自定义", disabled: true },
          ]}
          disabled={disabled}
        />
      </Group>
      <SimpleGrid cols={8} spacing={4} verticalSpacing={4}>
        {Array.from({ length: LANES }, (_, lane) =>
          cell(lane, bindings.lanes[lane] ?? [], `分区 ${lane + 1}`),
        )}
      </SimpleGrid>
      {cell(AIR, bindings.air, "AIR")}
      {listening !== null && (
        <Text size="xs" c="dimmed">
          请按下{listening === AIR ? " AIR " : `分区 ${listening + 1} `}的按键
        </Text>
      )}
    </Stack>
  );
}

interface PlaySettingsProps {
  preview: ReturnType<typeof useChartPreview>;
  disabled?: boolean;
}

function PlayProgress({ preview, disabled = false }: PlaySettingsProps) {
  const ready = preview.status === "ready" && !disabled;
  const stats = useSyncExternalStore(preview.live.play.subscribe, preview.live.play.getSnapshot);
  return (
    <>
      <Group justify="space-between">
        <Group gap="xs">
          <IconDeviceGamepad2 size={20} />
          <Text size="sm" fw={500}>
            游玩模式
          </Text>
          {stats?.finished && (
            <Badge variant="light" color={stats.counts[3] === 0 ? "yellow" : "blue"}>
              {stats.partial ? "练习完成" : stats.counts[3] === 0 ? "FULL COMBO" : "完成"}
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
      {preview.playMode && stats && (
        <>
          <SimpleGrid cols={4} spacing="xs">
            {RESULTS.map(({ label, color }, index) => (
              <Stack key={label} gap={0} align="center">
                <Text fz="lg" fw={700} ff="monospace" c={color}>
                  {stats.counts[index]}
                </Text>
                <Text fz={10} c="dimmed">
                  {label}
                </Text>
              </Stack>
            ))}
          </SimpleGrid>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              最大连击{" "}
              <Text span ff="monospace" c="var(--mantine-color-text)">
                {stats.maxCombo}
              </Text>
            </Text>
            <Text size="xs" c="dimmed">
              FAST{" "}
              <Text span ff="monospace" c="blue">
                {stats.fast}
              </Text>{" "}
              / LATE{" "}
              <Text span ff="monospace" c="red">
                {stats.late}
              </Text>
            </Text>
          </Group>
        </>
      )}
    </>
  );
}

export function PlaySettings({ preview, disabled = false }: PlaySettingsProps) {
  const isFullscreen = useGameStore((state) => state.isFullscreen);
  const flickNeedsMotion = useChunithmChartSettingsStore((state) => state.flickNeedsMotion);
  const setOptions = useChunithmChartSettingsStore((state) => state.setOptions);
  if (isFullscreen) return null;
  const ready = preview.status === "ready" && !disabled;
  return (
    <Card className={classes.card} radius="lg" withBorder>
      <Stack gap="md">
        <PlayProgress preview={preview} disabled={disabled} />
        <KeyMap disabled={!ready} />
        <Group justify="space-between">
          <Text size="sm">FLICK 需要擦动</Text>
          <Switch
            aria-label="FLICK 需要擦动"
            checked={flickNeedsMotion}
            onChange={(event) => setOptions({ flickNeedsMotion: event.currentTarget.checked })}
            disabled={!ready}
          />
        </Group>
      </Stack>
    </Card>
  );
}
