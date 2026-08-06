import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Text, Flex, Anchor, Space } from "@mantine/core";
import { MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
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
import { AnimatePresence, motion } from "motion/react";
import { match } from "ts-pattern";

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
};

const SongsContent = () => {
  const [game] = useGame();
  const pageContext = usePageContext();
  const searchParams = new URLSearchParams(pageContext.urlParsed.search);
  const getSongList = useSongListStore((state) => state.getSongList);

  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>(() =>
    getSongList(game),
  );
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

  const switchingGame = useRef(false);
  const previousGame = useRef(game);
  const collectionsRequestId = useRef(0);
  const isSongMatchingGame =
    song &&
    ((game === "maimai" && "standard" in (song.difficulties || {})) ||
      (game === "chunithm" && !("standard" in (song.difficulties || {}))));
  const { scores: fetchedScores } = useSongBests(game, isSongMatchingGame ? song : null);

  const getSongCollectionsHandler = useCallback(
    async (songId: number) => {
      const requestId = ++collectionsRequestId.current;
      try {
        const data = await getSongCollections(game, songId);
        if (requestId !== collectionsRequestId.current) return;
        setSongCollections(data);
      } catch (error) {
        if (requestId !== collectionsRequestId.current) return;
        console.error("获取关联收藏品失败", error);
        setSongCollections(null);
      }
    },
    [game],
  );

  useEffect(() => {
    setSongList(getSongList(game));
  }, [game, getSongList]);

  useEffect(() => {
    if (previousGame.current !== game) {
      switchingGame.current = true;
      setSong(null);
      setScores([]);
      setSongCollections(null);
      collectionsRequestId.current += 1;
      window.history.replaceState(window.history.state, "", window.location.pathname);
      dispatch({ type: "RESET_SONG_ID" });
    }
    previousGame.current = game;
  }, [game]);

  useEffect(() => {
    if (switchingGame.current) {
      switchingGame.current = false;
      return;
    }
    if (!song || !songId) return;
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?game=${game}&song_id=${song.id.toString()}`,
    );
  }, [song, songId, game]);

  useEffect(() => {
    setScores(fetchedScores);
  }, [fetchedScores]);

  useEffect(() => {
    if (!songId) {
      collectionsRequestId.current += 1;
      setSong(null);
      setSongCollections(null);
      return;
    }

    const song = songList.find(songId);
    if (!song) {
      setSong(null);
      setSongCollections(null);
      return;
    }

    setSong(song);
    setScores([]);
    setSongCollections(null);
    getSongCollectionsHandler(song.id);
  }, [getSongCollectionsHandler, songId, songList]);

  return (
    <div>
      <SongCombobox
        value={songId ?? undefined}
        onOptionSubmit={(value) => {
          if (value === 0) {
            collectionsRequestId.current += 1;
            window.history.replaceState(window.history.state, "", window.location.pathname);
            dispatch({ type: "RESET_SONG_ID" });
            return;
          }
          dispatch({ type: "SET_FROM_USER", payload: { songId: value } });
        }}
        radius="md"
        mb={4}
      />
      <Text c="dimmed" size="xs">
        你可以使用曲目 ID、曲名、艺术家或
        <Anchor component={Link} to="/alias/vote">
          曲目别名
        </Anchor>
        来搜索曲目。
      </Text>
      <AnimatePresence mode="wait" initial={false}>
        {match(Boolean(songId && song))
          .with(true, () => (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SongCard song={song} />
              <Space h="md" />
              <LoginAlert
                content="你需要登录查分器账号才能查看你的最佳成绩。"
                mb="md"
                radius="md"
              />
              <SongDifficultyList song={song} scores={scores} setScores={setScores} />
              {songCollections && songCollections.length > 0 && (
                <SongCollections collections={songCollections} style={{ marginTop: "1rem" }} />
              )}
            </motion.div>
          ))
          .with(false, () => (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
                <IconListDetails size={64} stroke={1.5} />
                <Text fz="sm">请选择一首曲目来查看曲目详情</Text>
              </Flex>
            </motion.div>
          ))
          .exhaustive()}
      </AnimatePresence>
    </div>
  );
};

export default function Songs() {
  return (
    <Page
      meta={{
        title: "曲目查询",
        description: "查询「舞萌 DX」与「中二节奏」的曲目详情",
      }}
      children={<SongsContent />}
    />
  );
}
