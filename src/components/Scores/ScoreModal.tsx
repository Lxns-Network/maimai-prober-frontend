import { useContext, useEffect, useRef, useState } from "react";
import ScoreContext from "@/utils/context.ts";
import { fetchAPI } from "@/utils/api/api.ts";
import { Accordion, Avatar, Center, Container, Group, Loader, Modal, Space, Text, Transition } from "@mantine/core";
import { MaimaiScoreHistory } from "./maimai/ScoreHistory.tsx";
import { MaimaiDifficultyProps, MaimaiSongList, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { ChunithmDifficultyProps, ChunithmSongList, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { MaimaiScoreModalContent } from "./maimai/ScoreModal.tsx";
import { ChunithmScoreModalContent } from "./chunithm/ScoreModal.tsx";
import { ChunithmScoreHistory } from "./chunithm/ScoreHistory.tsx";
import { MaimaiChart } from "./maimai/Chart.tsx";
import { openRetryModal } from "@/utils/modal.tsx";
import classes from "./ScoreModal.module.css"
import { ChunithmChart } from "./chunithm/Chart.tsx";
import { ScoreModalMenu } from "./ScoreModalMenu.tsx";
import { ASSET_URL } from "@/main.tsx";
import { IconPhotoOff } from "@tabler/icons-react";
import { useIntersection } from "@mantine/hooks";
import { Marquee } from "../Marquee.tsx";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Game } from "@/types/game";

interface ScoreModalProps {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  opened: boolean;
  onClose: (score?: MaimaiScoreProps | ChunithmScoreProps) => void;
}

export const ScoreModal = ({ game, score, opened, onClose }: ScoreModalProps) => {
  const [songList, setSongList] = useState<MaimaiSongList | ChunithmSongList>();
  const [historyScores, setHistoryScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [fetching, setFetching] = useState(true);
  const [difficulty, setDifficulty] = useState<MaimaiDifficultyProps | ChunithmDifficultyProps | null>(null);
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);

  const getSongList = useSongListStore((state) => state.getSongList);
  const scoreContext = useContext(ScoreContext);

  const containerRef = useRef<HTMLDivElement>(null);
  const { ref, entry } = useIntersection({
    root: containerRef.current,
    threshold: 0.95,
  });

  const getSongDetailHandler = async (id: number) => {
    const res = await fetchAPI(`${game}/song/${id}`, {
      method: "GET",
    });
    const data = await res.json();
    setSong(data);
  }

  const getPlayerScoreHistory = async (score: any) => {
    if ((game === "maimai" && score.achievements < 0) ||
      (game === "chunithm" && score.score < 0)) {
      setHistoryScores([]);
      setFetching(false);
      return;
    }
    setFetching(true);
    try {
      const res = await fetchAPI(`user/${game}/player/score/history?song_id=${score.id}&song_type=${score.type}&level_index=${score.level_index}`, {
        method: "GET",
      })
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      if (data.data) {
        setHistoryScores(data.data.sort((a: any, b: any) => {
          const uploadTimeDiff = new Date(a.upload_time).getTime() - new Date(b.upload_time).getTime();

          if (uploadTimeDiff === 0 && a.play_time && b.play_time) {
            return new Date(a.play_time).getTime() - new Date(b.play_time).getTime();
          }

          return uploadTimeDiff;
        }));
      }
    } catch (error) {
      openRetryModal("历史记录获取失败", `${error}`, () => getPlayerScoreHistory(score))
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    setSong(null);
    setSongList(getSongList(game));
  }, [game]);

  useEffect(() => {
    if (!song) return;

    let difficulty;
    if (songList instanceof MaimaiSongList) {
      score = score as MaimaiScoreProps;
      difficulty = songList.getDifficulty(song as MaimaiSongProps, score.type, score.level_index);
    } else if (songList instanceof ChunithmSongList) {
      score = score as ChunithmScoreProps;
      difficulty = songList.getDifficulty(song as ChunithmSongProps, score.level_index);
    }
    difficulty && setDifficulty(difficulty);
  }, [song]);

  useEffect(() => {
    if (!score) return;

    Object.keys(scoreContext).length !== 0 && scoreContext.setScore(score);

    setSong(songList?.find(score.id) || null);
    getSongDetailHandler(score.id);

    setHistoryScores([]);
    getPlayerScoreHistory(score);
  }, [score]);

  function isMaimaiScoreProps(obj: unknown): obj is MaimaiScoreProps {
    if (!obj) return false;
    return typeof obj === 'object' && 'achievements' in obj;
  }

  function isChunithmScoreProps(obj: unknown): obj is ChunithmScoreProps {
    if (!obj) return false;
    return typeof obj === 'object' && 'score' in obj;
  }

  return (
    <Modal.Root opened={opened} onClose={onClose} centered size="lg">
      <Modal.Overlay />
      <Modal.Content ref={containerRef}>
        <Modal.Header mah={60}>
          <Modal.Title>
            <Transition
              mounted={entry?.isIntersecting ?? true}
              transition="slide-right"
              enterDelay={300}
              duration={250}
            >
              {(styles) => (
                <Text style={styles}>成绩详情</Text>
              )}
            </Transition>
            <Transition
              mounted={entry ? !entry.isIntersecting : false}
              transition="slide-right"
              enterDelay={300}
              duration={250}
            >
              {(styles) => (
                <Group wrap="nowrap" gap="xs" style={styles}>
                  <Avatar src={song ? `${ASSET_URL}/${game}/jacket/${songList?.getSongResourceId(song.id)}.png!webp` : null} size={28} radius="md">
                    <IconPhotoOff />
                  </Avatar>
                  <Marquee>
                    <Text>{song?.title}</Text>
                  </Marquee>
                </Group>
              )}
            </Transition>
          </Modal.Title>
          <Space w="xs" />
          <Group wrap="nowrap" gap="xs">
            {score && <ScoreModalMenu score={score} onClose={onClose} />}
            <Modal.CloseButton />
          </Group>
        </Modal.Header>
        <Modal.Body p={0}>
          <Container ref={ref}>
            {isMaimaiScoreProps(score) && <MaimaiScoreModalContent score={score} song={song as MaimaiSongProps} />}
            {isChunithmScoreProps(score) && <ChunithmScoreModalContent score={score} song={song as ChunithmSongProps} />}
          </Container>
          <Space h="md" />
          <Accordion className={classes.accordion} chevronPosition="left" variant="filled" radius={0} defaultValue="history">
            <Accordion.Item value="history">
              <Accordion.Control>上传历史记录</Accordion.Control>
              <Accordion.Panel>
                {fetching ? (
                  <Center>
                    <Loader />
                  </Center>
                ) : (game === "maimai" ?
                  <MaimaiScoreHistory scores={historyScores as MaimaiScoreProps[]} /> :
                  <ChunithmScoreHistory scores={historyScores as ChunithmScoreProps[]} />
                )}
              </Accordion.Panel>
            </Accordion.Item>
            <Accordion.Item value="chart">
              <Accordion.Control>谱面详情</Accordion.Control>
              <Accordion.Panel>
                {isMaimaiScoreProps(score) && <MaimaiChart difficulty={difficulty as MaimaiDifficultyProps} />}
                {isChunithmScoreProps(score) && <ChunithmChart difficulty={difficulty as ChunithmDifficultyProps} />}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}