import { useEffect, useState } from "react";
import {
  Container,
  Text,
  Title,
  Card,
  SegmentedControl, Group, Avatar, keys, Flex, Box, Anchor
} from "@mantine/core";
import classes from "../Page.module.css"
import { MaimaiDifficultiesProps, MaimaiSongList, MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongList, ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { useLocalStorage } from "@mantine/hooks";
import { SongList } from "../../utils/api/song/song.tsx";
import { openRetryModal } from "../../utils/modal.tsx";
import { SongCombobox } from "../../components/SongCombobox.tsx";
import { AliasList } from "../../utils/api/alias.tsx";
import { IconListDetails, IconPhotoOff } from "@tabler/icons-react";
import { fetchAPI } from "../../utils/api/api.tsx";
import {Link, useLocation} from "react-router-dom";
import { LoginAlert } from "../../components/LoginAlert";
import { Song } from "../../components/Songs/Song";
import {PhotoView} from "react-photo-view";

export default function Songs() {
  const [game, setGame] = useLocalStorage({ key: 'game' });
  const [songList, setSongList] = useState(new SongList());
  const [aliasList, setAliasList] = useState(new AliasList());
  const [songId, setSongId] = useState<number>(0);
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);
  const [scores, setScores] = useState<any[]>([]);
  const location = useLocation();
  const isLoggedOut = !Boolean(localStorage.getItem("token"));

  const songListFetchHandler = async (songList: SongList) => {
    try {
      await songList.fetch();
      setSongList(songList);
    } catch (error) {
      openRetryModal("曲目列表获取失败", `${error}`, () => songListFetchHandler(songList));
    }
  }

  const getPlayerSongBestsHandler = async (type?: string) => {
    if (!song) return;
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

    setSong(null);
    setScores([]);
    setSongList(new SongList());
    setAliasList(new AliasList());

    let songList: MaimaiSongList | ChunithmSongList;
    if (game === "maimai") {
      songList = new MaimaiSongList();
    } else {
      songList = new ChunithmSongList();
    }
    songListFetchHandler(songList);
  }, [game]);

  useEffect(() => {
    if (!game) return;

    aliasList.fetch(game).then(() => {
      setAliasList(aliasList);
    });
  }, [aliasList]);

  useEffect(() => {
    if (!song || isLoggedOut) return;

    if (songList instanceof MaimaiSongList) {
      keys(song.difficulties).forEach((type) => {
        // @ts-ignore
        if (song.difficulties[type].length === 0) return;

        let scores: any[] = [];
        getPlayerSongBestsHandler(type).then((data) => {
          if (data) {
            scores = scores.concat(data);
            setScores(scores);
          }
        });
      });
    } else {
      getPlayerSongBestsHandler().then((data) => {
        if (data) setScores(data);
      });
    }
  }, [song]);

  useEffect(() => {
    if (!songId) return;

    setSong(songList.songs.find((song) => song.id === songId) || null)
    setScores([]);
  }, [songId]);

  useEffect(() => {
    if (!songList.songs.length) return;

    if (location.state) {
      if (location.state.songId) {
        setSongId(location.state.songId);
      }
    }
  }, [songList]);

  return (
    <Container className={classes.root} size={500}>
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
        songs={songList.songs}
        aliases={aliasList.aliases}
        value={songId}
        onOptionSubmit={(value) => setSongId(value)}
        radius="md"
        mb={4}
      />
      <Text c="dimmed" size="xs">
        你可以使用曲名、艺术家或<Anchor component={Link} to="/alias/vote">曲目别名</Anchor>来搜索曲目。
      </Text>
      {song && (
        <Card mt="md" radius="md" p="md" withBorder className={classes.card}>
          <Group wrap="nowrap">
            <PhotoView src={`https://assets.lxns.net/${game}/jacket/${song.id}.png!webp`}>
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
                {songList.genres.find((genre) => genre.genre === song.genre)?.title || song.genre}
              </Text>
            </Box>
            <Box mr={12}>
              <Text fz="xs" c="dimmed">版本</Text>
              <Text fz="sm">
                {songList.versions.slice().reverse().find((version) => song.version >= version.version)?.title || "未知"}
              </Text>
            </Box>
          </Group>
        </Card>
      )}
      <LoginAlert content="你需要登录查分器账号才能查看你的最佳成绩。" mt="md" mb="md" radius="md" />
      {!song ? (
        <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
          <IconListDetails size={64} stroke={1.5} />
          <Text fz="sm">请选择一个曲目来查看曲目详情</Text>
        </Flex>
      ) : (
        <>
          {songList instanceof MaimaiSongList && (
            ["dx", "standard"].map((type) => (
              (song as MaimaiSongProps).difficulties[type as keyof MaimaiDifficultiesProps].slice().reverse().map((difficulty, i) => (
                <Song
                  key={i}
                  song={song}
                  score={scores.find((record) => record.type === type && record.level_index === difficulty.difficulty)}
                  difficulty={difficulty}
                  type={type}
                  versions={songList.versions}
                />
              ))
            ))
          )}
          {songList instanceof ChunithmSongList && (
            (song as ChunithmSongProps).difficulties.slice().reverse().map((difficulty, i) => (
              <Song
                key={i}
                song={song}
                score={scores.find((record) => record.level_index === difficulty.difficulty)}
                difficulty={difficulty}
                versions={songList.versions}
              />
            ))
          )}
        </>
      )}
    </Container>
  );
}