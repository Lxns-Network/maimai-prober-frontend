import { useEffect, useReducer, useState } from "react";
import { Text, Flex, Anchor, Space, Transition } from "@mantine/core";
import { MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { usePrevious } from "@mantine/hooks";
import { SongCombobox } from "@/components/SongCombobox.tsx";
import { IconListDetails } from "@tabler/icons-react";
import { Link } from "@/components/Link";
import { LoginAlert } from "@/components/LoginAlert";
import { SongCard } from "@/components/Songs/SongCard.tsx";
import { SongDifficultyList } from "@/components/Songs/SongDifficultyList.tsx";
import { SongCollections } from "@/components/Songs/SongCollections.tsx";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { Page } from "@/components/Page/Page.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";
import { getSongCollections, SongCollectionItemProps } from "@/utils/api/song/song.tsx";
import { usePageContext } from "vike-react/usePageContext";
import { useSongBests } from "@/hooks/queries/useSongBests.ts";

interface State {
  songId: number | null;
}

type Action =
  | { type: "SET_FROM_URL"; payload: { songId: number | null } }
  | { type: "SET_FROM_PAGE_CONTEXT"; payload: { songId: number | null } }
  | { type: "SET_FROM_USER"; payload: { songId: number | null } }
  | { type: "RESET_SONG_ID" };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "SET_FROM_URL":
      return { ...state, songId: action.payload.songId };
    case "SET_FROM_PAGE_CONTEXT":
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
  const pageContext = usePageContext();
  const searchParams = new URLSearchParams(pageContext.urlParsed.search);
  const [state, dispatch] = useReducer(reducer, {
    songId: (() => {
      const id = searchParams.get("song_id");
      return id && !isNaN(parseInt(id)) ? parseInt(id) : null;
    })(),
  });

  const { songId } = state;
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);
  const [scores, setScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [songCollections, setSongCollections] = useState<SongCollectionItemProps[] | null>(null);
  const getSongList = useSongListStore((state) => state.getSongList);

  const { scores: fetchedScores } = useSongBests(game, song);

  const getSongCollectionsHandler = async (songId: number) => {
    try {
      const data = await getSongCollections(game, songId);
      setSongCollections(data);
    } catch (error) {
      console.error("获取关联收藏品失败", error);
      setSongCollections(null);
    }
  }

  useEffect(() => {
    if (pageContext.songId) {
      dispatch({ type: "SET_FROM_PAGE_CONTEXT", payload: { songId: pageContext.songId } });
    }
  }, [pageContext.songId]);

  useEffect(() => {
    setSongList(getSongList(game));

    if (prevGame !== undefined && prevGame !== game) {
      setScores([]);
      setSongCollections(null);
      window.history.replaceState(null, '', window.location.pathname);
      dispatch({ type: "RESET_SONG_ID" });
    }
  }, [game]);

  useEffect(() => {
    if (!song) return;
    window.history.replaceState(null, '', `${window.location.pathname}?game=${game}&song_id=${song.id.toString()}`);
  }, [song, game]);

  useEffect(() => {
    setScores(fetchedScores);
  }, [fetchedScores]);

  useEffect(() => {
    const song = songList?.songs.find((song) => song.id === songId);
    if (!song) return;

    setSong(song);
    setScores([]);
    setSongCollections(null);
    getSongCollectionsHandler(song.id);
  }, [songId, songList?.songs]);

  return (
    <div>
      <SongCombobox
        value={songId ?? undefined}
        onOptionSubmit={(value) => {
          if (value === 0) {
            window.history.replaceState(null, '', window.location.pathname);
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
          <SongCard song={song} style={styles} />
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
      <Transition
        mounted={Boolean(songId && song && songCollections && songCollections.length > 0)}
        transition="pop"
        enterDelay={0}
      >
        {(styles) => (
          <SongCollections collections={songCollections} style={{ ...styles, marginTop: "1rem" }} />
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
