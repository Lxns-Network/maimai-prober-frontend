import {
  Group,
  Burger,
  ActionIcon,
  useMantineColorScheme, Tooltip, Menu, UnstyledButton, Text
} from '@mantine/core';
import Logo from "./Logo";
import { IconChevronDown, IconMoonStars, IconSun, IconSunMoon } from "@tabler/icons-react";
import classes from './Header.module.css';
import { HEADER_HEIGHT } from "../../../App";
import { useLocalStorage } from "@mantine/hooks";

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

const games = [{
  id: 'maimai',
  name: '舞萌 DX',
  version: 24000
}, {
  id: 'chunithm',
  name: '中二节奏',
  version: 20500
}]

export default function Header({ navbarOpened, onNavbarToggle }: HeaderProps) {
  const [game, setGame] = useLocalStorage<'maimai' | 'chunithm'>({ key: 'game', defaultValue: 'maimai' });

  return (
    <div className={classes.header}>
      <Group wrap="nowrap" h={HEADER_HEIGHT}>
        <Burger className={classes.navbarToggle} opened={navbarOpened} onClick={onNavbarToggle} size="sm" />
        <Group style={{ flex: 1 }} gap="sm">
          <Logo />
          <Menu width={180} withinPortal={false}>
            <Menu.Target>
              <UnstyledButton className={classes.game}>
                <Text fz={14}>
                  {games.find((item) => item.id === game)?.name}
                </Text>
                <IconChevronDown className={classes.gameChevron} stroke={1.5} />
              </UnstyledButton>
            </Menu.Target>

            <Menu.Dropdown>
              {games.map((item) => (
                <Menu.Item key={item.id} onClick={() => setGame(item.id as 'maimai' | 'chunithm')}>
                  {item.name}{' '}
                  <Text span c="dimmed" fz="xs">
                    ({item.version})
                  </Text>
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>
        <ColorSchemeToggle />
      </Group>
    </div>
  );
}