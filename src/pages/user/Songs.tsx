import { useEffect, useState } from "react";
import {
  Container,
  Text,
  Title,
  Flex, Anchor, Space, Transition
} from "@mantine/core";
import classes from "./Songs.module.css"
import { MaimaiSongList, MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongList, ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { useDisclosure, useLocalStorage } from "@mantine/hooks";
import { openRetryModal } from "../../utils/modal.tsx";
import { SongCombobox } from "../../components/SongCombobox.tsx";
import { IconListDetails } from "@tabler/icons-react";
import { fetchAPI } from "../../utils/api/api.tsx";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { LoginAlert } from "../../components/LoginAlert";
import { CreateAliasModal } from "../../components/Alias/CreateAliasModal.tsx";
import { SongCard } from "../../components/Songs/SongCard.tsx";
import { SongDifficultyList } from "../../components/Songs/SongDifficultyList.tsx";
import useSongListStore from "../../hooks/useSongListStore.tsx";

export default function Songs() {
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });

  const [createAliasOpened, createAlias] = useDisclosure();
  const [defaultSongId, setDefaultSongId] = useState<number>(0)
  const [songId, setSongId] = useState<number>(0);
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);
  const [scores, setScores] = useState<any[]>([]);

  const [searchParams, setSearchParams] = useSearchParams();
  const getSongList = useSongListStore((state) => state.getSongList);
  const isLoggedOut = !Boolean(localStorage.getItem("token"));
  const location = useLocation();

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
        return;
      }
    }

    if (searchParams.has("song_id")) {
      setDefaultSongId(parseInt(searchParams.get("song_id") || "0"));
    }
  }, []);

  useEffect(() => {
    if (!game) return;

    setSongList(getSongList(game));
    setScores([]);

    if (defaultSongId) {
      setSongId(defaultSongId);
      setDefaultSongId(0);
    } else {
      setSearchParams({});
      setSongId(0);
    }
  }, [game]);

  useEffect(() => {
    if (!song || isLoggedOut) return;

    if (songList instanceof MaimaiSongList) {
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

    const song = songList?.songs.find((song) => song.id === songId);
    if (!song) return;

    setSearchParams({
      "game": game,
      "song_id": songId.toString(),
    });
    setSong(song);
    setScores([]);
  }, [songId, songList?.songs]);

  return (
    <Container className={classes.root} size={500}>
      <CreateAliasModal defaultSongId={songId} opened={createAliasOpened} onClose={() => createAlias.close()} />
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        曲目查询
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
        查询「舞萌 DX」与「中二节奏」的曲目详情
      </Text>
      <SongCombobox
        value={songId}
        onOptionSubmit={(value) => setSongId(value)}
        radius="md"
        mb={4}
      />
      <Text c="dimmed" size="xs">
        你可以使用曲目 ID、曲名、艺术家或<Anchor component={Link} to="/alias/vote">曲目别名</Anchor>来搜索曲目。
      </Text>
      <Transition
        mounted={Boolean(songId && song)}
        transition="pop"
        timingFunction="ease"
      >
        {(styles) => (
          <SongCard song={song} onCreateAlias={() => createAlias.open()} style={styles} />
        )}
      </Transition>
      <Space h="md" />
      <LoginAlert content="你需要登录查分器账号才能查看你的最佳成绩。" mb="md" radius="md" />
      <Transition
        mounted={!Boolean(songId && song)}
        transition="pop"
        enterDelay={250}
      >
        {(styles) => (
          <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl" style={styles}>
            <IconListDetails size={64} stroke={1.5} />
            <Text fz="sm">请选择一首曲目来查看曲目详情</Text>
          </Flex>
        )}
      </Transition>
      <Transition
        mounted={Boolean(songId && song)}
        transition="pop"
      >
        {(styles) => (
          <SongDifficultyList song={song} scores={scores} setScores={setScores} style={styles} />
        )}
      </Transition>
    </Container>
  );
}