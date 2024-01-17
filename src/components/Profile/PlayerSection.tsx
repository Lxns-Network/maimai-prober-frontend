import {
  Button,
  Card,
  createStyles, Overlay,
  rem, Stack,
  Tabs, Text, useMantineTheme,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { getPlayerDetail } from "../../utils/api/player.tsx";
import { MaimaiPlayerPanel } from "./PlayerPanel/maimai/PlayerPanel.tsx";
import { ChunithmPlayerPanel } from "./PlayerPanel/chunithm/PlayerPanel.tsx";
import { PlayerPanelSkeleton } from "./PlayerPanel/Skeleton.tsx";
import {useNavigate} from "react-router-dom";

export const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  section: {
    padding: theme.spacing.md,
  },
}));

export const PlayerSection = () => {
  const { classes } = useStyles();
  const [player, setPlayer] = useState<any>(null);
  const [fetching, setFetching] = useState(true);
  const [game, setGame] = useLocalStorage({ key: 'game' })
  const navigate = useNavigate();
  const theme = useMantineTheme();

  const fetchPlayerData = async () => {
    try {
      const res = await getPlayerDetail(game);
      const data = await res.json();
      if (data.code !== 200) {
        setPlayer(null);
      } else {
        setPlayer(data.data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!game) return;

    fetchPlayerData();
  }, [game]);

  return (
    <Card withBorder radius="md" className={classes.card} mb="md" p={0}>
      <Tabs unstyled value={game} onTabChange={(value) => {
        if (value === game) return;

        setFetching(true);
        setGame(value as string);
      }} styles={(theme) => ({
        tab: {
          ...theme.fn.focusStyles(),
          backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
          color: theme.colorScheme === 'dark' ? theme.colors.dark[0] : theme.colors.gray[9],
          border: 0,
          borderTop: `${rem(1)} solid ${theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[4]}`,
          padding: `${theme.spacing.xs} ${theme.spacing.md}`,
          cursor: 'pointer',
          fontSize: theme.fontSizes.sm,
          flex: 1,

          '&:hover': {
            backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[1],
          },

          '&[data-active]': {
            backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
            color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
          },
        },

        tabsList: {
          display: 'flex',
        },
      })}>
        <Tabs.Panel value="maimai">
          {fetching ? (
            <PlayerPanelSkeleton />
          ) : (
            <Card p={0} radius={0}>
              {!player && (
                <Overlay color={
                  theme.colorScheme === 'dark' ? "#000" : "#FFF"
                } blur={5} center zIndex={1}>
                  <Stack>
                    <Text>尚未同步游戏数据</Text>
                    <Button variant="outline" onClick={() => navigate("/user/sync")}>
                      同步数据
                    </Button>
                  </Stack>
                </Overlay>
              )}
              <MaimaiPlayerPanel player={player} />
            </Card>
          )}
        </Tabs.Panel>
        <Tabs.Panel value="chunithm">
          {fetching ? (
            <PlayerPanelSkeleton />
          ) : (
            <Card p={0} radius={0}>
              {!player && (
                <Overlay color={
                  theme.colorScheme === 'dark' ? "#000" : "#FFF"
                } blur={5} center zIndex={1}>
                  <Stack>
                    <Text>尚未同步游戏数据</Text>
                    <Button variant="outline" onClick={() => navigate("/user/sync")}>
                      同步数据
                    </Button>
                  </Stack>
                </Overlay>
              )}
              <ChunithmPlayerPanel player={player} />
            </Card>
          )}
        </Tabs.Panel>
        <Tabs.List>
          <Tabs.Tab value="maimai">舞萌 DX</Tabs.Tab>
          <Tabs.Tab value="chunithm">中二节奏</Tabs.Tab>
        </Tabs.List>
      </Tabs>
    </Card>
  )
}
