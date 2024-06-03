import {
  Badge,
  Center,
  Flex, Group,
  Space,
  Text, ThemeIcon, Tooltip,
  UnstyledButton,
  UnstyledButtonProps
} from "@mantine/core";
import { AliasProps } from "../../pages/alias/Vote.tsx";
import { IconCheck, IconChevronRight, IconNorthStar } from "@tabler/icons-react";
import classes from "./Alias.module.css";
import { useLocalStorage } from "@mantine/hooks";
import { useContext, useEffect, useState } from "react";
import { ApiContext } from "../../App.tsx";
import { MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";

export function AliasButton({ alias, onClick, ...others }: { alias: AliasProps, onClick?: () => void } & UnstyledButtonProps) {
  const [game] = useLocalStorage({ key: 'game' });
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps>();
  const context = useContext(ApiContext);

  useEffect(() => {
    setSong(context.songList.find(alias.song.id) || null);
  }, [alias.song.id]);

  return (
    <UnstyledButton className={classes.alias} onClick={onClick} {...others}>
      <Flex align="center" columnGap={8}>
        <Text fz="sm" c="dimmed" style={{ flex: 1 }} truncate>
          {alias.song.name || "未知"}
        </Text>
        {game === "maimai" && alias.song.id >= 100000 && (
          <Badge variant="filled" color="rgb(234, 61, 232)" size="sm">
            宴
          </Badge>
        )}
        {game === "chunithm" && alias.song.id >= 8000 && (
          <Badge variant="filled" color="rgb(14, 45, 56)" size="sm">
            {(song as ChunithmSongProps).difficulties[0].kanji}
          </Badge>
        )}
        {new Date(alias.upload_time).getTime() > new Date().getTime() - 86400000 && (
          <Center>
            <Tooltip label="新提交" withinPortal>
              <ThemeIcon color="yellow" size="xs" radius="xl" variant="light">
                <IconNorthStar />
              </ThemeIcon>
            </Tooltip>
            {alias.approved && (
              <Space w="xs" />
            )}
          </Center>
        )}
        {alias.approved && (
          <Center>
            <Tooltip label="已批准" withinPortal>
              <ThemeIcon variant="light" color="teal" size="xs" radius="xl">
                <IconCheck />
              </ThemeIcon>
            </Tooltip>
          </Center>
        )}
      </Flex>
      <Group>
        <Text fz="xl" fw={700} truncate style={{ flex: 1 }}>{alias.alias}</Text>
        <IconChevronRight size={16} />
      </Group>
    </UnstyledButton>
  );
}