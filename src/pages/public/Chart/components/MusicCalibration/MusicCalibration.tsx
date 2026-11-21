import { useEffect, useRef, useState } from "react";
import { Button, Group, Kbd, Modal, Paper, Progress, SimpleGrid, Stack, Text } from "@mantine/core";
import { useTimeout } from "@mantine/hooks";
import { IconArrowRight, IconHandClick, IconPlayerPlay, IconPlayerStop } from "@tabler/icons-react";
import {
  MUSIC_CALIBRATION_TAPS,
  type MusicCalibrationMode,
  type MusicCalibrationProgress,
  type StartMusicCalibration,
} from "../../utils/musicCalibration";
import { CalibrationBeats } from "./CalibrationBeats";

// Replacing the tap button under a finger can send the release click to the modal overlay.
const TOUCH_RESULT_DELAY_MS = 350;

interface MusicCalibrationProps {
  opened: boolean;
  onClose(): void;
  disabled: boolean;
  muted: boolean;
  controllerConnected?: boolean;
  currentOffset: number;
  start: StartMusicCalibration;
  onApply(value: number): void;
}

function OffsetValue({ value, suggested = false }: { value: number; suggested?: boolean }) {
  return (
    <Stack align="center" gap={4} flex={1}>
      <Text size="xs" c="dimmed">
        {suggested ? "建议偏移" : "当前偏移"}
      </Text>
      <Text
        ff="monospace"
        fz={24}
        fw={suggested ? 700 : 500}
        c={suggested ? "var(--mantine-primary-color-light-color)" : undefined}
        lh={1.2}
      >
        {value > 0 ? "+" : ""}
        {value}
        <Text span size="xs" fw={500}>
          {" ms"}
        </Text>
      </Text>
    </Stack>
  );
}

export function MusicCalibration({
  opened,
  onClose,
  disabled,
  muted,
  controllerConnected,
  currentOffset,
  start,
  onApply,
}: MusicCalibrationProps) {
  const [mode, setMode] = useState<MusicCalibrationMode>("measure");
  const [progress, setProgress] = useState<MusicCalibrationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingOffset, setStartingOffset] = useState(currentOffset);
  const [settlingTouch, setSettlingTouch] = useState(false);
  const touchRelease = useTimeout(() => setSettlingTouch(false), TOUCH_RESULT_DELAY_MS);
  const tapButton = useRef<HTMLButtonElement>(null);
  const resultSummary = useRef<HTMLParagraphElement>(null);
  const run = useRef<{ controller: AbortController; tap?: (timeStamp: number) => void } | null>(
    null,
  );
  useEffect(() => {
    if (opened) return () => run.current?.controller.abort();
  }, [opened]);
  const tapsComplete = progress?.count === MUSIC_CALIBRATION_TAPS;
  const result = tapsComplete && settlingTouch ? "listening" : progress?.result;
  const listening = progress !== null && result === "listening";
  const beat = listening ? (tapsComplete ? 4 : progress.beat) : undefined;
  const measuring = listening && mode === "measure";
  const demonstrating = listening && mode === "demo";
  const needsRetry = result === "interrupted" || result === "unstable" || !!error;
  const difference = typeof result === "number" ? result - startingOffset : 0;
  useEffect(() => {
    if (measuring) tapButton.current?.focus({ preventScroll: true });
    else if (typeof result === "number") resultSummary.current?.focus({ preventScroll: true });
  }, [measuring, result]);

  function stop() {
    run.current?.controller.abort();
    run.current = null;
  }

  function close() {
    stop();
    onClose();
  }

  async function begin(nextMode: MusicCalibrationMode) {
    stop();
    const controller = new AbortController();
    run.current = { controller };
    setMode(nextMode);
    if (nextMode === "measure") setStartingOffset(currentOffset);
    setError(null);
    setProgress({ count: 0, result: "listening" });
    const update = (next: MusicCalibrationProgress) => {
      if (controller.signal.aborted) return;
      setProgress(next);
      if (next.result !== "listening") {
        run.current = null;
        controller.abort();
      }
    };
    document.addEventListener(
      "visibilitychange",
      () => {
        if (document.hidden) update({ count: 0, result: "interrupted" });
      },
      { signal: controller.signal },
    );
    try {
      const tap = await start(controller.signal, update, nextMode);
      if (!controller.signal.aborted) run.current = { controller, tap };
    } catch (cause) {
      if (controller.signal.aborted) return;
      controller.abort();
      run.current = null;
      setProgress(null);
      setError(cause instanceof Error ? cause.message : "无法启动音频校准");
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={close}
      closeOnClickOutside={!tapsComplete}
      onExitTransitionEnd={() => {
        touchRelease.clear();
        setSettlingTouch(false);
        setError(null);
        setProgress(null);
      }}
      title={typeof result === "number" ? "音乐偏移校准结果" : "音乐偏移校准"}
      closeButtonProps={{ "aria-label": "关闭校准" }}
      centered
      size="sm"
    >
      <Stack gap="md">
        {typeof result === "number" ? (
          <>
            <Paper radius="md" p="md" bg="var(--mantine-color-gray-light)">
              <Group wrap="nowrap" gap="xs">
                <OffsetValue value={startingOffset} />
                <IconArrowRight size={18} color="var(--mantine-color-dimmed)" aria-hidden />
                <OffsetValue value={result} suggested />
              </Group>
            </Paper>
            <Text ref={resultSummary} tabIndex={-1} size="sm">
              {difference === 0
                ? "跟拍结果与当前设置一致。"
                : `应用后，音乐将比当前${difference < 0 ? "提前" : "延后"} ${Math.abs(difference)} ms 播放。`}
            </Text>
            <SimpleGrid cols={2} spacing="sm">
              <Button variant="default" onClick={() => void begin("measure")}>
                重新校准
              </Button>
              <Button
                onClick={() => {
                  onApply(result);
                  close();
                }}
              >
                {difference === 0 ? "完成" : "应用偏移"}
              </Button>
            </SimpleGrid>
          </>
        ) : (
          <>
            <Stack gap="xs">
              <Group gap="xs" justify="space-between" wrap="nowrap">
                <Text size="sm" flex={1}>
                  听到第四拍高音就按，共 {MUSIC_CALIBRATION_TAPS} 次。
                </Text>
                {!measuring && (
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    disabled={disabled || muted}
                    leftSection={
                      demonstrating ? <IconPlayerStop size={15} /> : <IconPlayerPlay size={15} />
                    }
                    onClick={() => {
                      if (demonstrating) {
                        stop();
                        setProgress(null);
                      } else void begin("demo");
                    }}
                  >
                    {demonstrating ? "停止示范" : result === "demo-ended" ? "重听示范" : "听示范"}
                  </Button>
                )}
              </Group>
              <CalibrationBeats beat={beat} tapped={measuring && beat === 4} />
            </Stack>
            {muted && (
              <Text size="sm" c="dimmed">
                请先在「音频设置」中调高音乐音量。
              </Text>
            )}
            {result === "unstable" && (
              <Text role="status" size="sm">
                几次跟拍的时间相差较大，请重新校准。
              </Text>
            )}
            {result === "interrupted" && (
              <Text role="status" size="sm">
                校准已中断，请重新开始。
              </Text>
            )}
            {error && (
              <Text role="alert" size="sm" c="red">
                {error}
              </Text>
            )}
            {measuring ? (
              <>
                <Stack gap={6}>
                  <Group justify="space-between" gap="xs">
                    <Text size="sm" c="dimmed" aria-live="polite">
                      已跟拍 {progress.count} / {MUSIC_CALIBRATION_TAPS} 次
                    </Text>
                    <Group gap={4}>
                      <Kbd size="sm">空格</Kbd>
                      {controllerConnected && <Kbd size="sm">控制器地键</Kbd>}
                    </Group>
                  </Group>
                  <Progress
                    value={(progress.count / MUSIC_CALIBRATION_TAPS) * 100}
                    aria-label="跟拍进度"
                  />
                </Stack>
                <Button
                  ref={tapButton}
                  size="md"
                  h={56}
                  fullWidth
                  leftSection={<IconHandClick size={20} />}
                  onPointerDown={(event) => {
                    if (!event.isPrimary || event.button !== 0) return;
                    event.preventDefault();
                    if (
                      event.pointerType === "touch" &&
                      progress.count >= MUSIC_CALIBRATION_TAPS - 1
                    ) {
                      touchRelease.clear();
                      setSettlingTouch(true);
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }
                    run.current?.tap?.(event.timeStamp);
                  }}
                  onLostPointerCapture={(event) => {
                    if (event.isPrimary && event.pointerType === "touch" && settlingTouch)
                      touchRelease.start();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== " " && event.key !== "Enter") return;
                    event.preventDefault();
                    if (!event.repeat) run.current?.tap?.(event.timeStamp);
                  }}
                  onClick={(event) => {
                    if (event.detail === 0) run.current?.tap?.(event.timeStamp);
                  }}
                >
                  点击跟拍
                </Button>
              </>
            ) : (
              <SimpleGrid cols={2} spacing="sm">
                <Button variant="default" onClick={close}>
                  稍后校准
                </Button>
                <Button
                  data-autofocus={(!disabled && !muted) || undefined}
                  disabled={disabled || muted}
                  onClick={() => void begin("measure")}
                >
                  {needsRetry ? "重新校准" : "开始校准"}
                </Button>
              </SimpleGrid>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
