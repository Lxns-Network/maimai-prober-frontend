import { Route, Routes } from "react-router-dom";
import {
  ScrollArea,
  createStyles,
  MantineProvider,
  ColorScheme,
  ColorSchemeProvider,
  rem,
  Transition
} from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { useEffect, useState } from "react";
// Layouts
import Navbar from "./components/Navbar";
import Header from "./components/Header";
import RouterTransition from "./components/RouterTransition";
// Routes
import Home from "./pages/public/Home";
import Login from "./pages/public/Login";
import Scores from "./pages/private/Scores";
import Settings from "./pages/private/Settings";
import Register from "./pages/public/Register";
import NotFound from "./pages/public/NotFound";
import Sync from "./pages/private/Sync";

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

export default function App() {
  const { classes } = useStyles();
  const [opened, setOpened] = useState(window.innerWidth > NAVBAR_BREAKPOINT);

  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: THEME_KEY,
    defaultValue: 'light',
    getInitialValueInEffect: true,
  });

  useEffect(() => {
    const handleResize = () => {
      setOpened(window.innerWidth > NAVBAR_BREAKPOINT);
    };

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

  return (
    <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={toggleColorScheme}>
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        theme={{ colorScheme }}
      >
        <RouterTransition />
        <Transition mounted={opened} transition="slide-right" duration={300} timingFunction="ease">
          {(styles) => <Navbar style={styles} onClose={toggleNavbarOpened} />}
        </Transition>
        <Header navbarOpened={opened} onNavbarToggle={toggleNavbarOpened} />
        <ScrollArea style={{ height: 'calc(100vh - 56px)' }} type="scroll" className={classes.routesWrapper}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/profile" element={<Home />} />
            <Route path="/sync" element={<Sync />} />
            <Route path="/scores" element={<Scores />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ScrollArea>
      </MantineProvider>
    </ColorSchemeProvider>
  );
}