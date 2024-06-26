import { Divider, Group, ScrollArea, Text } from "@mantine/core";
import { PlayerButton } from "./PlayerButton.tsx";
import { useViewportSize } from "@mantine/hooks";
import { useState } from "react";
import { PlayerModal } from "./PlayerModal.tsx";
import classes from "../PlayerPanel.module.css"

interface CollectionProps {
  id: number;
  name: string;
}

export interface ChunithmPlayerProps {
  name: string;
  rating: number;
  friend_code: number;
  trophy: {
    name: string;
    color: string;
  };
  over_power: number;
  over_power_progress: number;
  currency: number;
  total_currency: number;
  character?: CollectionProps;
  name_plate?: CollectionProps;
  map_icon?: CollectionProps;
  upload_time: string;
}

const examplePlayer: ChunithmPlayerProps = {
  "name": "ＣＨＵＮＩＴＨＭ",
  "rating": 0,
  "friend_code": 888888888888888,
  "over_power": 0,
  "over_power_progress": 0,
  "currency": 0,
  "total_currency": 0,
  "trophy": {
    "name": "NEW COMER",
    "color": "normal"
  },
  "character": {
    "id": 0,
    "name": ""
  },
  "upload_time": "2024-01-01T08:00:00Z"
};

export const ChunithmPlayerPanel = ({ player }: { player: ChunithmPlayerProps }) => {
  const { width } = useViewportSize();
  const [opened, setOpened] = useState(false);

  if (!player) player = examplePlayer;

  return (
    <>
      <PlayerModal player={player} opened={opened} onClose={() => setOpened(false)} />
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