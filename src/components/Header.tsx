import {
  Group,
  Burger,
  ActionIcon,
  useMantineColorScheme, Tooltip
} from '@mantine/core';
import Logo from "./Logo";
import { IconMoonStars, IconSun, IconSunMoon } from "@tabler/icons-react";
import classes from './Header.module.css';
import { HEADER_HEIGHT } from "../App.tsx";

const colorSchemes = {
  auto: {
    icon: <IconSunMoon stroke={1.5} />,
    label: '跟随系统',
    color: 'blue'
  },
  dark: {
    icon: <IconMoonStars stroke={1.5} />,
    label: '深色模式',
    color: 'blue'
  },
  light: {
    icon: <IconSun stroke={1.5} />,
    label: '浅色模式',
    color: 'yellow'
  }
}

const ColorSchemeToggle = () => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <Group justify="center">
      <Tooltip label={colorSchemes[colorScheme].label} position="left">
        <ActionIcon variant="light" size="lg" onClick={() => setColorScheme(
          colorScheme === 'auto' ? 'dark' : colorScheme === 'dark' ? 'light' : 'auto'
        )} color={colorSchemes[colorScheme].color}>
          {colorSchemes[colorScheme].icon}
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}

interface HeaderProps {
  navbarOpened: boolean;
  onNavbarToggle(): void;
}

export default function Header({ navbarOpened, onNavbarToggle }: HeaderProps) {
  return (
    <div className={classes.header}>
      <Group wrap="nowrap" h={HEADER_HEIGHT}>
        <Burger className={classes.navbarToggle} opened={navbarOpened} onClick={onNavbarToggle} size="sm" />
        <div style={{ flex: 1 }}>
          <Logo />
        </div>
        <ColorSchemeToggle />
      </Group>
    </div>
  );
}