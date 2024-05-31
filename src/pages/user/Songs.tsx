import { useContext, useEffect, useState } from "react";
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
import { useLocalStorage, useDisclosure } from "@mantine/hooks";
import { openAlertModal, openRetryModal } from "../../utils/modal.tsx";
import { SongCombobox } from "../../components/SongCombobox.tsx";
import { IconListDetails, IconPhotoOff, IconPlus } from "@tabler/icons-react";
import { fetchAPI } from "../../utils/api/api.tsx";
import { Link, useLocation } from "react-router-dom";
import { LoginAlert } from "../../components/LoginAlert";
import { PhotoView } from "react-photo-view";
import { AudioPlayer } from "../../components/AudioPlayer.tsx";
import { CreateAliasModal } from "../../components/Alias/CreateAliasModal.tsx";
import { ApiContext } from "../../App.tsx";
import { ScoreModal } from "../../components/Scores/ScoreModal.tsx";
import { MaimaiSongDifficulty } from "../../components/Songs/maimai/SongDifficulty.tsx";
import { ChunithmSongDifficulty } from "../../components/Songs/chunithm/SongDifficulty.tsx";

export default function Songs() {
  const [game, setGame] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });
  const [scoreAlertOpened, { open: openScoreAlert, close: closeScoreAlert }] = useDisclosure(false);
  const [defaultSongId, setDefaultSongId] = useState<number>(0)
  const [songId, setSongId] = useState<number>(0);
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [score, setScore] = useState<any>(null);
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
        if (data.code === 404) {
          return [];
        }
        throw new Error(data.message);
      }
      return data.data;
    } catch (error) {
      openRetryModal("曲目成绩获取失败", `${error}`, () => getPlayerSongBestsHandler(type));
    }
  }

  useEffect(() => {
    document.title = "曲目查询 | maimai DX 查分器";

    if (location.state) {
      if (location.state.songId) {
        setDefaultSongId(location.state.songId);
        window.history.replaceState({}, '');
      }
    }
  }, []);

  useEffect(() => {
    if (!game) return;

    if (defaultSongId) {
      setSongId(defaultSongId);
      setDefaultSongId(0);
    } else {
      setSongId(0);
    }
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

  return (
    <Container className={classes.root} size={500}>
      <ScoreModal
        game={game}
        score={score}
        opened={scoreAlertOpened}
        onClose={(score) => {
          closeScoreAlert();
          if (score) {
            setScores((prev) => {
              const index = prev.findIndex((record) => record.id === score.id && record.level_index === score.level_index);
              if (index >= 0) {
                prev[index] = score;
                return [...prev];
              } else {
                return [...prev, score];
              }
            });
          }
        }}
      />
      <CreateAliasModal defaultSongId={songId} opened={opened} onClose={() => setOpened(false)} />
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        曲目查询
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
        查询「舞萌 DX」与「中二节奏」的曲目详情
      </Text>
      <SegmentedControl mb="md" radius="md" fullWidth value={game} onChange={(value) => setGame(value as "maimai" | "chunithm")} data={[
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
              <PhotoView src={`https://assets.lxns.net/${game}/jacket/${context.songList.getSongResourceId(song)}.png`}>
                <Avatar src={`https://assets.lxns.net/${game}/jacket/${context.songList.getSongResourceId(song)}.png!webp`} size={94} radius="md">
                  <IconPhotoOff />
                </Avatar>
              </PhotoView>
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
            src={`https://assets2.lxns.net/${game}/music/${song.id%10000}.mp3`}
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
            ["dx", "standard", "utage"].map((type) => {
              if (type === "utage" && !(song as MaimaiSongProps).difficulties.utage) return null;

              return (song as MaimaiSongProps).difficulties[type as keyof MaimaiDifficultiesProps].slice().reverse().map((difficulty) => (
                <MaimaiSongDifficulty
                  key={`${song.id}-${type}-${difficulty.difficulty}`}
                  difficulty={difficulty}
                  score={scores.find((record) => record.type === type && record.level_index === difficulty.difficulty)}
                  versions={context.songList.versions}
                  onClick={() => {
                    setScore(scores.find((record) => record.type === type && record.level_index === difficulty.difficulty) || {
                      type: type,
                      level_index: difficulty.difficulty,
                      achievements: -1,
                    });

                    openScoreAlert();
                  }}
                />
              ))
            })
          )}
          {context.songList instanceof ChunithmSongList && (
            (song as ChunithmSongProps).difficulties.slice().reverse().map((difficulty) => (
              <ChunithmSongDifficulty
                key={`${song.id}-${difficulty.difficulty}`}
                difficulty={difficulty}
                score={scores.find((record) => record.level_index === difficulty.difficulty)}
                versions={context.songList.versions}
                onClick={() => {
                  setScore(scores.find((record) => record.level_index === difficulty.difficulty) || {
                    level_index: difficulty.difficulty,
                    score: -1,
                  });

                  openScoreAlert();
                }}
              />
            ))
          )}
        </Stack>
      )}
    </Container>
  );
}