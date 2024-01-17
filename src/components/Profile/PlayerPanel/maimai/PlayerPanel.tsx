import { Divider, Group, ScrollArea, Text } from "@mantine/core";
import { useStyles } from "../../PlayerSection.tsx";
import { PlayerButton } from "./PlayerButton.tsx";
import { PlayerModal } from "./PlayerModal.tsx";
import { useState } from "react";
import { useViewportSize } from "@mantine/hooks";

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
  name_plate?: CollectionProps;
  frame?: CollectionProps;
  icon_url: string;
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
  "icon_url": "https://maimai.wahlap.com/maimai-mobile/img/Icon/df44b1de570dfba8.png",
  "upload_time": "2024-01-01T08:00:00Z"
};

export const MaimaiPlayerPanel = ({ player }: { player: MaimaiPlayerProps }) => {
  const { classes } = useStyles();
  const { width } = useViewportSize();
  const [opened, setOpened] = useState(false);

  if (!player) player =  examplePlayer;

  return (
    <>
      <PlayerModal player={player} opened={opened} onClose={() => setOpened(false)} />
      <ScrollArea maw={width < 768 ? width - 33 : 768} >
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