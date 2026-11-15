import type { ReactNode } from "react";
import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconMaximize,
  IconMinimize,
  IconPlayerPause,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react";
import type { PlaybackControlsProps } from "../../types";
import classes from "./Controls.module.css";

export function PlaybackButtons({
  playing,
  pending = false,
  disabled = false,
  toggle,
  restart,
  restartLabel,
  step,
  stepLabel = ["上一位置", "下一位置"],
  stepMeasure,
  children,
  onToggleFullscreen,
  isFullscreen,
  portalTarget,
}: PlaybackControlsProps & {
  playing: boolean;
  pending?: boolean;
  disabled?: boolean;
  toggle: () => void;
  restart: () => void;
  restartLabel: string;
  step: (direction: number) => void;
  stepLabel?: [string, string];
  stepMeasure?: (direction: number) => void;
  children?: ReactNode;
}) {
  const portalProps = isFullscreen && portalTarget ? { target: portalTarget } : undefined;
  const color = isFullscreen ? "white" : "gray";
  return (
    <Group justify="center" gap="xs" wrap="wrap">
      {stepMeasure && (
        <Tooltip label="上一小节" portalProps={portalProps}>
          <ActionIcon
            variant="subtle"
            color={color}
            size="lg"
            disabled={disabled}
            aria-label="上一小节"
            onClick={() => stepMeasure(-1)}
          >
            <IconChevronsLeft size={20} />
          </ActionIcon>
        </Tooltip>
      )}
      <Tooltip label={stepLabel[0]} portalProps={portalProps}>
        <ActionIcon
          variant="subtle"
          color={color}
          size="lg"
          disabled={disabled}
          aria-label={stepLabel[0]}
          onClick={() => step(-1)}
        >
          <IconChevronLeft size={20} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={playing ? "暂停" : "播放"} portalProps={portalProps}>
        <ActionIcon
          variant="filled"
          size="xl"
          radius="xl"
          loading={pending && !playing}
          disabled={disabled}
          aria-label={playing ? "暂停" : "播放"}
          onClick={toggle}
        >
          {playing ? <IconPlayerPause size={24} /> : <IconPlayerPlay size={24} />}
        </ActionIcon>
      </Tooltip>
      <Tooltip label={stepLabel[1]} portalProps={portalProps}>
        <ActionIcon
          variant="subtle"
          color={color}
          size="lg"
          disabled={disabled}
          aria-label={stepLabel[1]}
          onClick={() => step(1)}
        >
          <IconChevronRight size={20} />
        </ActionIcon>
      </Tooltip>
      {stepMeasure && (
        <Tooltip label="下一小节" portalProps={portalProps}>
          <ActionIcon
            variant="subtle"
            color={color}
            size="lg"
            disabled={disabled}
            aria-label="下一小节"
            onClick={() => stepMeasure(1)}
          >
            <IconChevronsRight size={20} />
          </ActionIcon>
        </Tooltip>
      )}
      <div className={classes.separator} />
      <Tooltip label={restartLabel} portalProps={portalProps}>
        <ActionIcon
          variant="subtle"
          color={color}
          size="lg"
          disabled={disabled}
          aria-label={restartLabel}
          onClick={restart}
        >
          <IconRefresh size={20} />
        </ActionIcon>
      </Tooltip>
      {children}
      {onToggleFullscreen && (
        <Tooltip label={isFullscreen ? "退出全屏" : "全屏预览"} portalProps={portalProps}>
          <ActionIcon
            variant="subtle"
            color={color}
            size="lg"
            aria-label={isFullscreen ? "退出全屏" : "全屏预览"}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <IconMinimize size={20} /> : <IconMaximize size={20} />}
          </ActionIcon>
        </Tooltip>
      )}
    </Group>
  );
}
