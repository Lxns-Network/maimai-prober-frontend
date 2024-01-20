import {
  Group,
  Burger,
  ActionIcon,
  useMantineColorScheme, Tooltip, useMantineTheme, useComputedColorScheme,
} from '@mantine/core';
import Logo from "./Logo";
import { IconMoonStars, IconSun, IconSunMoon } from "@tabler/icons-react";
import classes from './Header.module.css';
import { useEffect } from "react";
import { useToggle } from "@mantine/hooks";

export function ActionToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const [colorSchemeState, toggleColorSchemeState] = useToggle(['auto', 'dark', 'light'] as const);
  const computedColorScheme = useComputedColorScheme('light');
  const theme = useMantineTheme();

  useEffect(() => {
    toggleColorSchemeState(colorScheme);
  }, []);

  useEffect(() => {
    setColorScheme(colorSchemeState);
  }, [colorSchemeState]);

  return (
    <Group justify="center">
      <Tooltip label={colorSchemeState === 'auto' ? '跟随系统' : colorSchemeState === 'dark' ? '深色模式' : '浅色模式'} position="left">
        <ActionIcon variant="light" size="lg" onClick={() => toggleColorSchemeState()} color={
          colorSchemeState === 'auto' ? undefined : computedColorScheme === 'dark' ? theme.colors.blue[4] : theme.colors.yellow[6]
        }>
          {colorSchemeState === 'auto' ? <IconSunMoon /> : colorSchemeState === 'dark' ? <IconMoonStars /> : <IconSun />}
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
      <div className={classes.headerInner}>
        <Group wrap="nowrap">
          <Burger className={classes.navbarToggle} opened={navbarOpened} onClick={onNavbarToggle} size="sm" />
          <Logo />
        </Group>
        <Group>
          <ActionToggle />
        </Group>
      </div>
    </div>
  );
}