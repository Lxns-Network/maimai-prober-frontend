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

interface ScoreModalProps {
  game: "maimai" | "chunithm";
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  song: MaimaiSongProps | ChunithmSongProps | null;
  opened: boolean;
  onClose: (score?: MaimaiScoreProps | ChunithmScoreProps) => void;
}

export const ScoreModal = ({ game, score, song, opened, onClose }: ScoreModalProps) => {
  const [historyScores, setHistoryScores] = useState<(MaimaiScoreProps | ChunithmScoreProps)[]>([]);
  const [fetching, setFetching] = useState(true);
  const context = useContext(ScoreContext);

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
    } catch (err) {
      console.error(err);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!score) return;

    Object.keys(context).length !== 0 && context.setScore(score);
    setHistoryScores([]);
    getPlayerScoreHistory(score);
  }, [score]);

  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>成绩详情</Modal.Title>
          <Group gap="xs">
            {score !== null && (
              game === "maimai" ?
                <MaimaiScoreModalMenu score={score as MaimaiScoreProps} onClose={onClose} /> :
                <ChunithmScoreModalMenu score={score as ChunithmScoreProps} onClose={onClose} />
            )}
            <Modal.CloseButton />
          </Group>
        </Modal.Header>
        <Modal.Body p={0}>
          <Container>
            {score !== null && song !== null && (
              game === "maimai" ?
                <MaimaiScoreModalContent score={score as MaimaiScoreProps} song={song as MaimaiSongProps} /> :
                <ChunithmScoreModalContent score={score as ChunithmScoreProps} song={song as ChunithmSongProps} />
            )}
          </Container>
          <Space h="md" />
          <Accordion chevronPosition="left" variant="filled" radius={0} defaultValue="history">
            <Accordion.Item value="history">
              <Accordion.Control>上传历史记录</Accordion.Control>
              <Accordion.Panel>
                {fetching ? (
                  <Center>
                    <Loader />
                  </Center>
                ) : (
                  game === "maimai" ?
                    <MaimaiScoreHistory scores={historyScores as MaimaiScoreProps[]} /> :
                    <ChunithmScoreHistory scores={historyScores as ChunithmScoreProps[]} />
                )}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}