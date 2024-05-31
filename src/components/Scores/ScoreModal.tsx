import { useContext, useEffect, useState } from "react";
import { MaimaiScoreProps } from "./maimai/Score.tsx";
import ScoreContext from "../../utils/context.tsx";
import { fetchAPI } from "../../utils/api/api.tsx";
import { Accordion, Center, Container, Group, Loader, Modal, Space } from "@mantine/core";
import { MaimaiScoreModalMenu } from "./maimai/ScoreModalMenu.tsx";
import { MaimaiScoreHistory } from "./maimai/ScoreHistory.tsx";
import { ChunithmScoreProps } from "./chunithm/Score.tsx";
import { MaimaiSongProps } from "../../utils/api/song/maimai.tsx";
import { ChunithmSongProps } from "../../utils/api/song/chunithm.tsx";
import { MaimaiScoreModalContent } from "./maimai/ScoreModal.tsx";
import { ChunithmScoreModalContent } from "./chunithm/ScoreModal.tsx";
import { ChunithmScoreHistory } from "./chunithm/ScoreHistory.tsx";
import { ChunithmScoreModalMenu } from "./chunithm/ScoreModalMenu.tsx";
import { MaimaiChart } from "./maimai/Chart.tsx";
import { openRetryModal } from "../../utils/modal.tsx";
import { ApiContext } from "../../App.tsx";
import classes from "./ScoreModal.module.css"
import { ChunithmChart } from "./chunithm/Chart.tsx";

interface ScoreModalProps {
  game: "maimai" | "chunithm";
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  opened: boolean;
  onClose: (score?: MaimaiScoreProps | ChunithmScoreProps) => void;
}

export const ScoreModal = ({ game, score, opened, onClose }: ScoreModalProps) => {
  const [historyScores, setHistoryScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [fetching, setFetching] = useState(true);
  const [difficulty, setDifficulty] = useState();
  const [song, setSong] = useState<MaimaiSongProps | ChunithmSongProps | null>(null);
  const context = useContext(ApiContext);
  const scoreContext = useContext(ScoreContext);

  const getSongDetailHandler = async (id: number) => {
    const res = await fetchAPI(`${game}/song/${id}`, {
      method: "GET",
    });
    const data = await res.json();
    setSong(data);
  }

  useEffect(() => {
    if (!score) return;

    setSong(context.songList.find(score.id))
    getSongDetailHandler(score.id);
  }, [score]);

  useEffect(() => {
    if (!song) return;

    if (isMaimaiScoreProps(score)) {
      setDifficulty(context.songList.getDifficulty(song, score.type, score.level_index));
    } else if (isChunithmScoreProps(score)) {
      setDifficulty(context.songList.getDifficulty(song, score.level_index));
    }
  }, [song]);

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
    if (!score) return;

    Object.keys(context).length !== 0 && scoreContext.setScore(score);
    setHistoryScores([]);
    getPlayerScoreHistory(score);
  }, [score]);

  function isMaimaiScoreProps(obj: any): obj is MaimaiScoreProps {
    if (!obj) return false;
    return typeof obj === 'object' && 'dx_rating' in obj;
  }

  function isChunithmScoreProps(obj: any): obj is ChunithmScoreProps {
    if (!obj) return false;
    return typeof obj === 'object' && 'rating' in obj;
  }

  return (
    <Modal.Root opened={opened} onClose={onClose} centered size="lg">
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>成绩详情</Modal.Title>
          <Group gap="xs">
            {isMaimaiScoreProps(score) && <MaimaiScoreModalMenu score={score} onClose={onClose} />}
            {isChunithmScoreProps(score) && <ChunithmScoreModalMenu score={score} onClose={onClose} />}
            <Modal.CloseButton />
          </Group>
        </Modal.Header>
        <Modal.Body p={0}>
          <Container>
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
                {isMaimaiScoreProps(score) && <MaimaiChart difficulty={difficulty as any} />}
                {isChunithmScoreProps(score) && <ChunithmChart difficulty={difficulty as any} />}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}