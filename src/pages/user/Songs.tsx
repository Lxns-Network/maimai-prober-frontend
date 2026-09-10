import { useEffect, useState } from "react";
import { Text, Flex, Anchor, Space } from "@mantine/core";
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

const SongsContent = () => {
  const [game] = useGame();
  const pageContext = usePageContext();
  const searchParams = new URLSearchParams(pageContext.urlParsed.search);
  const songList = useSongListStore((state) => state[game]);
  const [selection, setSelection] = useState(() => {
    const id = searchParams.get("song_id");
    const urlGame = searchParams.get("game");
    return {
      game,
      songId: id && (!urlGame || urlGame === game) && !isNaN(parseInt(id)) ? parseInt(id) : null,
    };
  });
  if (selection.game !== game) setSelection({ game, songId: null });
  const songId = selection.game === game ? selection.songId : null;
  const song = songId ? (songList.find(songId) ?? null) : null;
  const [scores, setScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [songCollections, setSongCollections] = useState<SongCollectionItemProps[] | null>(null);

  const { scores: fetchedScores } = useSongBests(game, song);

  useEffect(() => {
    if (!songId) {
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }
    if (!song) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?game=${game}&song_id=${song.id.toString()}`,
    );
  }, [song, songId, game]);

  useEffect(() => {
    setScores(fetchedScores);
  }, [fetchedScores, game, songId]);

  const selectedSongId = song?.id;
  useEffect(() => {
    setSongCollections(null);
    if (!selectedSongId) return;
    let cancelled = false;
    getSongCollections(game, selectedSongId).then(
      (data) => {
        if (!cancelled) setSongCollections(data);
      },
      (error) => {
        if (!cancelled) {
          console.error("获取关联收藏品失败", error);
          setSongCollections(null);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedSongId, game]);

  return (
    <div>
      <SongCombobox
        value={songId ?? undefined}
        onOptionSubmit={(value) => setSelection({ game, songId: value || null })}
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
