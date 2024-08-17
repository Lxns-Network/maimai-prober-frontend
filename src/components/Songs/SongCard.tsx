import { MaimaiGenreProps, MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import React, { useContext } from "react";
import { ApiContext } from "../../App.tsx";
import { ActionIcon, Avatar, Badge, Box, Card, Group, Text } from "@mantine/core";
import { SongDisabledIndicator } from "../SongDisabledIndicator.tsx";
import { PhotoView } from "react-photo-view";
import { ASSET_URL } from "../../main.tsx";
import { IconPhotoOff, IconPlus } from "@tabler/icons-react";
import { openAlertModal } from "../../utils/modal.tsx";
import { AudioPlayer } from "../AudioPlayer.tsx";
import classes from "./SongCard.module.css";
import useStoredGame from "../../hooks/useStoredGame.tsx";

interface SongCardProps {
  song: MaimaiSongProps | ChunithmSongProps | null;
  onCreateAlias?: () => void;
  style?: React.CSSProperties;
}

export const SongCard = ({ song, onCreateAlias, style }: SongCardProps) => {
  const [game] = useStoredGame();
  const isLoggedOut = !Boolean(localStorage.getItem("token"));

  const context = useContext(ApiContext);
  const songList = context.songList[game];
  const aliasList = context.aliasList[game];

  if (!song) return null;

  return <Card mt="md" radius="md" p={0} withBorder className={classes.card} style={style}>
    <Card.Section m="md">
      <Group wrap="nowrap">
        <SongDisabledIndicator disabled={song.disabled}>
          <PhotoView src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song.id)}.png`}>
            <Avatar src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song.id)}.png!webp`} size={94} radius="md">
              <IconPhotoOff />
            </Avatar>
          </PhotoView>
        </SongDisabledIndicator>
        <div style={{ flex: 1 }}>
          <Text fz="xs" c="dimmed">曲目 ID：{song.id}</Text>
          <Text fz="xl" fw={700}>{song.title}</Text>
          <Text fz="sm" c="dimmed">{song.artist}</Text>
        </div>
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