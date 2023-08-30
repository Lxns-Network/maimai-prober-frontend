import { useState } from "react";
import { Route, Routes, useNavigate } from "react-router-dom";
import {
  Navbar,
  Group,
  ActionIcon,
  ScrollArea,
  createStyles,
  getStylesRef,
  MantineProvider,
  ColorScheme,
  ColorSchemeProvider,
  useMantineColorScheme,
  rem,
} from '@mantine/core';
import {
  IconHome,
  IconSettings,
  IconInfoCircle,
  IconLogout,
  IconChartBar,
  IconMoonStars,
  IconSun,
} from '@tabler/icons-react';
import { useLocalStorage } from '@mantine/hooks';
import Home from "./components/Home";
import NotFound from "./components/NotFound";
import Login from "./components/Login";

export const NAVBAR_WIDTH = 300;

const THEME_KEY = 'mantine-color-scheme';

const useStyles = createStyles((theme) => ({
  header: {
    paddingBottom: theme.spacing.md,
    marginBottom: `calc(${theme.spacing.md} * 1.5)`,
    borderBottom: `${rem(1)} solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
    }`,
  },

  footer: {
    paddingTop: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderTop: `${rem(1)} solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
    }`,
  },

  link: {
    ...theme.fn.focusStyles(),
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
    fontSize: theme.fontSizes.sm,
    color: theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[7],
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.radius.sm,
    fontWeight: 500,

    '&:hover': {
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
      color: theme.colorScheme === 'dark' ? theme.white : theme.black,

      [`& .${getStylesRef('icon')}`]: {
        color: theme.colorScheme === 'dark' ? theme.white : theme.black,
      },
    },
  },

  linkIcon: {
    ref: getStylesRef('icon'),
    color: theme.colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6],
    marginRight: theme.spacing.sm,
  },

  linkActive: {
    '&, &:hover': {
      backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
      color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
      [`& .${getStylesRef('icon')}`]: {
        color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
      },
    },
  },

  routesWrapper: {
    position: 'relative',
    boxSizing: 'border-box',
    width: `calc(100vw - ${rem(NAVBAR_WIDTH)})`,
  }
}));

function Logo() {
  return (
    <div id="logo">
      <img alt="logo" src="/favicon.ico" width={24} height={24} />
      <span style={{ marginLeft: 12, fontSize: 18, fontWeight: 700 }}>maimai DX 查分器</span>
    </div>
  );
}

export function ActionToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <Group position="center">
      <ActionIcon
        onClick={() => toggleColorScheme()}
        size="lg"
        sx={(theme) => ({
          backgroundColor:
            theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
          color: theme.colorScheme === 'dark' ? theme.colors.yellow[4] : theme.colors.blue[6],
        })}
      >
        {colorScheme === 'dark' ? <IconSun size="1.2rem" /> : <IconMoonStars size="1.2rem" />}
      </ActionIcon>
    </Group>
  );
}

export default function App() {
  const { classes, cx } = useStyles();
  const [active, setActive] = useState('首页');
  const navigate = useNavigate();

  const [colorScheme, setColorScheme] = useLocalStorage<ColorScheme>({
    key: THEME_KEY,
    defaultValue: 'light',
    getInitialValueInEffect: true,
  });

  const toggleColorScheme = (value?: ColorScheme) =>
    setColorScheme(value || (colorScheme === 'dark' ? 'light' : 'dark'));

  const navbarData = [
    { label: '首页', icon: IconHome, to: '/' },
    { label: '我的成绩', icon: IconChartBar, to: '/scores' },
    { label: '设置', icon: IconSettings, to: '/settings' },
  ];

  const links = navbarData.map((item) => (
    <a
      className={cx(classes.link, { [classes.linkActive]: item.label === active })}
      href={item.to}
      key={item.label}
      onClick={(event) => {
        event.preventDefault();
        setActive(item.label);
        navigate(item.to);
      }}
    >
      <item.icon className={classes.linkIcon} stroke={1.5} />
      <span>{item.label}</span>
    </a>
  ));

  return (
    <ColorSchemeProvider colorScheme={colorScheme} toggleColorScheme={toggleColorScheme}>
      <MantineProvider
        withGlobalStyles
        withNormalizeCSS
        theme={{ colorScheme }}
      >
        <Navbar width={{ sm: NAVBAR_WIDTH }} p="md">
          <ScrollArea h="100vh" type="scroll">
            <Navbar.Section grow>
              <Group className={classes.header} position="apart" mb={18}>
                <Logo />
                <ActionToggle />
              </Group>
              {links}
            </Navbar.Section>

            <Navbar.Section className={classes.footer} mt={18}>
              <a href="#" className={classes.link} onClick={(event) => event.preventDefault()}>
                <IconInfoCircle className={classes.linkIcon} stroke={1.5} />
                <span>关于 maimai DX 查分器</span>
              </a>

              <a href="#" className={classes.link} onClick={(event) => event.preventDefault()}>
                <IconLogout className={classes.linkIcon} stroke={1.5} />
                <span>登出</span>
              </a>
            </Navbar.Section>
          </ScrollArea>
        </Navbar>
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