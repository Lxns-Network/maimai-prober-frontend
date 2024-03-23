import {useContext, useEffect, useState} from "react";
import {
  Container,
  Text,
  Title,
  Card,
  SegmentedControl, Group, Avatar, Flex, Box, Anchor, Space, Stack, Badge, ActionIcon
} from "@mantine/core";
import classes from "./Songs.module.css"
import { MaimaiDifficultiesProps, MaimaiSongList, MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongList, ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { useLocalStorage } from "@mantine/hooks";
import { openAlertModal, openRetryModal } from "../../utils/modal.tsx";
import { SongCombobox } from "../../components/SongCombobox.tsx";
import { IconListDetails, IconPhotoOff, IconPlus } from "@tabler/icons-react";
import { fetchAPI } from "../../utils/api/api.tsx";
import { Link, useLocation } from "react-router-dom";
import { LoginAlert } from "../../components/LoginAlert";
import { SongDifficulty } from "../../components/Songs/SongDifficulty.tsx";
import { PhotoView } from "react-photo-view";
import { AudioPlayer } from "../../components/AudioPlayer.tsx";
import { CreateAliasModal } from "../../components/Alias/CreateAliasModal.tsx";
import { ApiContext } from "../../App.tsx";

export default function Songs() {
  const [game, setGame] = useLocalStorage({ key: 'game' });
  const [songId, setSongId] = useState<number>(0);
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [opened, setOpened] = useState(false);
  const isLoggedOut = !Boolean(localStorage.getItem("token"));
  const location = useLocation();

  const context = useContext(ApiContext);

  const getPlayerSongBestsHandler = async (type?: string) => {
    if (!song) return;
    if (game === "maimai" && !type) return;
    try {
      const res = await fetchAPI(`user/${game}/player/bests?song_id=${song.id}&song_type=${type}`, { method: "GET" });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      return data.data;
    } catch (error) {
      openRetryModal("曲目成绩获取失败", `${error}`, () => getPlayerSongBestsHandler(type));
    }
  }

  useEffect(() => {
    document.title = "曲目查询 | maimai DX 查分器";
  }, []);

  useEffect(() => {
    if (!game) return;

    setSongId(0);
    setSong(null);
    setScores([]);
  }, [game]);

  useEffect(() => {
    if (!song || isLoggedOut) return;

    if (context.songList instanceof MaimaiSongList) {
      const s = song as MaimaiSongProps;
      let types = [];
      if (s.difficulties.dx.length) types.push("dx");
      if (s.difficulties.standard.length) types.push("standard");

      Promise.all(types.map((type) => getPlayerSongBestsHandler(type))).then((data) => {
        setScores(data.flat().filter((record) => record));
      });
    } else {
      getPlayerSongBestsHandler().then((data) => {
        if (data) setScores(data);
      });
    }
  }, [song]);

  useEffect(() => {
    if (!songId) return;

    setSong(context.songList.songs.find((song) => song.id === songId) || null)
    setScores([]);
  }, [songId]);

  useEffect(() => {
    if (!context.songList.songs.length) return;

    if (location.state) {
      if (location.state.songId) {
        setSongId(location.state.songId);
        window.history.replaceState({}, '');
      }
    }
  }, [context.songList]);

  return (
    <Container className={classes.root} size={500}>
      <CreateAliasModal defaultSongId={songId} opened={opened} onClose={() => setOpened(false)} />
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        曲目查询
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
        查询舞萌 DX 与中二节奏的曲目详情
      </Text>
      <SegmentedControl mb="md" radius="md" fullWidth value={game} onChange={(value) => setGame(value)} data={[
        { label: '舞萌 DX', value: 'maimai' },
        { label: '中二节奏', value: 'chunithm' },
      ]} />
      <SongCombobox
        value={songId}
        onOptionSubmit={(value) => setSongId(value)}
        radius="md"
        mb={4}
      />
      <Text c="dimmed" size="xs">
        你可以使用曲名、艺术家或<Anchor component={Link} to="/alias/vote">曲目别名</Anchor>来搜索曲目。
      </Text>
      {song && (
        <Card mt="md" radius="md" p={0} withBorder className={classes.card}>
          <Card.Section m="md">
            <Group wrap="nowrap">
              <PhotoView src={`https://assets.lxns.net/${game}/jacket/${song.id}.png`}>
                <Avatar src={`https://assets.lxns.net/${game}/jacket/${song.id}.png!webp`} size={94} radius="md">
                  <IconPhotoOff />
                </Avatar>
              </PhotoView>
              <div style={{ flex: 1 }}>
                {song && <Text fz="xs" c="dimmed">曲目 ID：{song.id}</Text>}
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
                  {context.songList.genres.find((genre) => genre.genre === song.genre)?.title || song.genre}
                </Text>
              </Box>
              <Box mr={12}>
                <Text fz="xs" c="dimmed">首次出现版本</Text>
                <Text fz="sm">
                  {context.songList.versions.slice().reverse().find((version) => song.version >= version.version)?.title || "未知"}
                </Text>
              </Box>
            </Group>
            <Box mt={12}>
              <Text fz="xs" c="dimmed" mb={3}>曲目别名</Text>
              <Group gap="xs">
                {context.aliasList.aliases && context.aliasList.aliases.find((alias) => alias.song_id === song.id)?.aliases.map((alias: any) => (
                  <Badge key={alias} variant="default" radius="md" size="lg">{alias}</Badge>
                ))}
                <ActionIcon variant="default" radius="md" size={26} onClick={() => {
                  if (isLoggedOut) {
                    openAlertModal("登录提示", "你需要登录查分器账号才能创建曲目别名。");
                  } else {
                    setOpened(true);
                  }
                }}>
                  <IconPlus size={18} />
                </ActionIcon>
              </Group>
            </Box>
          </Card.Section>
          <AudioPlayer
            className={classes.audioPlayer}
            src={`https://assets2.lxns.net/${game}/music/${song.id}.mp3`}
            audioProps={{ preload: "none" }}
          />
        </Card>
      )}
      <Space h="md" />
      <LoginAlert content="你需要登录查分器账号才能查看你的最佳成绩。" mb="md" radius="md" />
      {!song ? (
        <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
          <IconListDetails size={64} stroke={1.5} />
          <Text fz="sm">请选择一首曲目来查看曲目详情</Text>
        </Flex>
      ) : (
        <Stack>
          {context.songList instanceof MaimaiSongList && (
            ["dx", "standard"].map((type) => (
              (song as MaimaiSongProps).difficulties[type as keyof MaimaiDifficultiesProps].slice().reverse().map((difficulty, i) => (
                <SongDifficulty
                  key={i}
                  song={song}
                  score={scores.find((record) => record.type === type && record.level_index === difficulty.difficulty)}
                  difficulty={difficulty}
                  type={type}
                  versions={context.songList.versions}
                />
              ))
            ))
          )}
          {context.songList instanceof ChunithmSongList && (
            (song as ChunithmSongProps).difficulties.slice().reverse().map((difficulty, i) => (
              <SongDifficulty
                key={i}
                song={song}
                score={scores.find((record) => record.level_index === difficulty.difficulty)}
                difficulty={difficulty}
                versions={context.songList.versions}
              />
            ))
          )}
        </Stack>
      )}
    </Container>
  );
}