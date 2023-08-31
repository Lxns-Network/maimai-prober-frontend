import { Route, Routes } from "react-router-dom";
import {
  ScrollArea,
  createStyles,
  MantineProvider,
  ColorScheme,
  ColorSchemeProvider,
  rem
} from '@mantine/core';
import { useLocalStorage, useDisclosure } from '@mantine/hooks';
import Navbar from "./components/Layout/Navbar";
import Header from "./components/Layout/Header";
import Home from "./components/Home";
import NotFound from "./components/NotFound";
import Login from "./components/Login";

export const NAVBAR_WIDTH = 300;
export const NAVBAR_BREAKPOINT = 800;

const THEME_KEY = 'mantine-color-scheme';

const useStyles = createStyles((theme) => ({
  routesWrapper: {
    position: 'relative',
    boxSizing: 'border-box',
    paddingLeft: NAVBAR_WIDTH,
    paddingTop: rem(56),

    [theme.fn.smallerThan(NAVBAR_BREAKPOINT+1)]: {
      paddingLeft: 0,
    }
  }
}));

export default function App() {
  const { classes } = useStyles();
  const [opened, { toggle }] = useDisclosure(false);

  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: THEME_KEY,
    defaultValue: 'light',
    getInitialValueInEffect: true,
  });

  const toggleColorScheme = (value?: ColorScheme) =>
    setColorScheme(value || (colorScheme === 'dark' ? 'light' : 'dark'));

  return (
    <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={toggleColorScheme}>
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        theme={{ colorScheme }}
      >
        <Navbar opened={opened} onClose={toggle} />
        <Header navbarOpened={opened} onNavbarToggle={toggle} />
        <ScrollArea h="100vh" type="scroll" className={classes.routesWrapper}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ScrollArea>
      </MantineProvider>
    </ColorSchemeProvider>
  );
}