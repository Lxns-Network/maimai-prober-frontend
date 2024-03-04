import { ChunithmScoreProps } from "./Score.tsx";
import {
  Avatar,
  Box,
  Card,
  Container,
  Group,
  Image,
  Modal, NumberFormatter,
  rem, Space,
  Text, Accordion, Center, Loader
} from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../../utils/color.tsx";
import { getDifficulty, ChunithmSongProps } from "../../../utils/api/song/chunithm.tsx";
import { useContext, useEffect, useState } from "react";
import { IconPhotoOff } from "@tabler/icons-react";
import { ScoreModalMenu } from "./ScoreModalMenu.tsx";
import ScoreContext from "../../../utils/context.tsx";
import { ScoreHistory } from "./ScoreHistory.tsx";
import { fetchAPI } from "../../../utils/api/api.tsx";

interface ScoreModalProps {
  score: ChunithmScoreProps | null;
  song: ChunithmSongProps | null;
  opened: boolean;
  onClose: (score?: ChunithmScoreProps) => void;
}

const ScoreModalContent = ({ score, song }: { score: ChunithmScoreProps, song: ChunithmSongProps }) => {
  return (
    <>
      <Group wrap="nowrap">
        <Avatar src={`https://assets.lxns.net/chunithm/jacket/${score.id}.png!webp`} size={94} radius="md">
          <IconPhotoOff />
        </Avatar>
        <div style={{ flex: 1 }}>
          <Text fz="lg" fw={500} mt={2}>{score.song_name}</Text>
          <Text fz="xs" c="dimmed" mb={8}>曲目 ID：{score.id}</Text>
          <Group gap="xs">
            {score.clear === "failed" && (
              <Image
                src={`/assets/chunithm/music_icon/failed.webp`}
                w={rem(94)}
              />
            )}
            {score.clear === "clear" && !score.full_combo && (
              <Image
                src={`/assets/chunithm/music_icon/clear.webp`}
                w={rem(94)}
              />
            )}
            {score.full_combo && (
              <Image
                src={`/assets/chunithm/music_icon/${score.full_combo}.webp`}
                w={rem(94)}
              />
            )}
            {score.full_chain && (
              <Image
                src={`/assets/chunithm/music_icon/${score.full_chain}.webp`}
                w={rem(94)}
              />
            )}
          </Group>
        </div>
        <Card w={54} h={38} p={0} radius="md" withBorder style={{
          border: `2px solid ${getScoreSecondaryColor("chunithm", score.level_index || 0)}`,
          backgroundColor: getScoreCardBackgroundColor("chunithm", score.level_index || 0)
        }}>
          <Text size="xl" fw={500} ta="center" c="white" style={{
            lineHeight: rem(34),
          }}>
            {getDifficulty(song, score.level_index).level_value.toFixed(1)}
          </Text>
        </Card>
      </Group>
      {score.score < 0 ? (
        <Text fz="md" mt="md">
          你还未游玩此谱面，或未上传至查分器。
        </Text>
      ) : (
        <>
          <Group mt="md">
            <Image
              src={`/assets/chunithm/music_rank/${score.rank}.webp`}
              w={rem(94)}
            />
            <Box>
              <Text fz="xs" c="dimmed">成绩</Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                <NumberFormatter value={score.score || 0} thousandSeparator />
              </Text>
            </Box>
          </Group>
          <Group mt="md">
            <Box mr={12}>
              <Text fz="xs" c="dimmed">Rating</Text>
              <Text fz="md">
                {Math.floor(score.rating * 100) / 100}
              </Text>
            </Box>
            {score.play_time && (
              <Box mr={12}>
                <Text fz="xs" c="dimmed">游玩时间</Text>
                <Text fz="md">
                  {new Date(score.play_time || "").toLocaleString()}
                </Text>
              </Box>
            )}
            <Box>
              <Text fz="xs" c="dimmed">上传时间</Text>
              <Text fz="md">
                {new Date(score.upload_time || "").toLocaleString()}
              </Text>
            </Box>
          </Group>
        </>
      )}
    </>
  )
}

export const ScoreModal = ({ score, song, opened, onClose }: ScoreModalProps) => {
  const [historyScores, setHistoryScores] = useState<ChunithmScoreProps[]>([]);
  const [fetching, setFetching] = useState(true);
  const context = useContext(ScoreContext);

  const getPlayerScoreHistory = async (score: ChunithmScoreProps) => {
    if (score.score < 0) {
      setHistoryScores([]);
      setFetching(false);
      return;
    }
    setFetching(true);
    try {
      const res = await fetchAPI(`user/chunithm/player/score/history?song_id=${score.id}&level_index=${score.level_index}`, {
        method: "GET",
      })
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      if (data.data) {
        setHistoryScores(data.data.sort((a: ChunithmScoreProps, b: ChunithmScoreProps) => {
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

    context.setScore(score);
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
              <ScoreModalMenu score={score} onClose={onClose} />
            )}
            <Modal.CloseButton />
          </Group>
        </Modal.Header>
        <Modal.Body p={0}>
          <Container>
            {score !== null && song !== null && (
              <ScoreModalContent score={score} song={song} />
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
                  <ScoreHistory scores={historyScores} />
                )}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}