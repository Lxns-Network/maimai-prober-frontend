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
import {
  IconArrowLeft,
  IconLock,
  IconLockOpen,
  IconDatabaseOff,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";
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
function KeyboardShortcuts({
  restartLabel,
  playInput,
}: Pick<ChartPlayerParts, "restartLabel" | "playInput">) {
  const available = (code: string) =>
    playInput?.device !== "keyboard" || !playInput.boundKeys.includes(code);
  const shortcuts = [
    [[playInput && "Esc", available("Space") && "Space"].filter(Boolean).join(" / "), "播放/暂停"],
    [available("KeyR") && "R", restartLabel],
    [
      [available("ArrowLeft") && "←", available("ArrowRight") && "→"].filter(Boolean).join(" "),
      "步进",
    ],
    [
      [available("ArrowUp") && "↑", available("ArrowDown") && "↓"].filter(Boolean).join(" "),
      "流速",
    ],
  ] as const;
  return (
    <Card className={classes.card} radius="lg" withBorder>
      <Text size="sm" fw={500} mb="sm">
        键盘快捷键
      </Text>
      <SimpleGrid cols={2} spacing="xs">
        {shortcuts.map(
          ([keys, label]) =>
            keys && (
              <Group key={label} justify="space-between">
                <Kbd>{keys}</Kbd>
                <Text size="xs" c="dimmed">
                  {label}
                </Text>
              </Group>
            ),
        )}
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
  playInput,
  game,
}: ChartPlayerParts & { game: Game }) {
  const isFullscreen = useGameStore((s) => s.isFullscreen);
  const toggleFullscreen = useGameStore((s) => s.toggleFullscreen);
  const setIsFullscreen = useGameStore((s) => s.setIsFullscreen);

  const [showControls, setShowControls] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const canvasInput = playInput && playInput.device !== "controller" ? playInput : null;
  const revealControls = !!canvasInput && !isLocked && !showControls;
  const playingOnCanvas = canvasInput?.playing;
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
      return;
    }

    if (isLocked) {
      setShowControls(false);
      return;
    }

    const element = fullscreenElementRef.current!;
    let timeout: ReturnType<typeof setTimeout>;
    let lastTouchTime = -Infinity;
    const hideAfterDelay = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };
    const isControl = (target: EventTarget | null) =>
      target instanceof Element &&
      target !== element &&
      !target.closest("#fullscreen-chart-container");

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      setShowControls(true);
      if (isControl(event.target)) clearTimeout(timeout);
      else hideAfterDelay();
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (isControl(event.target)) {
        clearTimeout(timeout);
        return;
      }
      if (event.touches.length !== 1 || event.timeStamp - lastTouchTime < 300) return;
      lastTouchTime = event.timeStamp;
      event.preventDefault();
      setShowControls((visible) => !visible);
      hideAfterDelay();
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (
        isControl(event.target) &&
        !Array.from(event.touches).some((touch) => isControl(touch.target))
      )
        hideAfterDelay();
    };

    element.addEventListener("pointermove", handlePointerMove);
    element.addEventListener("touchstart", handleTouchStart, { passive: false });
    element.addEventListener("touchend", handleTouchEnd);
    element.addEventListener("touchcancel", handleTouchEnd);
    hideAfterDelay();

    return () => {
      element.removeEventListener("pointermove", handlePointerMove);
      element.removeEventListener("touchstart", handleTouchStart);
      element.removeEventListener("touchend", handleTouchEnd);
      element.removeEventListener("touchcancel", handleTouchEnd);
      clearTimeout(timeout);
    };
  }, [isFullscreen, isLocked]);

  useEffect(() => {
    if (isFullscreen && playingOnCanvas) setShowControls(false);
  }, [isFullscreen, playingOnCanvas]);

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
    // A home-screen app has no browser interface to hide, and iPadOS Safari warns of phishing when
    // the page is tapped rapidly under the Fullscreen API, which touch play does.
    if (!element || window.matchMedia("(display-mode: standalone)").matches) return;

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
              <KeyboardShortcuts restartLabel={restartLabel} playInput={playInput} />
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
            inert={!showControls}
          >
            {playbackControls({
              onToggleFullscreen: toggleFullscreen,
              isFullscreen: true,
              portalTarget: fullscreenEl,
            })}
          </div>
          <ActionIcon
            className={`${classes.lockButton} ${isLocked || showControls || revealControls ? classes.showButton : ""}`}
            variant="filled"
            color="dark"
            size="lg"
            radius="xl"
            onClick={() => {
              if (revealControls) setShowControls(true);
              else setIsLocked((prev) => !prev);
            }}
            aria-label={revealControls ? "显示播放控制" : isLocked ? "解锁控制" : "锁定控制"}
          >
            {revealControls ? (
              <IconAdjustmentsHorizontal size={20} />
            ) : isLocked ? (
              <IconLock size={20} />
            ) : (
              <IconLockOpen size={20} />
            )}
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
    // 中二谱面预览上线前分享的谱面链接不带 game 参数，只可能指向舞萌谱面。
    url.searchParams.set("game", search.chart_id ? "maimai" : selected);
    void navigate(`${url.pathname}${url.search}${url.hash}`, { overwriteLastHistoryEntry: true });
  }, [activeGame, game, hasUrlGame, search.chart_id, setGame]);
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
