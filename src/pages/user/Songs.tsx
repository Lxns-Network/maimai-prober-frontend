import { useEffect, useReducer, useState } from "react";
import { Text, Flex, Anchor, Space, Transition } from "@mantine/core";
import { MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { useDisclosure, usePrevious } from "@mantine/hooks";
import { openRetryModal } from "@/utils/modal.tsx";
import { SongCombobox } from "@/components/SongCombobox.tsx";
import { IconListDetails } from "@tabler/icons-react";
import { fetchAPI } from "@/utils/api/api.ts";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { LoginAlert } from "@/components/LoginAlert";
import { CreateAliasModal } from "@/components/Alias/CreateAliasModal.tsx";
import { SongCard } from "@/components/Songs/SongCard.tsx";
import { SongDifficultyList } from "@/components/Songs/SongDifficultyList.tsx";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { Page } from "@/components/Page/Page.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";

interface State {
  songId: number | null;
}

type Action =
  | { type: "SET_FROM_URL"; payload: { songId: number | null } }
  | { type: "SET_FROM_LOCATION"; payload: { songId: number | null } }
  | { type: "SET_FROM_USER"; payload: { songId: number | null } }
  | { type: "RESET_SONG_ID" };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "SET_FROM_URL":
      return { ...state, songId: action.payload.songId };
    case "SET_FROM_LOCATION":
      return { ...state, songId: action.payload.songId };
    case "SET_FROM_USER":
      return { ...state, songId: action.payload.songId };
    case "RESET_SONG_ID":
      return { ...state, songId: null };
    default:
      return state;
  }
}

const SongsContent = () => {
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [game] = useGame();
  const prevGame = usePrevious(game);
  const [searchParams, setSearchParams] = useSearchParams();
  const [state, dispatch] = useReducer(reducer, {
    songId: (() => {
      const id = searchParams.get("song_id");
      return id && !isNaN(parseInt(id)) ? parseInt(id) : null;
    })(),
  });

  const { songId } = state;
  const [createAliasOpened, createAlias] = useDisclosure();
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);
  const [scores, setScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const getSongList = useSongListStore((state) => state.getSongList);
  const isLoggedOut = !localStorage.getItem("token");
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
    if (location.state) {
      if (location.state.songId) {
        const songId = parseInt(location.state.songId as string);
        if (!isNaN(songId)) {
          dispatch({ type: "SET_FROM_LOCATION", payload: { songId } });
          return;
        }
        window.history.replaceState({}, '');
        return;
      }
    }
  }, []);

  useEffect(() => {
    setSongList(getSongList(game));

    if (prevGame !== undefined && prevGame !== game) {
      setScores([]);
      setSearchParams({}, { replace: true });
      dispatch({ type: "RESET_SONG_ID" });
    }
  }, [game]);

  useEffect(() => {
    if (!song) return;

    setSearchParams({
      game: game,
      song_id: song.id.toString(),
    }, { replace: true });

    if (isLoggedOut) return;

    if (songList instanceof MaimaiSongList) {
      const s = song as MaimaiSongProps;
      const types: string[] = [];
      if (s.difficulties.dx.length) types.push("dx");
      if (s.difficulties.standard.length) types.push("standard");
      if (s.difficulties.utage && s.difficulties.utage.length) types.push("utage");

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
    const song = songList?.songs.find((song) => song.id === songId);
    if (!song) return;

    setSong(song);
    setScores([]);
  }, [songId, songList?.songs]);

  return (
    <div>
      <CreateAliasModal
        defaultSongId={songId ?? undefined}
        opened={createAliasOpened}
        onClose={() => createAlias.close()}
      />
      <SongCombobox
        value={songId ?? undefined}
        onOptionSubmit={(value) => {
          if (value === 0) {
            setSearchParams({}, { replace: true });
            dispatch({ type: "RESET_SONG_ID" });
            return;
          }
          dispatch({ type: "SET_FROM_USER", payload: { songId: value } });
        }}
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
        enterDelay={250}
      >
        {(styles) => (
          <SongCard song={song} onCreateAlias={() => createAlias.open()} style={styles} />
        )}
      </Transition>
      <Space h="md" />
      <LoginAlert content="你需要登录查分器账号才能查看你的最佳成绩。" mb="md" radius="md" />
      <Transition
        mounted={!(songId && song)}
        transition="pop"
        enterDelay={300}
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
        enterDelay={0}
      >
        {(styles) => (
          <SongDifficultyList song={song} scores={scores} setScores={setScores} style={styles} />
        )}
      </Transition>
    </div>
  );
}

export default function Songs() {
  return (
    <Page
      meta={{
        title: "曲目查询",
        description: "查询「舞萌 DX」与「中二节奏」的曲目详情",
      }}
      children={<SongsContent />}
    />
  )
}