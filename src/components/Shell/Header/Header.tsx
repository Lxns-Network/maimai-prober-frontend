import { Group, Burger, Menu, UnstyledButton, Text, Stack, Transition } from '@mantine/core';
import Logo from "./Logo";
import { IconChevronDown } from "@tabler/icons-react";
import classes from './Header.module.css';
import React from "react";
import { ColorSchemeToggle } from "./ColorSchemeToggle.tsx";
import { GameTabs } from "./GameTabs.tsx";
import { Game } from "@/types/game";
import useGame from "@/hooks/useGame.ts";
import { useSearchParams } from "react-router-dom";

interface HeaderProps {
  navbarOpened: boolean;
  onNavbarToggle(): void;
  gameTabsVisible: boolean;
  headerRef: React.RefObject<HTMLDivElement>;
}

const games = [{
  id: 'maimai',
  name: '舞萌 DX',
}, {
  id: 'chunithm',
  name: '中二节奏',
}]

const translateY = {
  in: { opacity: 1, bottom: 0, maxHeight: '32px' },
  out: { opacity: 0, bottom: '32px', maxHeight: 0 },
  common: { transformOrigin: 'top' },
  transitionProperty: 'opacity, bottom, max-height',
};

export default function Header({ navbarOpened, onNavbarToggle, gameTabsVisible, headerRef }: HeaderProps) {
  const [game, setGame] = useGame();
  const [_, setSearchParams] = useSearchParams();

  function handleGameChange(game: Game) {
    setSearchParams({});
    setGame(game);
  }

  return (
    <div className={classes.header} ref={headerRef}>
      <Stack gap={0}>
        <Group wrap="nowrap" mt={12} mb={12}>
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
                  <Menu.Item key={item.id} onClick={() => handleGameChange(item.id as Game)}>
                    {item.name}{' '}
                    <Text span c="dimmed" fz="xs">
                      ({localStorage.getItem(`${item.id}_version`)})
                    </Text>
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </Group>
          <ColorSchemeToggle />
        </Group>

        <Transition mounted={gameTabsVisible} transition={translateY} duration={300} timingFunction="ease">
          {(styles) => (
            <GameTabs
              tabs={games}
              activeTab={game}
              onTabChange={(tab) => handleGameChange(tab as Game)}
              style={styles}
            />
          )}
        </Transition>
      </Stack>
    </div>
  );
}