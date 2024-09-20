import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  MantineProvider,
  rem,
  Loader,
  Group, createTheme, ActionIcon
} from '@mantine/core';
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { isTokenUndefined, logout } from "./utils/session";
import { refreshToken } from "./utils/api/user";
import RouterTransition from "./components/RouterTransition";
import classes from "./App.module.css";

import { ErrorBoundary } from "react-error-boundary";
import { Fallback } from "./pages/public/Fallback.tsx";
import { PhotoProvider } from "react-photo-view";
import 'react-photo-view/dist/react-photo-view.css';
import { IconMaximize, IconMinimize, IconRotateClockwise, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { useFullscreen, useLocalStorage } from "@mantine/hooks";
import useSongListStore from "./hooks/useSongListStore.tsx";
import { useShallow } from "zustand/react/shallow";
import useAliasListStore from "./hooks/useAliasListStore.tsx";
import Shell from "./components/Shell/Shell.tsx";
import useTouchEvents from "beautiful-react-hooks/useTouchEvents";

const theme = createTheme({
  focusRing: 'never',
  cursorType: 'pointer',
  activeClassName: classes.active,
});

export const NAVBAR_BREAKPOINT = 992;

export default function App() {
  const { toggle, fullscreen } = useFullscreen();
  const [opened, setOpened] = useState(window.innerWidth > NAVBAR_BREAKPOINT);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const viewport = useRef<HTMLDivElement>(null);

  // 右滑打开侧边栏
  const ref = useRef<HTMLDivElement>(null);
  const { onTouchStart, onTouchEnd } = useTouchEvents(ref);
  let startX = 0;

  onTouchStart((event) => {
    startX = event.touches[0].clientX;
  });

  onTouchEnd((event) => {
    const endX = event.changedTouches[0].clientX;

    if (endX - startX > 100) {
      setOpened(true);
    }
  });

  const [getSongList, fetchSongList] = useSongListStore(
    useShallow((state) => [state.getSongList, state.fetchSongList]),
  )
  const [fetchAliasList] = useAliasListStore(
    useShallow((state) => [state.fetchAliasList]),
  )
  const [game, setGame] = useLocalStorage({ key: 'game' });

  const handleResize = () => {
    setOpened(window.innerWidth > NAVBAR_BREAKPOINT);
  };

  const toggleNavbarOpened = () => {
    if (window.innerWidth <= NAVBAR_BREAKPOINT) setOpened(!opened);
  };

  useEffect(() => {
    if (!isTokenUndefined()) {
      // 进入页面时刷新一次 token，不论有效期
      refreshToken().catch(() => {
        logout();
        if (location.pathname !== '/login') {
          navigate('/login', { state: { expired: true, redirect: location.pathname } });
        }
      });
    }

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  useEffect(() => {
    if (game !== "maimai" && game !== "chunithm") {
      let defaultGame = "maimai";
      if (/maimai|chunithm/.test(searchParams.get("game") || "")) {
        defaultGame = searchParams.get("game") || defaultGame;
      }
      setGame(defaultGame);
      return;
    }

    if (getSongList(game).songs.length === 0) {
      Promise.all([
        fetchSongList(),
        fetchAliasList(),
      ]).catch((error) => {
        console.log(error);
      });
    }
  }, [game]);

  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <ErrorBoundary FallbackComponent={Fallback}>
        <ModalsProvider labels={{ confirm: '确定', cancel: '取消' }}>
          <PhotoProvider
            speed={() => 200}
            maskOpacity={0.6}
            onVisibleChange={(visible) => !visible && fullscreen && toggle()}
            toolbarRender={({ onScale, scale, onRotate, rotate }) => {
              return (
                <Group h={44} gap={0}>
                  <ActionIcon variant="transparent" size={44} onClick={() => onScale(scale + 1)}>
                    <IconZoomIn className={classes.photoViewerIcon} />
                  </ActionIcon>
                  <ActionIcon variant="transparent" size={44} onClick={() => onScale(scale - 1)}>
                    <IconZoomOut className={classes.photoViewerIcon} />
                  </ActionIcon>
                  <ActionIcon variant="transparent" size={44} onClick={() => onRotate(rotate + 90)}>
                    <IconRotateClockwise className={classes.photoViewerIcon} />
                  </ActionIcon>
                  <ActionIcon variant="transparent" size={44} onClick={() => toggle()}>
                    {fullscreen ? (
                      <IconMinimize className={classes.photoViewerIcon} />
                    ) : (
                      <IconMaximize className={classes.photoViewerIcon} />
                    )}
                  </ActionIcon>
                </Group>
              );
            }}
          >
            <Notifications />
            <RouterTransition />
            <Shell navbarOpened={opened} onNavbarToggle={toggleNavbarOpened} viewportRef={viewport}>
              <div ref={ref}>
                <Suspense fallback={(
                  <Group justify="center" p={rem(80)}>
                    <Loader type="dots" size="xl" />
                  </Group>
                )}>
                  <ErrorBoundary FallbackComponent={Fallback}>
                    <Outlet />
                  </ErrorBoundary>
                </Suspense>
              </div>
            </Shell>
          </PhotoProvider>
        </ModalsProvider>
      </ErrorBoundary>
    </MantineProvider>
  );
}