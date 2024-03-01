import { MaimaiScoreProps } from "./Score.tsx";
import {
  Accordion,
  Avatar,
  Badge,
  Box,
  Card, Center,
  Container,
  Group,
  Image, Loader,
  Modal,
  rem,
  Space,
  Text,
} from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../../utils/color.tsx";
import { getDifficulty, MaimaiSongProps } from "../../../utils/api/song/maimai.tsx";
import { useContext, useEffect, useState } from "react";
import { fetchAPI } from "../../../utils/api/api.tsx";
import { IconPhotoOff } from "@tabler/icons-react";
import { ScoreHistory } from "./ScoreHistory.tsx";
import { ScoreModalMenu } from "./ScoreModalMenu.tsx";
import ScoreContext from "../../../utils/context.tsx";
import { PhotoView } from "react-photo-view";

interface ScoreModalProps {
  score: MaimaiScoreProps | null;
  song: MaimaiSongProps | null;
  opened: boolean;
  onClose: (score?: MaimaiScoreProps) => void;
}

const ScoreModalContent = ({ score, song }: { score: MaimaiScoreProps, song: MaimaiSongProps }) => {
  return (
    <>
      <Group wrap="nowrap">
        <PhotoView src={`https://assets.lxns.net/maimai/jacket/${score.id}.png`}>
          <Avatar src={`https://assets.lxns.net/maimai/jacket/${score.id}.png!webp`} size={94} radius="md">
            <IconPhotoOff />
          </Avatar>
        </PhotoView>
        <div style={{ flex: 1 }}>
          {score.type === "standard" ? (
            <Badge variant="filled" color="blue" size="sm">标准</Badge>
          ) : (
            <Badge variant="filled" color="orange" size="sm">DX</Badge>
          )}
          <Text fz="lg" fw={500} mt={2}>{score.song_name}</Text>
          <Text fz="xs" c="dimmed" mb={2}>曲目 ID：{score.id}</Text>
          <Group gap={0} ml={-3}>
            <Image
              src={`/assets/maimai/music_icon/${score.fc || "blank"}.webp`}
              w={rem(30)}
            />
            <Image
              src={`/assets/maimai/music_icon/${score.fs || "blank"}.webp`}
              w={rem(30)}
            />
          </Group>
        </div>
        <Card w={54} h={38} p={0} radius="md" withBorder style={{
          border: `2px solid ${getScoreSecondaryColor("maimai", score.level_index)}`,
          backgroundColor: getScoreCardBackgroundColor("maimai", score.level_index),
        }}>
          <Text size="xl" fw={500} ta="center" c="white" style={{
            lineHeight: rem(34),
          }}>
            {getDifficulty(song, score.type, score.level_index).level_value.toFixed(1)}
          </Text>
        </Card>
      </Group>
      {score.achievements != -1 ? (
        <>
          <Group mt="md">
            <Image
              src={`/assets/maimai/music_rank/${score?.rate}.webp`}
              w={rem(64)}
            />
            <Box>
              <Text fz="xs" c="dimmed">达成率</Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                {parseInt(String(score.achievements))}
                <span style={{ fontSize: rem(16) }}>.{
                  (String(score?.achievements).split(".")[1] || "0").padEnd(4, "0")
                }%</span>
              </Text>
            </Box>
          </Group>
          <Group mt="md">
            <Box mr={12}>
              <Text fz="xs" c="dimmed">DX Rating</Text>
              <Text fz="md">
                {parseInt(String(score.dx_rating))}
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
      ) : (
        <Text fz="md" mt="md">
          你还未游玩此谱面，或未上传至查分器。
        </Text>
      )}
    </>
  )
}

export const ScoreModal = ({ score, song, opened, onClose }: ScoreModalProps) => {
  const [historyScores, setHistoryScores] = useState<MaimaiScoreProps[]>([]);
  const [fetching, setFetching] = useState(true);
  const context = useContext(ScoreContext);

  const getPlayerScoreHistory = async (score: MaimaiScoreProps) => {
    if (score.achievements < 0) {
      setHistoryScores([]);
      setFetching(false);
      return;
    }
    setFetching(true);
    try {
      const res = await fetchAPI(`user/maimai/player/score/history?song_id=${score.id}&song_type=${score.type}&level_index=${score.level_index}`, {
        method: "GET",
      })
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      if (data.data) {
        setHistoryScores(data.data.sort((a: MaimaiScoreProps, b: MaimaiScoreProps) => {
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