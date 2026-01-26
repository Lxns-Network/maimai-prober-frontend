import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  ActionIcon,
  Card,
  Collapse,
  Group,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconVolume,
  IconVolumeOff,
  IconMusic,
  IconChevronDown,
  IconAdjustments,
  IconMaximize,
  IconMinimize,
} from '@tabler/icons-react';
import { useGameStore } from '../../stores/useGameStore';
import { parseSimaiChart } from '../../core/parser/ChartParser';
import { ChartDifficulty, DIFFICULTY_NAMES, DIFFICULTY_COLORS } from '../../types';
import { NoteCountGraph } from '../NoteCountGraph';
import classes from './Controls.module.css';

type PlaybackControlsProps = {
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
};

export function PlaybackControls({ onToggleFullscreen, isFullscreen }: PlaybackControlsProps) {
  const {
    isPlaying, soundEnabled, timeline, pendingPlay,
    togglePlayback, setMeasure, stepMeasure, stepPosition, setSoundEnabled,
  } = useGameStore(useShallow((state) => state));
  
  const { currentMeasure } = timeline;

  const restartMeasure = () => setMeasure(currentMeasure);

  const getPlayButtonIcon = () => {
    return isPlaying ? <IconPlayerPause size={24} /> : <IconPlayerPlay size={24} />;
  };

  const getPlayButtonTooltip = () => {
    return isPlaying ? '暂停' : '播放';
  };

  return (
    <Card 
      className={classes.card}
      padding="sm"
      radius="lg"
      withBorder={!isFullscreen}
      style={isFullscreen ? { background: 'transparent' } : undefined}
    >
      <Stack gap="sm">
        <NoteCountGraph fullscreen={isFullscreen} />

        <Group justify="center" gap="xs" wrap="wrap">
          <Tooltip label="上一小节">
            <ActionIcon variant="subtle" color={isFullscreen ? 'white' : 'gray'} size="lg" onClick={() => stepMeasure(-1)}>
              <IconChevronsLeft size={20} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="上一位置">
            <ActionIcon variant="subtle" color={isFullscreen ? 'white' : 'gray'} size="lg" onClick={() => stepPosition(-1)}>
              <IconChevronLeft size={20} />
            </ActionIcon>
          </Tooltip>

          {pendingPlay && !isPlaying ? (
            <ActionIcon
              variant="filled"
              size="xl"
              radius="xl"
              loading={true}
            />
          ) : (
            <Tooltip label={getPlayButtonTooltip()}>
              <ActionIcon
                variant="filled"
                size="xl"
                radius="xl"
                onClick={togglePlayback}
              >
                {getPlayButtonIcon()}
              </ActionIcon>
            </Tooltip>
          )}

          <Tooltip label="下一位置">
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? 'white' : 'gray'}
              size="lg"
              onClick={() => stepPosition(1)}
            >
              <IconChevronRight size={20} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label="下一小节">
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? 'white' : 'gray'}
              size="lg"
              onClick={() => stepMeasure(1)}
            >
              <IconChevronsRight size={20} />
            </ActionIcon>
          </Tooltip>

          <div className={classes.separator} />

          <Tooltip label="重新播放当前小节">
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? 'white' : 'gray'}
              size="lg"
              onClick={restartMeasure}
            >
              <IconRefresh size={20} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={soundEnabled ? '关闭正解音' : '开启正解音'}>
            <ActionIcon
              variant="subtle"
              color={isFullscreen ? 'white' : 'gray'}
              size="lg"
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? <IconVolume size={20} /> : <IconVolumeOff size={20} />}
            </ActionIcon>
          </Tooltip>

          {onToggleFullscreen && (
            <Tooltip label={isFullscreen ? '退出全屏' : '全屏预览'}>
              <ActionIcon
                variant="subtle"
                color={isFullscreen ? 'white' : 'gray'}
                size="lg"
                onClick={onToggleFullscreen}
              >
                {isFullscreen ? <IconMinimize size={20} /> : <IconMaximize size={20} />}
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

export function Controls() {
  const {
    hiSpeed, slideRotation, mirrorMode, playbackSpeed, rawSimaiText,
    judgmentLineDesign, pinkSlideStart, highlightExNotes, normalColorBreakSlide,
    musicOffset, musicVolume, soundOffset, selectedDifficulty, availableDifficulties, chartData,
    setHiSpeed, setSlideRotation, setMirrorMode, setPlaybackSpeed,
    setJudgmentLineDesign, setPinkSlideStart, setHighlightExNotes, setNormalColorBreakSlide,
    setChartData, setMusicOffset, setMusicVolume, setSoundOffset, setSelectedDifficulty,
  } = useGameStore(useShallow((state) => state));

  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [showMusicSettings, setShowMusicSettings] = useState(false);

  const handleDifficultyChange = useCallback((difficulty: ChartDifficulty) => {
    if (!rawSimaiText.trim()) return;
    
    setSelectedDifficulty(difficulty);
    const chart = parseSimaiChart(rawSimaiText, difficulty);
    setChartData(chart);
    
    const url = new URL(window.location.href);
    url.searchParams.set('difficulty', String(difficulty - 2));
    window.history.replaceState({}, '', url.toString());
  }, [rawSimaiText, setSelectedDifficulty, setChartData]);

  return (
    <Stack gap="md">
      <Card className={classes.card} radius="lg" withBorder>
        <Stack gap="md">
          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={500}>流速</Text>
              <Text size="sm" c="dimmed" ff="monospace">{hiSpeed}</Text>
            </Group>
            <Slider
              value={hiSpeed}
              onChange={setHiSpeed}
              min={3}
              max={9}
              step={0.25}
              marks={[
                { value: 3 },
                { value: 6 },
                { value: 9 },
              ]}
            />
            <Group justify="space-between">
              <Text size="xs" c="dimmed" ff="monospace">3</Text>
              <Text size="xs" c="dimmed" ff="monospace">6</Text>
              <Text size="xs" c="dimmed" ff="monospace">9</Text>
            </Group>
          </div>

          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" fw={500}>播放速度</Text>
              <Text size="sm" c="dimmed" ff="monospace">{playbackSpeed.toPrecision(2)}x</Text>
            </Group>
            <Slider
              value={playbackSpeed}
              onChange={setPlaybackSpeed}
              min={0.1}
              max={1.0}
              step={0.05}
              marks={[
                { value: 0.1 },
                { value: 0.5 },
                { value: 1.0 },
              ]}
            />
            <Group justify="space-between">
              <Text size="xs" c="dimmed" ff="monospace">0.1x</Text>
              <Text size="xs" c="dimmed" ff="monospace">1.0x</Text>
            </Group>
          </div>
        </Stack>
      </Card>

      {chartData?.title.indexOf("UTAGE") !== -1 || Object.keys(availableDifficulties).length > 0 && (
        <Group gap="xs" grow>
          {([1, 2, 3, 4, 5, 6] as ChartDifficulty[]).map((diff) => {
            const isAvailable = availableDifficulties[diff];
            const isSelected = selectedDifficulty === diff;
            const level = chartData?.level?.[`lv_${diff}` as keyof typeof chartData.level];
            const color = DIFFICULTY_COLORS[diff];
            
            if (!isAvailable) return null;
            
            const isLightColor = diff === 6;
            const textColor = isSelected 
              ? (isLightColor ? '#BE6FF8' : '#fff')
              : (isLightColor ? '#c4b5fd' : color);
            
            return (
              <UnstyledButton
                key={diff}
                onClick={() => handleDifficultyChange(diff)}
                className={`${classes.difficultyButton} ${isSelected ? classes.difficultyButtonSelected : ''}`}
                style={{
                  backgroundColor: isSelected ? color : (isLightColor ? '#c4b5fd30' : `${color}20`),
                  color: textColor,
                }}
              >
                <span className={classes.difficultyName}>{DIFFICULTY_NAMES[diff]}</span>
                {level && <span className={classes.difficultyLevel}>{level}</span>}
              </UnstyledButton>
            );
          })}
        </Group>
      )}

      <Card className={classes.card} radius="lg" withBorder>
        <UnstyledButton
          onClick={() => setShowDisplaySettings(!showDisplaySettings)}
          w="100%"
        >
          <Group justify="space-between">
            <Group gap="xs">
              <IconAdjustments size={20} />
              <Text size="sm" fw={500}>显示设置</Text>
            </Group>
            <IconChevronDown
              size={16}
              style={{
                transition: 'transform 0.2s',
                transform: showDisplaySettings ? 'rotate(180deg)' : 'none',
              }}
            />
          </Group>
        </UnstyledButton>

        <Collapse in={showDisplaySettings}>
          <Stack gap="md" mt="md">
            <div>
              <Text size="sm" mb={4}>镜像</Text>
              <SegmentedControl
                value={mirrorMode}
                onChange={(value) => setMirrorMode(value as 'none' | 'horizontal' | 'vertical' | 'rotate180')}
                data={[
                  { value: 'none', label: '无' },
                  { value: 'horizontal', label: '左右反' },
                  { value: 'vertical', label: '上下反' },
                  { value: 'rotate180', label: '全反' },
                ]}
                size="xs"
                fullWidth
              />
            </div>

            {/* Judgment Line Design */}
            <div>
              <Text size="sm" mb={4}>判定线</Text>
              <SegmentedControl
                value={judgmentLineDesign}
                onChange={(value) => setJudgmentLineDesign(value as 'blind' | 'noLine' | 'simple' | 'sensor')}
                data={[
                  { value: 'blind', label: '无' },
                  { value: 'noLine', label: '判定点' },
                  { value: 'simple', label: '判定线' },
                  { value: 'sensor', label: '判定区' },
                ]}
                size="xs"
                fullWidth
              />
            </div>

            <Group justify="space-between">
              <Text size="sm">星星头旋转</Text>
              <Switch
                checked={slideRotation}
                onChange={(e) => setSlideRotation(e.currentTarget.checked)}
              />
            </Group>

            <Group justify="space-between">
              <Text size="sm">使用粉色星星头</Text>
              <Switch
                checked={pinkSlideStart}
                onChange={(e) => setPinkSlideStart(e.currentTarget.checked)}
              />
            </Group>

            <Group justify="space-between">
              <Text size="sm">高亮保护套</Text>
              <Switch
                checked={highlightExNotes}
                onChange={(e) => setHighlightExNotes(e.currentTarget.checked)}
              />
            </Group>

            <Group justify="space-between">
              <Text size="sm">使用标准颜色的绝赞星星</Text>
              <Switch
                checked={normalColorBreakSlide}
                onChange={(e) => setNormalColorBreakSlide(e.currentTarget.checked)}
              />
            </Group>
          </Stack>
        </Collapse>
      </Card>

      <Card className={classes.card} radius="lg" withBorder>
        <UnstyledButton
          onClick={() => setShowMusicSettings(!showMusicSettings)}
          w="100%"
        >
          <Group justify="space-between">
            <Group gap="xs">
              <IconMusic size={20} />
              <Text size="sm" fw={500}>音频设置</Text>
            </Group>
            <IconChevronDown
              size={16}
              style={{
                transition: 'transform 0.2s',
                transform: showMusicSettings ? 'rotate(180deg)' : 'none',
              }}
            />
          </Group>
        </UnstyledButton>

        <Collapse in={showMusicSettings}>
          <Stack gap="md" mt="md">
            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm">音乐音量</Text>
                <Text size="sm" c="dimmed" ff="monospace">{Math.round(musicVolume * 100)}%</Text>
              </Group>
              <Slider
                value={musicVolume}
                onChange={setMusicVolume}
                min={0}
                max={1}
                step={0.1}
              />
            </div>

            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm">音乐偏移</Text>
                <Text size="sm" c="dimmed" ff="monospace">{musicOffset}ms</Text>
              </Group>
              <Slider
                value={musicOffset}
                onChange={setMusicOffset}
                min={-2000}
                max={2000}
                step={10}
                marks={[
                  { value: -2000 },
                  { value: 0 },
                  { value: 2000 },
                ]}
              />
              <Group justify="space-between">
                <Text size="xs" c="dimmed" ff="monospace">-2000</Text>
                <Text size="xs" c="dimmed" ff="monospace">0</Text>
                <Text size="xs" c="dimmed" ff="monospace">+2000</Text>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>
                正值: 音乐延后 | 负值: 音乐提前
              </Text>
            </div>

            <div>
              <Group justify="space-between" mb={4}>
                <Text size="sm">正解音偏移</Text>
                <Text size="sm" c="dimmed" ff="monospace">{soundOffset}ms</Text>
              </Group>
              <Slider
                value={soundOffset}
                onChange={setSoundOffset}
                min={-200}
                max={200}
                step={5}
                marks={[
                  { value: -200 },
                  { value: 0 },
                  { value: 200 },
                ]}
              />
              <Group justify="space-between">
                <Text size="xs" c="dimmed" ff="monospace">-200</Text>
                <Text size="xs" c="dimmed" ff="monospace">0</Text>
                <Text size="xs" c="dimmed" ff="monospace">+200</Text>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>
                正值: 正解音延后 | 负值: 正解音提前
              </Text>
            </div>
          </Stack>
        </Collapse>
      </Card>
    </Stack>
  );
}

export default Controls;
