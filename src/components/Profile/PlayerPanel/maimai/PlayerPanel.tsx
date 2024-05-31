import { Divider, Group, ScrollArea, Text } from "@mantine/core";
import { PlayerButton } from "./PlayerButton.tsx";
import { PlayerModal } from "./PlayerModal.tsx";
import { useState } from "react";
import { useViewportSize } from "@mantine/hooks";
import classes from "../PlayerPanel.module.css"

interface CollectionProps {
  id: number;
  name: string;
}

export interface MaimaiPlayerProps {
  name: string;
  rating: number;
  friend_code: number;
  trophy?: {
    name: string;
    color: string;
  };
  course_rank: number;
  class_rank: number;
  star: number;
  icon?: CollectionProps;
  name_plate?: CollectionProps;
  frame?: CollectionProps;
  upload_time: string;
}

const examplePlayer: MaimaiPlayerProps = {
  "name": "ｍａｉｍａｉ",
  "rating": 0,
  "friend_code": 888888888888888,
  "trophy": {
    "name": "欢迎来到“舞萌DX”！",
    "color": "Normal"
  },
  "course_rank": 0,
  "class_rank": 0,
  "star": 0,
  "icon": {
    "id": 1,
    "name": ""
  },
  "upload_time": "2024-01-01T08:00:00Z"
};

export const MaimaiPlayerPanel = ({ player }: { player: MaimaiPlayerProps }) => {
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