import { MaimaiGenreProps, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import React, { useRef } from "react";
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Card,
  CopyButton,
  Flex,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { SongDisabledIndicator } from "../SongDisabledIndicator.tsx";
import { PhotoView } from "react-photo-view";
import { ASSET_URL } from "@/main";
import { IconNumber, IconPhotoOff, IconPlus } from "@tabler/icons-react";
import { openAlertModal } from "@/utils/modal.tsx";
import { AudioPlayer } from "../AudioPlayer.tsx";
import classes from "./SongCard.module.css";
import useFixedGame from "@/hooks/useFixedGame.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import useAliasListStore from "@/hooks/useAliasListStore.ts";
import { notifications } from "@mantine/notifications";
import { HTMLMediaProps } from "react-use/lib/factory/createHTMLMediaHook";
import useAliasStore from "@/hooks/useAliasStore.ts";
import { useImagePalette } from "@/hooks/useImagePalette.ts";

export const SongCard = ({
  song,
  style,
}: {
  song: MaimaiSongProps | ChunithmSongProps | null;
  style?: React.CSSProperties;
}) => {
  const [game] = useFixedGame();
  const { songList } = useSongListStore(useShallow((state) => ({ songList: state[game] })));
  const { aliasList } = useAliasListStore(useShallow((state) => ({ aliasList: state[game] })));
  const jacketRef = useRef<HTMLDivElement>(null);
  const isLoggedOut = !localStorage.getItem("token");

  const { openModal: openCreateAliasModal } = useAliasStore();
  const jacketSrc = song
    ? `${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song.id)}.png!webp`
    : undefined;
  const colors = useImagePalette(jacketSrc);

  if (!song || !jacketSrc) return null;

  const handleCreateAlias = () => {
    openCreateAliasModal({
      game,
      songId: song.id,
    });
  };

  return (
    <Card mt="md" radius="md" p={0} withBorder className={classes.card} style={style}>
      <Card.Section m="md">
        <Group wrap="nowrap">
          <Box
            ref={jacketRef}
            className={classes.jacket}
            style={{
              "--scale": 0,
              "--primary-color": colors && colors[0],
              "--secondary-color": colors && colors[1],
            }}
          >
            <SongDisabledIndicator disabled={song.disabled}>
              <PhotoView
                src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song.id)}.png`}
              >
                <Avatar
                  src={jacketSrc}
                  alt={`${song.title} 曲绘`}
                  imageProps={{ loading: "lazy" }}
                  size={94}
                  radius="md"
                >
                  <IconPhotoOff />
                </Avatar>
              </PhotoView>
            </SongDisabledIndicator>
          </Box>
          <Stack gap={3} style={{ flex: 1 }}>
            <Group gap={8} mb={3}>
              <Badge variant="light" color="gray" size="sm" leftSection={<IconNumber size={18} />}>
                {song.id}
              </Badge>
            </Group>
            <CopyButton value={song.title}>
              {({ copy }) => (
                <UnstyledButton
                  aria-label={`复制曲目名称：${song.title}`}
                  onClick={() => {
                    copy();
                    notifications.show({
                      title: "已复制曲目名称",
                      message: song.title,
                      autoClose: 2000,
                    });
                  }}
                >
                  <Title component="span" size="1.25rem" style={{ wordBreak: "break-all" }}>
                    {song.title}
                  </Title>
                </UnstyledButton>
              )}
            </CopyButton>
            <Text fz="sm" c="dimmed">
              {song.artist}
            </Text>
          </Stack>
        </Group>
        <Flex rowGap={12} columnGap="md" wrap="wrap" mt="md">
          <Box mr={12}>
            <Text fz="xs" c="dimmed">
              BPM
            </Text>
            <Text fz="sm">{song.bpm}</Text>
          </Box>
          <Box mr={12}>
            <Text fz="xs" c="dimmed">
              分类
            </Text>
            <Text fz="sm">
              {game === "maimai"
                ? (songList.genres as MaimaiGenreProps[]).find(
                    (genre) => genre.genre === song.genre,
                  )?.title
                : song.genre}
            </Text>
          </Box>
          <Box mr={12}>
            <Text fz="xs" c="dimmed">
              首次出现版本
            </Text>
            <Text fz="sm">
              {songList.versions
                .slice()
                .reverse()
                .find((version) => song.version >= version.version)?.title || "未知"}
            </Text>
          </Box>
          {"map" in song && song.map && (
            <Box mr={12}>
              <Text fz="xs" c="dimmed">
                {game === "maimai" ? "所属区域" : "所属地图"}
              </Text>
              <Text fz="sm">{song.map}</Text>
            </Box>
          )}
        </Flex>
        <Box mt={12}>
          <Text fz="xs" c="dimmed" mb={3}>
            曲目别名
          </Text>
          <Group gap="xs">
            {aliasList.aliases &&
              aliasList.aliases
                .find((alias) => alias.song_id === song.id)
                ?.aliases.map((alias: string) => (
                  <Badge key={alias} variant="default" radius="md" size="lg">
                    {alias}
                  </Badge>
                ))}
            <ActionIcon
              aria-label={`为 ${song.title} 创建别名`}
              variant="default"
              radius="md"
              size={26}
              onClick={() => {
                if (isLoggedOut) {
                  openAlertModal("登录提示", "你需要登录查分器账号才能创建曲目别名。");
                } else {
                  handleCreateAlias();
                }
              }}
            >
              <IconPlus size={18} />
            </ActionIcon>
          </Group>
        </Box>
      </Card.Section>
      <AudioPlayer
        className={classes.audioPlayer}
        onFrequencyChange={(frequency) => {
          let average = (frequency[10] ?? 0) / 200;
          average = average * average;
          jacketRef.current?.style.setProperty("--scale", average.toString());
        }}
        src={`https://assets2.lxns.net/${game}/music/${songList.getSongResourceId(song.id)}.mp3`}
        audioProps={{ preload: "none" } as HTMLMediaProps}
      />
    </Card>
  );
};
