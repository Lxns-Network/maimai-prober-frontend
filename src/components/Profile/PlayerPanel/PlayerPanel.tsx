import { Divider, Group, ScrollArea, Text, UnstyledButton, UnstyledButtonProps } from "@mantine/core";
import { useState } from "react";
import { useViewportSize } from "@mantine/hooks";
import classes from "./PlayerPanel.module.css"
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { PlayerModal } from "./PlayerModal.tsx";
import { MaimaiPlayerContent } from "./maimai/PlayerContent.tsx";
import { ChunithmPlayerContent } from "./chunithm/PlayerContent.tsx";
import { isChunithmPlayerProps, isMaimaiPlayerProps } from "@/utils/api/player.ts";
import useGame from "@/hooks/useGame.ts";

const examplePlayer = {
  maimai: {
    name: "ｍａｉｍａｉ",
    rating: 0,
    friend_code: 888888888888888,
    trophy: {
      "name": "欢迎来到“舞萌DX”！",
      "color": "Normal"
    },
    course_rank: 0,
    class_rank: 0,
    star: 0,
    icon: {
      id: 1,
      name: ""
    },
    upload_time: "2024-01-01T08:00:00Z"
  },
  chunithm: {
    name: "ＣＨＵＮＩＴＨＭ",
    level: 1,
    rating: 0,
    friend_code: 888888888888888,
    class_emblem: {
      base: 0,
      medal: 0
    },
    reborn_count: 0,
    over_power: 0,
    over_power_progress: 0,
    currency: 0,
    total_currency: 0,
    trophy: {
      name: "NEW COMER",
      color: "normal"
    },
    character: {
      id: 0,
      name: ""
    },
    upload_time: "2024-01-01T08:00:00Z"
  },
}

interface PlayerButtonProps {
  player: MaimaiPlayerProps | ChunithmPlayerProps;
  onClick?: () => void;
}

const PlayerButton = ({ player, onClick, ...others }: PlayerButtonProps & UnstyledButtonProps) => {
  return (
    <UnstyledButton className={classes.playerButton} onClick={onClick} {...others}>
      {isMaimaiPlayerProps(player) && <MaimaiPlayerContent player={player} />}
      {isChunithmPlayerProps(player) && <ChunithmPlayerContent player={player} />}
    </UnstyledButton>
  );
}

export const PlayerPanel = ({ player }: { player?: MaimaiPlayerProps | ChunithmPlayerProps }) => {
  const { width } = useViewportSize();
  const [game] = useGame();
  const [opened, setOpened] = useState(false);

  if (!player) player = examplePlayer[game];

  return (
    <>
      <PlayerModal game={game} player={player} opened={opened} onClose={() => setOpened(false)} />
      <ScrollArea maw={width < 768 ? width - 34 : 768} >
        <PlayerButton player={player} onClick={() => setOpened(true)} />
      </ScrollArea>
      <Divider />
      <div className={classes.section}>
        <Group>
          <Text fz="xs" c="dimmed">好友码</Text>
          <Text fz="sm">{player.friend_code}</Text>
        </Group>
        <Group mt="xs">
          <Text fz="xs" c="dimmed">上次同步时间</Text>
          <Text fz="sm">{(new Date(Date.parse(player.upload_time))).toLocaleString()}</Text>
        </Group>
      </div>
    </>
  )
}