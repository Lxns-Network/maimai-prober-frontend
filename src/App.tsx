import { Suspense, useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { MantineProvider, rem, Loader, Group, createTheme, ActionIcon, Portal } from '@mantine/core';
import { IconMaximize, IconMinimize, IconRotateClockwise, IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { ModalsProvider } from "@mantine/modals";
import { notifications, Notifications } from "@mantine/notifications";
import { isTokenUndefined, logout } from "@/utils/session";
import RouterTransition from "@/components/RouterTransition";

import { ErrorBoundary } from "react-error-boundary";
import { Fallback } from "@/pages/public/Fallback.tsx";
import { PhotoProvider } from "react-photo-view";
import { useFullscreen } from "@mantine/hooks";
import { useShallow } from "zustand/react/shallow";
import useTouchEvents from "beautiful-react-hooks/useTouchEvents";
import Shell from "@/components/Shell/Shell.tsx";
import useSongListStore from "@/hooks/useSongListStore.ts";
import useAliasListStore from "@/hooks/useAliasListStore.ts";
import { useSiteConfig } from "@/hooks/swr/useSiteConfig.ts";
import { useUserToken } from "@/hooks/swr/useUserToken.ts";

import 'react-photo-view/dist/react-photo-view.css';
import classes from "./App.module.css";
import useGame from "@/hooks/useGame.ts";

const theme = createTheme({
  focusRing: 'never',
  cursorType: 'pointer',
  activeClassName: classes.active,
  components: {
    Portal: Portal.extend({
      defaultProps: {
        reuseTargetNode: true,
      },
    }),
  },
});

export const NAVBAR_BREAKPOINT = 992;

export default function App() {
  const { config, isLoading: isSiteConfigLoading } = useSiteConfig();
  const { error: userTokenError } = useUserToken();
  const { toggle, fullscreen } = useFullscreen();
  const [opened, setOpened] = useState(window.innerWidth > NAVBAR_BREAKPOINT);
  const navigate = useNavigate();
  const location = useLocation();
  const viewport = useRef<HTMLDivElement>(null);

  // 侧边栏手势
  const ref = useRef<HTMLDivElement>(null);
  const { onTouchStart, onTouchEnd } = useTouchEvents(ref);
  const [touchStartX, setTouchStartX] = useState(0);

  onTouchStart((event: TouchEvent) => {
    setTouchStartX(event.touches[0].clientX);
  });

  onTouchEnd((event: TouchEvent) => {
    if (touchStartX / window.innerWidth > 0.1) return;

    const touchEndX = event.changedTouches[0].clientX;

    if (touchEndX - touchStartX > 100) {
      setOpened(true);
    }
  });

  // 侧边栏开关
  const toggleNavbarOpened = () => {
    if (window.innerWidth <= NAVBAR_BREAKPOINT) setOpened(!opened);
  };

  useEffect(() => {
    const handleResize = () => {
      setOpened(window.innerWidth > NAVBAR_BREAKPOINT);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const [getSongList, fetchSongList] = useSongListStore(
    useShallow((state) => [state.getSongList, state.fetchSongList]),
  )
  const [fetchAliasList] = useAliasListStore(
    useShallow((state) => [state.fetchAliasList]),
  )
  const [game] = useGame();

  useEffect(() => {
    if (userTokenError) {
      if (location.pathname !== '/login') {
        navigate('/login', {
          state: {
            expired: !isTokenUndefined(),
            redirect: location.pathname,
          }
        });
      }

      logout();
    }
  }, [userTokenError]);

  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  useEffect(() => {
    if (isSiteConfigLoading || !config) return;

    if (getSongList(game).songs.length === 0) {
      Promise.all([
        fetchSongList(config.resource_hashes),
        fetchAliasList(),
      ]).catch((error) => {
        notifications.show({
          title: "获取曲目数据失败",
          message: error.message,
          color: "red",
        });
      });
    }
  }, [game, isSiteConfigLoading]);

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