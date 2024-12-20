import { Button, Card, Overlay, Stack, Text, useComputedColorScheme } from "@mantine/core";
import { PlayerPanelSkeleton } from "./PlayerPanel/Skeleton.tsx";
import { useNavigate } from "react-router-dom";
import classes from "./Profile.module.css";
import { usePlayer } from "@/hooks/swr/usePlayer.ts";
import { PlayerPanel } from "./PlayerPanel/PlayerPanel.tsx";
import useGame from "@/hooks/useGame.ts";

export const PlayerSection = () => {
  const [game] = useGame();
  const { player, isLoading } = usePlayer(game);
  const computedColorScheme = useComputedColorScheme('light');
  const navigate = useNavigate();

  return (
    <Card className={classes.card} withBorder radius="md" p={0}>
      {isLoading ? (
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
          <PlayerPanel player={player} />
        </Card>
      )}
    </Card>
  )
}
