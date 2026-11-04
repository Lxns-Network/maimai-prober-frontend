import { Text, DataList } from "@mantine/core";
import { useState } from "react";
import { ChunithmPlayerProps, MaimaiPlayerProps } from "@/types/player";
import { PlayerModal } from "./PlayerModal.tsx";
import { PlayerCard } from "./PlayerCard.tsx";
import useGame from "@/hooks/useGame.ts";
import { formatDateTime } from "@/utils/time.ts";

const examplePlayer = {
  maimai: {
    name: "ｍａｉｍａｉ",
    rating: 0,
    friend_code: 888888888888888,
    trophy: {
      name: "欢迎来到“舞萌DX”！",
      color: "Normal",
    },
    course_rank: 0,
    class_rank: 0,
    star: 0,
    icon: {
      id: 1,
      name: "",
    },
    upload_time: "2024-01-01T08:00:00Z",
  },
  chunithm: {
    name: "ＣＨＵＮＩＴＨＭ",
    level: 1,
    rating: 0,
    friend_code: 888888888888888,
    class_emblem: {
      base: 0,
      medal: 0,
    },
    reborn_count: 0,
    over_power: 0,
    over_power_progress: 0,
    currency: 0,
    total_currency: 0,
    trophy: {
      name: "NEW COMER",
      color: "normal",
    },
    character: {
      id: 0,
      name: "",
    },
    upload_time: "2024-01-01T08:00:00Z",
  },
};

export const PlayerPanel = ({ player }: { player?: MaimaiPlayerProps | ChunithmPlayerProps }) => {
  const [game] = useGame();
  const [opened, setOpened] = useState(false);

  if (!player) player = examplePlayer[game];

  return (
    <>
      <PlayerModal game={game} player={player} opened={opened} onClose={() => setOpened(false)} />
      <PlayerCard player={player} onClick={() => setOpened(true)}>
        <DataList.Item>
          <DataList.ItemLabel>好友码</DataList.ItemLabel>
          <DataList.ItemValue>
            <Text fz="sm">{player.friend_code}</Text>
          </DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel>上次同步时间</DataList.ItemLabel>
          <DataList.ItemValue>
            <Text fz="sm">{formatDateTime(player.upload_time)}</Text>
          </DataList.ItemValue>
        </DataList.Item>
      </PlayerCard>
    </>
  );
};
