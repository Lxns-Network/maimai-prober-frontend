import React, { Suspense, useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import {
  ScrollArea,
  createStyles,
  MantineProvider,
  ColorScheme,
  ColorSchemeProvider,
  rem,
  Transition,
  Loader,
  Group
} from '@mantine/core';
import { Notifications } from "@mantine/notifications";
import { useLocalStorage } from '@mantine/hooks';
import { refreshToken } from "./utils/api/user";
import { logout } from "./utils/session";
import Navbar from "./components/Navbar";
import Header from "./components/Header";
import RouterTransition from "./components/RouterTransition";

export const NAVBAR_WIDTH = 300;
export const NAVBAR_BREAKPOINT = 800;

const THEME_KEY = 'theme';

const useStyles = createStyles((theme) => ({
  routesWrapper: {
    position: 'relative',
    boxSizing: 'border-box',
    paddingLeft: NAVBAR_WIDTH,
    marginTop: rem(56),

    [theme.fn.smallerThan(NAVBAR_BREAKPOINT+1)]: {
      paddingLeft: 0,
    }
  }
}));

export const ApiContext = React.createContext({});

export default function App() {
  const { classes } = useStyles();
  const [opened, setOpened] = useState(window.innerWidth > NAVBAR_BREAKPOINT);
  const navigate = useNavigate();

  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: THEME_KEY,
    defaultValue: 'light',
    getInitialValueInEffect: true,
  });

  const handleResize = () => {
    setOpened(window.innerWidth > NAVBAR_BREAKPOINT);
  };

  useEffect(() => {
    if (localStorage.getItem("token")) {
      // 进入页面时刷新一次 token，不论有效期
      refreshToken().catch(() => {
        logout();
        navigate("/login", { state: { expired: true } });
      });
    }

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const toggleNavbarOpened = () => {
    if (window.innerWidth <= NAVBAR_BREAKPOINT) setOpened(!opened);
  };

  const toggleColorScheme = (value?: ColorScheme) =>
    setColorScheme(value || (colorScheme === 'dark' ? 'light' : 'dark'));

  const value = useMemo(() => ({}), []);

  return (
    <ApiContext.Provider value={value}>
      <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={toggleColorScheme}>
        <MantineProvider
          withGlobalStyles
          withNormalizeCSS
          theme={{ colorScheme }}
        >
          <Notifications />
          <RouterTransition />
          <Transition mounted={opened} transition="slide-right" duration={300} timingFunction="ease">
            {(styles) => <Navbar style={styles} onClose={toggleNavbarOpened} />}
          </Transition>
          <Header navbarOpened={opened} onNavbarToggle={toggleNavbarOpened} />
          <ScrollArea style={{ height: 'calc(100vh - 56px)' }} type="scroll" className={classes.routesWrapper}>
            <Suspense fallback={(
              <Group position="center" p={rem(80)}>
                <Loader variant="dots" size="xl" />
              </Group>
            )}>
              <Outlet />
            </Suspense>
          </ScrollArea>
        </MantineProvider>
      </ColorSchemeProvider>
    </ApiContext.Provider>
  );
}