import {
  Button,
  Card,
  Overlay,
  Stack,
  Tabs, Text, useMantineColorScheme
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { getPlayerDetail } from "../../utils/api/player.tsx";
import { MaimaiPlayerPanel } from "./PlayerPanel/maimai/PlayerPanel.tsx";
import { ChunithmPlayerPanel } from "./PlayerPanel/chunithm/PlayerPanel.tsx";
import { PlayerPanelSkeleton } from "./PlayerPanel/Skeleton.tsx";
import { useNavigate } from "react-router-dom";
import classes from "./Profile.module.css";

export const PlayerSection = () => {
  const { colorScheme } = useMantineColorScheme();
  const [player, setPlayer] = useState<any>(null);
  const [fetching, setFetching] = useState(true);
  const [game, setGame] = useLocalStorage({ key: 'game' })
  const navigate = useNavigate();

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
    <Card className={classes.card} withBorder radius="md" mb="md" p={0}>
      <Tabs unstyled value={game} onChange={(value) => {
        setFetching(true);
        setGame(value as string);
      }} classNames={classes}>
        <Tabs.Panel value="maimai">
          {fetching ? (
            <PlayerPanelSkeleton />
          ) : (
            <Card className={classes.card} p={0} radius={0}>
              {!player && (
                <Overlay color={
                  colorScheme === 'dark' ? "#000" : "#FFF"
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
            <Card className={classes.card} p={0} radius={0}>
              {!player && (
                <Overlay color={
                  colorScheme === 'dark' ? "#000" : "#FFF"
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
