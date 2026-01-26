import { useEffect, useCallback, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ActionIcon, Text, Title, Kbd, Group, Card, SimpleGrid, Stack, Container, Badge } from '@mantine/core';
import { IconArrowLeft, IconLock, IconLockOpen } from '@tabler/icons-react';
import { ChartCanvas } from '@/pages/public/Chart/components/ChartCanvas';
import { Controls, PlaybackControls } from '@/pages/public/Chart/components/Controls';
import { useGameStore } from '@/pages/public/Chart/stores/useGameStore';
import { parseSimaiChart, getAvailableDifficulties } from '@/pages/public/Chart/core/parser/ChartParser';
import { ChartDifficulty } from '@/pages/public/Chart/types';
import classes from './Chart.module.css';

async function fetchChartData(chartId: number): Promise<string | null> {
  try {
    const response = await fetch(`https://assets2.lxns.net/maimai/chart/${chartId}.txt`);
    if (!response.ok) {
      console.error('Failed to fetch chart data:', response.status);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.error('Failed to fetch chart data:', error);
    return null;
  }
}

function KeyboardShortcuts() {
  return (
    <Card className={classes.card} radius="lg" withBorder>
      <Text size="sm" fw={500} mb="sm">键盘快捷键</Text>
      <SimpleGrid cols={2} spacing="xs">
        <Group justify="space-between">
          <Kbd>Space</Kbd>
          <Text size="xs" c="dimmed">播放/暂停</Text>
        </Group>
        <Group justify="space-between">
          <Kbd>R</Kbd>
          <Text size="xs" c="dimmed">重新播放当前小节</Text>
        </Group>
        <Group justify="space-between">
          <Kbd>← →</Kbd>
          <Text size="xs" c="dimmed">步进</Text>
        </Group>
        <Group justify="space-between">
          <Kbd>↑ ↓</Kbd>
          <Text size="xs" c="dimmed">流速</Text>
        </Group>
      </SimpleGrid>
    </Card>
  );
}

function useKeyboardShortcuts() {
  const togglePlayback = useGameStore((s) => s.togglePlayback);
  const restart = useGameStore((s) => s.restart);
  const stepMeasure = useGameStore((s) => s.stepMeasure);
  const stepPosition = useGameStore((s) => s.stepPosition);
  const setHiSpeed = useGameStore((s) => s.setHiSpeed);
  const hiSpeed = useGameStore((s) => s.hiSpeed);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayback();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          restart();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          e.shiftKey ? stepMeasure(-1) : stepPosition(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.shiftKey ? stepMeasure(1) : stepPosition(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHiSpeed(Math.min(9, hiSpeed + 0.25));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setHiSpeed(Math.max(3, hiSpeed - 0.25));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlayback, restart, stepMeasure, stepPosition, setHiSpeed, hiSpeed]);
}

function ChartContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reset = useGameStore((s) => s.reset);
  const setRawSimaiText = useGameStore((s) => s.setRawSimaiText);
  const setMusicUrl = useGameStore((s) => s.setMusicUrl);
  const setChartData = useGameStore((s) => s.setChartData);
  const setAvailableDifficulties = useGameStore((s) => s.setAvailableDifficulties);
  const setSelectedDifficulty = useGameStore((s) => s.setSelectedDifficulty);
  const chartData = useGameStore((s) => s.chartData);
  const isFullscreen = useGameStore((s) => s.isFullscreen);
  const toggleFullscreen = useGameStore((s) => s.toggleFullscreen);
  const setIsFullscreen = useGameStore((s) => s.setIsFullscreen);

  const [showControls, setShowControls] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chartCanvasRef = useRef<HTMLDivElement>(null);
  const fullscreenElementRef = useRef<HTMLDivElement>(null);

  const chartIdParam = searchParams.get('chart_id');
  const difficultyParam = searchParams.get('difficulty');
  const chartId = chartIdParam ? parseInt(chartIdParam) : null;
  const difficulty = difficultyParam ? (parseInt(difficultyParam) + 2) as ChartDifficulty : null;

  useKeyboardShortcuts();

  const loadChart = useCallback(async () => {
    if (!chartId) return;

    setMusicUrl(`https://assets2.lxns.net/maimai/music/${chartId % 10000}.mp3`);

    const simai = await fetchChartData(chartId);
    if (simai) {
      setRawSimaiText(simai);

      try {
        const available = getAvailableDifficulties(simai);
        setAvailableDifficulties(available);

        let diffToUse = difficulty;
        if (!diffToUse || !available[diffToUse]) {
          const availableList = Object.keys(available).map(Number).sort((a, b) => b - a) as ChartDifficulty[];
          diffToUse = availableList[0] || null;
        }

        if (diffToUse) {
          setSelectedDifficulty(diffToUse);
          const chart = parseSimaiChart(simai, diffToUse);
          setChartData(chart);
        }
      } catch (error) {
        console.error('Failed to parse chart:', error);
      }
    }
  }, [chartId, difficulty, setRawSimaiText, setMusicUrl, setChartData, setAvailableDifficulties, setSelectedDifficulty]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  useEffect(() => {
    if (!isFullscreen) {
      setShowControls(true);
      setIsLocked(false);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      return;
    }

    if (isLocked) {
      setShowControls(false);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
      return;
    }

    let lastTouchTime = 0;
    let isOverControls = false;

    const showControlsWithTimeout = () => {
      setShowControls(true);
      
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }

      if (!isOverControls) {
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const wasOverControls = isOverControls;
      isOverControls = !!(target.closest('.mantine-ActionIcon-root') || target.closest('[class*="fullscreenControls"]'));
      
      if (isOverControls) {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
          controlsTimeoutRef.current = null;
        }
        if (!wasOverControls) {
          setShowControls(true);
        }
      } else {
        showControlsWithTimeout();
      }
    };

    const handleTouch = (e: TouchEvent) => {
      const now = Date.now();
      if (now - lastTouchTime < 300) {
        return;
      }
      lastTouchTime = now;

      const target = e.target as HTMLElement;
      const isTouchingControls = !!(target.closest('[class*="fullscreenControls"]') || target.closest('.mantine-ActionIcon-root'));
      
      if (isTouchingControls) {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
          controlsTimeoutRef.current = null;
        }
        isOverControls = true;
      } else {
        e.preventDefault();
        isOverControls = false;
        setShowControls(prev => {
          if (prev) {
            if (controlsTimeoutRef.current) {
              clearTimeout(controlsTimeoutRef.current);
              controlsTimeoutRef.current = null;
            }
            return false;
          } else {
            if (controlsTimeoutRef.current) {
              clearTimeout(controlsTimeoutRef.current);
            }
            controlsTimeoutRef.current = setTimeout(() => {
              setShowControls(false);
            }, 3000);
            return true;
          }
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('touchstart', handleTouch, { passive: false });

    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('touchstart', handleTouch);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = null;
      }
    };
  }, [isFullscreen, isLocked]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element;
        mozFullScreenElement?: Element;
        msFullscreenElement?: Element;
      };
      const isCurrentlyFullscreen = !!(document.fullscreenElement || 
        doc.webkitFullscreenElement || 
        doc.mozFullScreenElement || 
        doc.msFullscreenElement);
      
      if (isFullscreen && !isCurrentlyFullscreen) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [isFullscreen, setIsFullscreen]);

  // 全屏状态变化时调用浏览器API
  useEffect(() => {
    const element = fullscreenElementRef.current;
    if (!element) return;

    const enterFullscreen = async () => {
      try {
        const el = element as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
          mozRequestFullScreen?: () => Promise<void>;
          msRequestFullscreen?: () => Promise<void>;
        };
        if (element.requestFullscreen) {
          await element.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen();
        } else if (el.mozRequestFullScreen) {
          await el.mozRequestFullScreen();
        } else if (el.msRequestFullscreen) {
          await el.msRequestFullscreen();
        }
      } catch (err) {
        console.error('全屏失败:', err);
      }
    };

    const exitFullscreen = async () => {
      try {
        const doc = document as Document & {
          webkitExitFullscreen?: () => Promise<void>;
          mozCancelFullScreen?: () => Promise<void>;
          msExitFullscreen?: () => Promise<void>;
        };
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      } catch (err) {
        console.error('退出全屏失败:', err);
      }
    };

    if (isFullscreen) {
      enterFullscreen();
    } else {
      exitFullscreen();
    }
  }, [isFullscreen]);

  // 使用ref确保ChartCanvas只有一个实例
  useEffect(() => {
    const chartCanvasElement = chartCanvasRef.current;
    if (!chartCanvasElement) return;

    const fullscreenContainer = document.getElementById('fullscreen-chart-container');
    const normalContainer = document.getElementById('normal-chart-container');

    if (isFullscreen && fullscreenContainer) {
      fullscreenContainer.appendChild(chartCanvasElement);
    } else if (!isFullscreen && normalContainer) {
      normalContainer.appendChild(chartCanvasElement);
    }
  }, [isFullscreen]);

  return (
    <>
      <Container size="xl" py="lg" style={{ display: isFullscreen ? 'none' : 'block' }}>
        <Group mb="lg">
          <ActionIcon
            variant="subtle"
            onClick={() => navigate(-1)}
            aria-label="返回"
          >
            <IconArrowLeft size={20} />
          </ActionIcon>

          <div>
            <Group gap="xs">
              <Title order={3}>谱面预览</Title>
              <Badge variant="light" color="blue">测试版</Badge>
            </Group>
            {chartData && (
              <Text size="sm" c="dimmed">{chartData.title}</Text>
            )}
          </div>
        </Group>

        <div className={classes.grid}>
          <Stack gap="md">
            <div id="normal-chart-container">
              <div ref={chartCanvasRef}>
                <ChartCanvas />
              </div>
            </div>
            <PlaybackControls onToggleFullscreen={toggleFullscreen} isFullscreen={false} />
          </Stack>

          <Stack gap="md" className={classes.sidebar}>
            <Controls />
            <KeyboardShortcuts />
          </Stack>
        </div>
      </Container>

      {isFullscreen && (
        <div className={classes.fullscreen} ref={fullscreenElementRef}>
          <div id="fullscreen-chart-container" style={{ cursor: showControls ? 'default' : 'none' }} />
          <div className={`${classes.fullscreenControls} ${showControls ? classes.showControls : ''}`}>
            <PlaybackControls onToggleFullscreen={toggleFullscreen} isFullscreen={true} />
          </div>
          <ActionIcon
            className={`${classes.lockButton} ${(isLocked || showControls) ? classes.showButton : ''}`}
            variant="filled"
            color="dark"
            size="lg"
            radius="xl"
            onClick={() => setIsLocked(prev => !prev)}
            aria-label={isLocked ? '解锁控制' : '锁定控制'}
          >
            {isLocked ? <IconLock size={20} /> : <IconLockOpen size={20} />}
          </ActionIcon>
        </div>
      )}
    </>
  );
}

export default function Chart() {
  useEffect(() => {
    document.title = '谱面预览 | maimai DX 查分器';
  }, []);

  return <ChartContent />;
}
