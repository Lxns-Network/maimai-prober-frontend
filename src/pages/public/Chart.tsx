import { lazy, Suspense, useEffect, useCallback, useState, useRef } from "react";
import {
  ActionIcon,
  Text,
  Title,
  Kbd,
  Group,
  Card,
  SimpleGrid,
  Stack,
  Container,
  Badge,
  Center,
  Loader,
  Button,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { IconArrowLeft, IconLock, IconLockOpen, IconDatabaseOff } from "@tabler/icons-react";
import { navigate } from "vike/client/router";
import { usePageContext } from "vike-react/usePageContext";
import useGame from "@/hooks/useGame";
import { EmptyState } from "@/components/EmptyState";
import { useGameStore } from "./Chart/stores/useGameStore";
import type { ChartPlayerParts } from "./Chart/types";
import type { Game } from "@/types/game";
import classes from "./Chart.module.css";
const MaimaiPlayer = lazy(() => import("./Chart/components/MaimaiPlayer"));
const ChunithmPlayer = lazy(() => import("./Chart/components/ChunithmPlayer"));
function KeyboardShortcuts({ restartLabel }: { restartLabel: string }) {
  return (
    <Card className={classes.card} radius="lg" withBorder>
      <Text size="sm" fw={500} mb="sm">
        键盘快捷键
      </Text>
      <SimpleGrid cols={2} spacing="xs">
        <Group justify="space-between">
          <Kbd>Space</Kbd>
          <Text size="xs" c="dimmed">
            播放/暂停
          </Text>
        </Group>
        <Group justify="space-between">
          <Kbd>R</Kbd>
          <Text size="xs" c="dimmed">
            {restartLabel}
          </Text>
        </Group>
        <Group justify="space-between">
          <Kbd>← →</Kbd>
          <Text size="xs" c="dimmed">
            步进
          </Text>
        </Group>
        <Group justify="space-between">
          <Kbd>↑ ↓</Kbd>
          <Text size="xs" c="dimmed">
            流速
          </Text>
        </Group>
      </SimpleGrid>
    </Card>
  );
}

function ChartContent({
  title,
  canvas,
  controls,
  playbackControls,
  restartLabel,
  game,
}: ChartPlayerParts & { game: Game }) {
  const isFullscreen = useGameStore((s) => s.isFullscreen);
  const toggleFullscreen = useGameStore((s) => s.toggleFullscreen);
  const setIsFullscreen = useGameStore((s) => s.setIsFullscreen);

  const [showControls, setShowControls] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const chartCanvasRef = useRef<HTMLDivElement>(null);
  const fullscreenElementRef = useRef<HTMLDivElement>(null);
  const [fullscreenEl, setFullscreenEl] = useState<HTMLDivElement | null>(null);
  const setFullscreenElement = useCallback((el: HTMLDivElement | null) => {
    fullscreenElementRef.current = el;
    setFullscreenEl(el);
  }, []);

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
      isOverControls = !!(
        target.closest(".mantine-ActionIcon-root") ||
        target.closest('[class*="fullscreenControls"]')
      );

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
      const isTouchingControls = !!(
        target.closest('[class*="fullscreenControls"]') ||
        target.closest(".mantine-ActionIcon-root")
      );

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
        setShowControls((prev) => {
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

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchstart", handleTouch, { passive: false });

    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchstart", handleTouch);
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
      const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement
      );

      if (isFullscreen && !isCurrentlyFullscreen) {
        setIsFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, [isFullscreen, setIsFullscreen]);

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
        console.error("全屏失败:", err);
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
        console.error("退出全屏失败:", err);
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

    const fullscreenContainer = document.getElementById("fullscreen-chart-container");
    const normalContainer = document.getElementById("normal-chart-container");

    if (isFullscreen && fullscreenContainer) {
      fullscreenContainer.appendChild(chartCanvasElement);
    } else if (!isFullscreen && normalContainer) {
      normalContainer.appendChild(chartCanvasElement);
    }
  }, [isFullscreen]);

  return (
    <>
      <Container size="xl" py="lg" style={{ display: isFullscreen ? "none" : "block" }}>
        <Group mb="lg">
          <ActionIcon variant="subtle" onClick={() => window.history.back()} aria-label="返回">
            <IconArrowLeft size={20} />
          </ActionIcon>

          <div>
            <Group gap="xs">
              <Title order={3}>谱面预览</Title>
              <Badge variant="light">测试版</Badge>
            </Group>
            {title && (
              <Text size="sm" c="dimmed">
                {title}
              </Text>
            )}
          </div>
        </Group>

        {!canvas ? (
          <EmptyState icon={<IconDatabaseOff size={32} />} title="请选择谱面开始预览">
            <Button component="a" href={`/songs?game=${game}`} variant="light">
              浏览曲目
            </Button>
          </EmptyState>
        ) : (
          <div className={classes.grid}>
            <Stack gap="md">
              <div id="normal-chart-container">
                <div ref={chartCanvasRef}>{canvas}</div>
              </div>
              {!isFullscreen &&
                playbackControls({ onToggleFullscreen: toggleFullscreen, isFullscreen: false })}
            </Stack>

            <Stack gap="md" className={classes.sidebar}>
              {controls}
              <KeyboardShortcuts restartLabel={restartLabel} />
            </Stack>
          </div>
        )}
      </Container>

      {isFullscreen && (
        <div className={classes.fullscreen} ref={setFullscreenElement}>
          <div
            id="fullscreen-chart-container"
            style={{ cursor: showControls ? "default" : "none" }}
          />
          <div
            className={`${classes.fullscreenControls} ${showControls ? classes.showControls : ""}`}
          >
            {playbackControls({
              onToggleFullscreen: toggleFullscreen,
              isFullscreen: true,
              portalTarget: fullscreenEl,
            })}
          </div>
          <ActionIcon
            className={`${classes.lockButton} ${isLocked || showControls ? classes.showButton : ""}`}
            variant="filled"
            color="dark"
            size="lg"
            radius="xl"
            onClick={() => setIsLocked((prev) => !prev)}
            aria-label={isLocked ? "解锁控制" : "锁定控制"}
          >
            {isLocked ? <IconLock size={20} /> : <IconLockOpen size={20} />}
          </ActionIcon>
          <Notifications withinPortal={false} />
        </div>
      )}
    </>
  );
}

export default function Chart() {
  const search = usePageContext().urlParsed.search;
  const [activeGame, setGame] = useGame();
  const game = search.game === "chunithm" || search.game === "maimai" ? search.game : activeGame;
  const setIsFullscreen = useGameStore((state) => state.setIsFullscreen);
  const hasUrlGame = search.game === "chunithm" || search.game === "maimai";
  useEffect(() => {
    if (hasUrlGame) {
      if (activeGame !== game) setGame(game);
      return;
    }
    const url = new URL(window.location.href);
    const stored = localStorage.getItem("game");
    const selected =
      stored === '"chunithm"' ? "chunithm" : stored === '"maimai"' ? "maimai" : activeGame;
    url.searchParams.set("game", selected);
    void navigate(`${url.pathname}${url.search}${url.hash}`, { overwriteLastHistoryEntry: true });
  }, [activeGame, game, hasUrlGame, setGame]);
  useEffect(() => () => setIsFullscreen(false), [game, setIsFullscreen]);
  if (!hasUrlGame)
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  const renderPlayer = (parts: ChartPlayerParts) => <ChartContent {...parts} game={game} />;
  if (!search.chart_id && !(import.meta.env.DEV && game === "maimai"))
    return renderPlayer({
      canvas: null,
      controls: null,
      playbackControls: () => null,
      restartLabel: "重新播放",
    });
  return (
    <Suspense
      fallback={
        <Center py="xl">
          <Loader />
        </Center>
      }
    >
      {game === "chunithm" ? (
        <ChunithmPlayer>{renderPlayer}</ChunithmPlayer>
      ) : (
        <MaimaiPlayer>{renderPlayer}</MaimaiPlayer>
      )}
    </Suspense>
  );
}
