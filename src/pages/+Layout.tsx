import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  MantineProvider,
  rem,
  Loader,
  Group,
  createTheme,
  ActionIcon,
  Button,
  Text,
} from "@mantine/core";
import {
  IconMaximize,
  IconMinimize,
  IconRotateClockwise,
  IconZoomIn,
  IconZoomOut,
} from "@tabler/icons-react";
import { ModalsProvider } from "@mantine/modals";
import { ManagedModalsBackGuard } from "@/components/ModalProvider/ManagedModalsBackGuard.tsx";
import { notifications, Notifications } from "@mantine/notifications";
import { logout } from "@/utils/session";
import * as Sentry from "@sentry/react";
import { usePageContext } from "vike-react/usePageContext";
import { navigate } from "vike/client/router";

import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "@/lib/queryClient.ts";
import { ErrorBoundary } from "react-error-boundary";
import { Fallback } from "@/pages/public/Fallback.tsx";
import { PhotoProvider } from "react-photo-view";
import { useFullscreenDocument } from "@mantine/hooks";
import { useShallow } from "zustand/react/shallow";
import useTouchEvents from "beautiful-react-hooks/useTouchEvents";
import Shell from "@/components/Shell/Shell.tsx";
import useSongListStore from "@/hooks/useSongListStore.ts";
import useAliasListStore from "@/hooks/useAliasListStore.ts";
import { useSiteConfig } from "@/hooks/queries/useSiteConfig.ts";
import { useUserToken } from "@/hooks/queries/useUserToken.ts";
import { useVersionChecker } from "@/hooks/useVersionChecker.tsx";
import { HelmetProvider } from "react-helmet-async";

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/nprogress/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/carousel/styles.css";
import "@mantine/tiptap/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/code-highlight/styles.css";
import "mantine-datatable/styles.css";
import "react-photo-view/dist/react-photo-view.css";
import "@/index.css";
import classes from "@/App.module.css";
import { useThemeColor } from "@/hooks/useThemeColor.ts";
import { NAVBAR_BREAKPOINT } from "@/components/Shell/Shell.tsx";

// Tag iOS so index.css can force inputs to >=16px and avoid Safari's focus-zoom.
if (typeof document !== "undefined") {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua))) {
    document.documentElement.classList.add("ios");
  }
}

const baseTheme = {
  primaryShade: 9 as const,
  focusRing: "never" as const,
  cursorType: "pointer" as const,
  fontWeights: {
    medium: "500" as const,
  },
};

/** Shows a persistent retry notification for a failed startup resource. */
function showResourceRetry(id: string, title: string, error: unknown, retry: () => void) {
  notifications.hide(id);
  notifications.show({
    id,
    title,
    color: "red",
    autoClose: false,
    message: (
      <>
        <Text size="sm">{error instanceof Error ? error.message : String(error)}</Text>
        <Button
          size="xs"
          variant="light"
          color="red"
          mt="xs"
          onClick={() => {
            notifications.hide(id);
            retry();
          }}
        >
          重试
        </Button>
      </>
    ),
  });
}

/** Runs a startup resource load and leaves a persistent retry action after failures. */
function loadResourceWithRetry(id: string, title: string, load: () => Promise<void>) {
  const run = () => {
    void load()
      .then(() => notifications.hide(id))
      .catch((error: unknown) => showResourceRetry(id, title, error, run));
  };
  run();
}

function setLocalStorageItemBestEffort(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const pageContext = usePageContext();
  const {
    config,
    isLoading: isSiteConfigLoading,
    error: siteConfigError,
    refetch: refetchSiteConfig,
  } = useSiteConfig();
  const { error: userTokenError } = useUserToken();
  const { toggle, fullscreen } = useFullscreenDocument();
  const [themeColor] = useThemeColor();
  const theme = useMemo(
    () =>
      createTheme({
        ...baseTheme,
        primaryColor: themeColor,
        activeClassName: classes.active,
      }),
    [themeColor],
  );
  const [opened, setOpened] = useState(
    typeof window !== "undefined" ? window.innerWidth > NAVBAR_BREAKPOINT : false,
  );
  const viewport = useRef<HTMLDivElement>(null);

  useVersionChecker();

  const ref = useRef<HTMLDivElement>(null);
  const { onTouchStart, onTouchEnd } = useTouchEvents(ref as React.RefObject<HTMLDivElement>);
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

  const toggleNavbarOpened = () => {
    if (window.innerWidth <= NAVBAR_BREAKPOINT) setOpened(!opened);
  };

  useEffect(() => {
    const handleResize = () => {
      setOpened(window.innerWidth > NAVBAR_BREAKPOINT);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const [fetchSongList] = useSongListStore(useShallow((state) => [state.fetchSongList]));
  const [fetchAliasList] = useAliasListStore(useShallow((state) => [state.fetchAliasList]));

  useEffect(() => {
    if (userTokenError) {
      Sentry.setUser(null);
      logout();

      if (pageContext.urlPathname !== "/login") {
        const redirect = encodeURIComponent(
          window.location.pathname + window.location.search + window.location.hash,
        );
        navigate(`/login?redirect=${redirect}`, {
          overwriteLastHistoryEntry: true,
        });
      }
    }
  }, [userTokenError]);

  useEffect(() => {
    if (viewport.current) {
      viewport.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [pageContext.urlPathname]);

  useEffect(() => {
    if (!siteConfigError) {
      notifications.hide("site-config-load-error");
      return;
    }
    showResourceRetry("site-config-load-error", "获取站点配置失败", siteConfigError, () => {
      void refetchSiteConfig();
    });
  }, [refetchSiteConfig, siteConfigError]);

  useEffect(() => {
    if (isSiteConfigLoading || !config) return;

    setLocalStorageItemBestEffort(
      "maimai_version",
      (config.resource_version.maimai || 25500).toString(),
    );
    setLocalStorageItemBestEffort(
      "chunithm_version",
      (config.resource_version.chunithm || 23000).toString(),
    );

    loadResourceWithRetry("song-list-load-error", "获取曲目数据失败", () =>
      fetchSongList(config.resource_hashes),
    );
    loadResourceWithRetry("alias-list-load-error", "获取别名数据失败", fetchAliasList);
  }, [config, fetchAliasList, fetchSongList, isSiteConfigLoading]);

  return (
    <HelmetProvider>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <ErrorBoundary FallbackComponent={Fallback}>
          <ModalsProvider labels={{ confirm: "确定", cancel: "取消" }}>
            <ManagedModalsBackGuard />
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
                    <ActionIcon
                      variant="transparent"
                      size={44}
                      onClick={() => onRotate(rotate + 90)}
                    >
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
              <Shell
                navbarOpened={opened}
                onNavbarToggle={toggleNavbarOpened}
                viewportRef={viewport as React.RefObject<HTMLDivElement>}
              >
                <div
                  ref={ref}
                  style={{
                    minHeight: "calc(100vh - var(--header-height))",
                  }}
                >
                  <Suspense
                    fallback={
                      <Group justify="center" p={rem(80)}>
                        <Loader type="dots" size="xl" />
                      </Group>
                    }
                  >
                    <ErrorBoundary FallbackComponent={Fallback}>{children}</ErrorBoundary>
                  </Suspense>
                </div>
              </Shell>
            </PhotoProvider>
          </ModalsProvider>
        </ErrorBoundary>
      </MantineProvider>
    </HelmetProvider>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <LayoutInner>{children}</LayoutInner>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
