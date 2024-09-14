import {
  Button,
  Card,
  Overlay,
  Stack,
  Text, useComputedColorScheme
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { getPlayerDetail } from "../../utils/api/player.tsx";
import { MaimaiPlayerPanel } from "./PlayerPanel/maimai/PlayerPanel.tsx";
import { ChunithmPlayerPanel } from "./PlayerPanel/chunithm/PlayerPanel.tsx";
import { PlayerPanelSkeleton } from "./PlayerPanel/Skeleton.tsx";
import { useNavigate } from "react-router-dom";
import classes from "./Profile.module.css";
import { openRetryModal } from "../../utils/modal.tsx";

export const PlayerSection = () => {
  const [player, setPlayer] = useState<any>(null);
  const [fetching, setFetching] = useState(true);
  const [game] = useLocalStorage({ key: 'game' })
  const computedColorScheme = useComputedColorScheme('light');
  const navigate = useNavigate();

  const fetchPlayerData = async () => {
    try {
      const res = await getPlayerDetail(game);
      const data = await res.json();
      if (!data.success) {
        if (data.code === 404) {
          setPlayer(null);
          return;
        }
        throw new Error(data.message);
      }
      setPlayer(data.data);
    } catch (error) {
      openRetryModal("获取玩家数据失败", `${error}`, () => fetchPlayerData())
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!game) return;

    setFetching(true);
    setPlayer(null);
    fetchPlayerData();
  }, [game]);

  return (
    <Card className={classes.card} withBorder radius="md" p={0}>
      {fetching ? (
        <PlayerPanelSkeleton />
      ) : (
        <Card className={classes.card} p={0} radius={0}>
          {!player && (
            <Overlay color={
              computedColorScheme === 'dark' ? "#000" : "#FFF"
            } blur={5} center zIndex={1}>
              <Stack>
                <Text>尚未同步游戏数据</Text>
                <Button variant="outline" onClick={() => navigate("/user/sync")}>
                  同步数据
                </Button>
              </Stack>
            </Overlay>
          )}
          {game === "maimai" && <MaimaiPlayerPanel player={player} />}
          {game === "chunithm" && <ChunithmPlayerPanel player={player} />}
        </Card>
      )}
    </Card>
  )
}
