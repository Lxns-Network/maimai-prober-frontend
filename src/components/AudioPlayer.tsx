import { ActionIcon, Container, Group, Slider, Text, Tooltip } from "@mantine/core";
import {
  IconDownload,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled,
  IconRepeat,
  IconRepeatOff,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { useToggle } from "@mantine/hooks";
import { useAudio } from "react-use";
import React, { useEffect, useRef } from "react";
import { HTMLMediaProps } from "react-use/lib/factory/createHTMLMediaHook";

interface AudioPlayerProps extends React.ComponentPropsWithoutRef<typeof Container> {
  src: string;
  onFrequencyChange?: (frequency: Uint8Array) => void;
  audioProps?: HTMLMediaProps;
  others?: unknown;
}

export const AudioPlayer = ({
  src,
  onFrequencyChange,
  audioProps,
  ...others
}: AudioPlayerProps) => {
  const [isRepeat, toggleIsRepeat] = useToggle();
  const [audio, state, controls, ref] = useAudio({
    src,
    crossOrigin: "anonymous",
    ...audioProps,
    loop: isRepeat,
  });
  const onFrequencyChangeRef = useRef(onFrequencyChange);
  const isPlaying = state.playing;

  const parseTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time - minutes * 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    onFrequencyChangeRef.current = onFrequencyChange;
  }, [onFrequencyChange]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let context: AudioContext | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let frequencyData: Uint8Array<ArrayBuffer> | null = null;
    let frameRequest: number | null = null;

    const stopVisualization = () => {
      if (frameRequest !== null) {
        cancelAnimationFrame(frameRequest);
        frameRequest = null;
      }
      if (frequencyData) {
        frequencyData.fill(0);
        onFrequencyChangeRef.current?.(frequencyData);
      }
    };

    const renderFrame = () => {
      if (!analyser || !frequencyData) return;
      analyser.getByteFrequencyData(frequencyData);
      onFrequencyChangeRef.current?.(frequencyData);
      frameRequest = requestAnimationFrame(renderFrame);
    };

    const startVisualization = () => {
      if (!analyser || frameRequest !== null) return;
      frameRequest = requestAnimationFrame(renderFrame);
    };

    const handlePlay = () => {
      if (!onFrequencyChangeRef.current) return;

      if (!context) {
        let nextContext: AudioContext | null = null;
        try {
          nextContext = new AudioContext();
          const nextSource = nextContext.createMediaElementSource(element);
          const nextAnalyser = nextContext.createAnalyser();
          nextSource.connect(nextAnalyser);
          nextAnalyser.connect(nextContext.destination);

          context = nextContext;
          source = nextSource;
          analyser = nextAnalyser;
          frequencyData = new Uint8Array(nextAnalyser.frequencyBinCount);
        } catch {
          if (nextContext) void nextContext.close().catch(() => undefined);
          return;
        }
      }

      void context.resume().catch(() => undefined);
      startVisualization();
    };

    element.addEventListener("play", handlePlay);
    element.addEventListener("pause", stopVisualization);
    element.addEventListener("ended", stopVisualization);

    return () => {
      element.removeEventListener("play", handlePlay);
      element.removeEventListener("pause", stopVisualization);
      element.removeEventListener("ended", stopVisualization);
      stopVisualization();
      source?.disconnect();
      analyser?.disconnect();
      if (context) void context.close().catch(() => undefined);
    };
  }, [ref]);

  return (
    <Container w="100%" p="md" {...others}>
      {audio}
      <Group gap="xs">
        <Text size="sm">{parseTime(state.time)}</Text>
        <Slider
          label={null}
          size="sm"
          thumbSize={16}
          min={0}
          max={state.duration}
          value={state.time}
          style={{ flex: 1 }}
          onChange={(value) => controls.seek(value)}
        />
        <Text size="sm">{parseTime(state.duration)}</Text>
      </Group>
      <Group mt="xs" justify="space-between" wrap="nowrap">
        <Group w="100%" maw="100px">
          <Tooltip label={isRepeat ? "关闭循环播放" : "循环播放"} position="bottom">
            <ActionIcon variant="transparent" c="gray" size="sm" onClick={() => toggleIsRepeat()}>
              {isRepeat ? <IconRepeat /> : <IconRepeatOff />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label="下载" position="bottom">
            <ActionIcon
              variant="transparent"
              c="gray"
              size="sm"
              onClick={() => window.open(`${src}?download=true`, "_blank")}
            >
              <IconDownload />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label="后退 5 秒" position="bottom">
            <ActionIcon
              variant="transparent"
              c="gray"
              onClick={() => controls.seek(state.time - 5)}
            >
              <IconPlayerTrackPrevFilled />
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            radius="50%"
            size="lg"
            onClick={() => {
              if (isPlaying) {
                controls.pause();
              } else {
                controls.play();
              }
            }}
          >
            {isPlaying ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
          </ActionIcon>
          <Tooltip label="前进 5 秒" position="bottom">
            <ActionIcon
              variant="transparent"
              c="gray"
              onClick={() => controls.seek(state.time + 5)}
            >
              <IconPlayerTrackNextFilled />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group gap="xs" w="100%" maw="100px">
          <Tooltip label={state.muted ? "取消静音" : "静音"} position="bottom">
            <ActionIcon
              variant="transparent"
              c="gray"
              size="sm"
              onClick={() => (state.muted ? controls.unmute() : controls.mute())}
            >
              {state.muted ? <IconVolumeOff size={20} /> : <IconVolume />}
            </ActionIcon>
          </Tooltip>
          <Slider
            size="xs"
            min={0}
            max={100}
            value={Math.round(state.volume * 100)}
            style={{ flex: 1 }}
            onChange={(value) => controls.volume(value / 100)}
          />
        </Group>
      </Group>
    </Container>
  );
};
