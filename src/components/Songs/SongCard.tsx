import { MaimaiGenreProps, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import React, { useState } from "react";
import { ActionIcon, Avatar, Badge, Box, Card, CopyButton, Group, Stack, Text, Title } from "@mantine/core";
import { SongDisabledIndicator } from "../SongDisabledIndicator.tsx";
import { PhotoView } from "react-photo-view";
import { ASSET_URL } from "@/main.tsx";
import { IconPhotoOff, IconPlus } from "@tabler/icons-react";
import { openAlertModal } from "@/utils/modal.tsx";
import { AudioPlayer } from "../AudioPlayer.tsx";
import classes from "./SongCard.module.css";
import useFixedGame from "@/hooks/useFixedGame.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import useAliasListStore from "@/hooks/useAliasListStore.ts";
import { ColorExtractor } from 'react-color-extractor'
import { notifications } from "@mantine/notifications";

interface SongCardProps {
  song: MaimaiSongProps | ChunithmSongProps | null;
  onCreateAlias?: () => void;
  style?: React.CSSProperties;
}

export const SongCard = ({ song, onCreateAlias, style }: SongCardProps) => {
  const [game] = useFixedGame();
  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state[game] })),
  );
  const { aliasList } = useAliasListStore(
    useShallow((state) => ({ aliasList: state[game] })),
  );
  const [colors, setColors] = useState<string[]>([]);
  const isLoggedOut = !Boolean(localStorage.getItem("token"));

  if (!song) return null;

  return <Card mt="md" radius="md" p={0} withBorder className={classes.card} style={style}>
    <ColorExtractor
      src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song.id)}.png!webp`}
      getColors={(colors: string[]) => setColors(colors)}
    />
    <Card.Section m="md">
      <Group wrap="nowrap">
        <Box className={classes.jacket} style={{
          '--primary-color': colors && colors[0],
          '--secondary-color': colors && colors[1]
        }}>
          <SongDisabledIndicator disabled={song.disabled}>
            <PhotoView src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song.id)}.png`}>
              <Avatar src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song.id)}.png!webp`} size={94} radius="md">
                <IconPhotoOff />
              </Avatar>
            </PhotoView>
          </SongDisabledIndicator>
        </Box>
        <Stack gap={3} style={{ flex: 1 }}>
          <Text fz="xs" c="dimmed">曲目 ID：{song.id}</Text>
          <CopyButton value={song.title}>
            {({ copy }) => (
              <Title size="1.25rem" onClick={() => {
                copy();
                notifications.show({
                  title: "已复制曲目名称",
                  message: song.title,
                  autoClose: 2000,
                })
              }} style={{
                cursor: "pointer",
              }}>{song.title}</Title>
            )}
          </CopyButton>
          <Text fz="sm" c="dimmed">{song.artist}</Text>
        </Stack>
      </Group>
      <Group mt="md">
        <Box mr={12}>
          <Text fz="xs" c="dimmed">BPM</Text>
          <Text fz="sm">
            {song.bpm}
          </Text>
        </Box>
        <Box mr={12}>
          <Text fz="xs" c="dimmed">分类</Text>
          <Text fz="sm">
            {(songList.genres.find((genre) => genre.genre === song.genre) as MaimaiGenreProps).title || song.genre}
          </Text>
        </Box>
        <Box mr={12}>
          <Text fz="xs" c="dimmed">首次出现版本</Text>
          <Text fz="sm">
            {songList.versions.slice().reverse().find((version) => song.version >= version.version)?.title || "未知"}
          </Text>
        </Box>
        {"map" in song && song.map && (
          <Box mr={12}>
            <Text fz="xs" c="dimmed">所属区域</Text>
            <Text fz="sm">
              {song.map}
            </Text>
          </Box>
        )}
      </Group>
      <Box mt={12}>
        <Text fz="xs" c="dimmed" mb={3}>曲目别名</Text>
        <Group gap="xs">
          {aliasList.aliases && aliasList.aliases.find((alias) => alias.song_id === song.id)?.aliases.map((alias: any) => (
            <Badge key={alias} variant="default" radius="md" size="lg">{alias}</Badge>
          ))}
          <ActionIcon variant="default" radius="md" size={26} onClick={() => {
            if (isLoggedOut) {
              openAlertModal("登录提示", "你需要登录查分器账号才能创建曲目别名。");
            } else {
              onCreateAlias && onCreateAlias();
            }
          }}>
            <IconPlus size={18} />
          </ActionIcon>
        </Group>
      </Box>
    </Card.Section>
    <AudioPlayer
      className={classes.audioPlayer}
      src={`https://assets2.lxns.net/${game}/music/${songList.getSongResourceId(song.id)}.mp3`}
      audioProps={{ preload: "none" }}
    />
  </Card>
}