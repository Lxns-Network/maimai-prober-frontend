import {
  Group,
  Burger,
  ActionIcon,
  useMantineColorScheme,
} from '@mantine/core';
import Logo from "./Logo";
import { IconMoonStars, IconSun } from "@tabler/icons-react";
import classes from './Header.module.css';

export function ActionToggle() {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();

  return (
    <Group justify="center">
      <ActionIcon className={classes.actionIcon} variant="light" size="lg" onClick={() => toggleColorScheme()}>
        {colorScheme === 'dark' ? <IconSun /> : <IconMoonStars />}
      </ActionIcon>
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