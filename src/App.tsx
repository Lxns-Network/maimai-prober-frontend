import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ScrollArea,
  MantineProvider,
  rem,
  Transition,
  Loader,
  Group, createTheme, Overlay
} from '@mantine/core';
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import { isTokenUndefined, logout } from "./utils/session";
import { refreshToken } from "./utils/api/user";
import RouterTransition from "./components/RouterTransition";
import Navbar from "./components/Navbar";
import Header from "./components/Header";
import classes from "./App.module.css";

import { ErrorBoundary } from "react-error-boundary";
import { Fallback } from "./pages/public/Fallback.tsx";

const theme = createTheme({
  focusRing: 'never',
  cursorType: 'pointer',
});

export const NAVBAR_BREAKPOINT = 992;
export const ApiContext = React.createContext({});

export default function App() {
  const [opened, setOpened] = useState(window.innerWidth > NAVBAR_BREAKPOINT);
  const navigate = useNavigate();
  const location = useLocation();
  const viewport = useRef<HTMLDivElement>(null);

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
          navigate('/login', { state: { expired: true } });
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

  const value = useMemo(() => ({}), []);

  return (
    <ApiContext.Provider value={value}>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <ErrorBoundary FallbackComponent={Fallback}>
          <ModalsProvider labels={{ confirm: '确定', cancel: '取消' }}>
            <Notifications />
            <RouterTransition />
            <Transition mounted={opened} transition="slide-right" duration={300} timingFunction="ease">
              {(styles) => <Navbar style={styles} onClose={toggleNavbarOpened} />}
            </Transition>
            <Header navbarOpened={opened} onNavbarToggle={toggleNavbarOpened} />
            <ScrollArea className={classes.routesWrapper} style={{
              height: 'calc(100vh - 56px)',
              paddingLeft: window.innerWidth > NAVBAR_BREAKPOINT ? rem(300) : 0,
            }} type="scroll" viewportRef={viewport}>
              <Transition mounted={opened && window.innerWidth <= NAVBAR_BREAKPOINT} transition="fade" duration={300} timingFunction="ease">
                {(styles) => <Overlay color="#000" style={styles} onClick={toggleNavbarOpened} zIndex={100} />}
              </Transition>
              <Suspense fallback={(
                <Group justify="center" p={rem(80)}>
                  <Loader type="dots" size="xl" />
                </Group>
              )}>
                <ErrorBoundary FallbackComponent={Fallback}>
                  <Outlet />
                </ErrorBoundary>
              </Suspense>
            </ScrollArea>
          </ModalsProvider>
        </ErrorBoundary>
      </MantineProvider>
    </ApiContext.Provider>
  );
}