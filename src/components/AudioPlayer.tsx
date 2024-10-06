import { ActionIcon, Container, Group, Slider, Text, Tooltip } from "@mantine/core";
import {
  IconDownload,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerTrackNextFilled,
  IconPlayerTrackPrevFilled, IconRepeat, IconRepeatOff, IconVolume, IconVolumeOff
} from "@tabler/icons-react";
import { useToggle } from "@mantine/hooks";
import { useAudio } from "react-use";
import React, { useEffect } from "react";
import { HTMLMediaProps } from "react-use/lib/factory/createHTMLMediaHook";

interface AudioPlayerProps extends React.ComponentPropsWithoutRef<typeof Container> {
  src: string;
  onFrequencyChange?: (frequency: Uint8Array) => void;
  audioProps?: HTMLMediaProps;
  others?: unknown;
}

export const AudioPlayer = ({ src, onFrequencyChange, audioProps, ...others }: AudioPlayerProps) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [audio, state, controls]: any = useAudio({
    src,
    crossOrigin: "anonymous",
    ...audioProps
  });
  const [isPlaying, toggleIsPlaying] = useToggle();
  const [isRepeat, toggleIsRepeat] = useToggle();

  const parseTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time - minutes * 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  useEffect(() => {
    if (isPlaying) {
      controls.pause();
      toggleIsPlaying();
    }
  }, [src]);

  useEffect(() => {
    if (state.time === state.duration && isRepeat) {
      controls.seek(0);
      controls.play();
    } else if (state.time === state.duration && isPlaying) {
      toggleIsPlaying();
    }
  }, [state.time]);

  useEffect(() => {
    if (!audio.ref.current) return;

    audio.ref.current.addEventListener('canplaythrough', function(){
      const context =  new AudioContext();
      const analyser = context.createAnalyser();
      const source = context.createMediaElementSource(audio.ref.current);

      source.connect(analyser);
      analyser.connect(context.destination);

      const bufferLength = analyser.frequencyBinCount;
      const frequencyData = new Uint8Array(bufferLength);

      const renderFrame = () => {
        analyser.getByteFrequencyData(frequencyData);
        requestAnimationFrame(renderFrame);

        onFrequencyChange && onFrequencyChange(frequencyData);
      }

      renderFrame();
    });
  }, [audio.ref.current]);

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
            <ActionIcon variant="transparent" c="gray" size="sm" onClick={() => window.open(`${src}?download=true`, '_blank')}>
              <IconDownload />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label="后退 5 秒" position="bottom">
            <ActionIcon variant="transparent" c="gray" onClick={() => controls.seek(state.time - 5)}>
              <IconPlayerTrackPrevFilled />
            </ActionIcon>
          </Tooltip>
          <ActionIcon radius="50%" size="lg" onClick={() => {
            toggleIsPlaying();
            if (isPlaying) {
              controls.pause();
            } else {
              controls.play();
            }
          }}>
            {isPlaying ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
          </ActionIcon>
          <Tooltip label="前进 5 秒" position="bottom">
            <ActionIcon variant="transparent" c="gray" onClick={() => controls.seek(state.time + 5)}>
              <IconPlayerTrackNextFilled />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group gap="xs" w="100%" maw="100px">
          <Tooltip label={state.muted ? "取消静音" : "静音"} position="bottom">
            <ActionIcon variant="transparent" c="gray" size="sm" onClick={() => state.muted ? controls.unmute() : controls.mute()}>
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
  )
}