import { MaimaiScoreProps } from "./Score.tsx";
import {
  Accordion,
  Avatar,
  Badge,
  Box,
  Card,
  Container,
  Flex,
  Group,
  Image,
  Modal,
  rem,
  Space,
  Text
} from "@mantine/core";
import { getMaimaiScoreCardBackgroundColor, getMaimaiScoreSecondaryColor } from "../../../utils/color.tsx";
import { getDifficulty, MaimaiSongProps } from "../../../utils/api/song/maimai.tsx";
import { useEffect, useState } from "react";
import { fetchAPI } from "../../../utils/api/api.tsx";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { IconDatabaseOff, IconPhotoOff } from "@tabler/icons-react";

interface ScoreModalProps {
  score: MaimaiScoreProps | null;
  song: MaimaiSongProps | null;
  opened: boolean;
  onClose: () => void;
}

const ScoreModalContent = ({ score, song }: { score: MaimaiScoreProps, song: MaimaiSongProps }) => {
  return (
    <>
      <Group wrap="nowrap">
        <Avatar src={`https://lxns.org/maimai/jacket/${score.id}.png`} size={94} radius="md">
          <IconPhotoOff />
        </Avatar>
        <div style={{ flex: 1 }}>
          {score.type === "standard" ? (
            <Badge variant="filled" color="blue" size="sm">标准</Badge>
          ) : (
            <Badge variant="filled" color="orange" size="sm">DX</Badge>
          )}
          <Text fz="lg" fw={500} mt={2}>{score.song_name}</Text>
          <Text fz="xs" c="dimmed" mb={2}>谱面 ID：{score.id}</Text>
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
          border: `2px solid ${getMaimaiScoreSecondaryColor(score.level_index || 0)}`,
          backgroundColor: getMaimaiScoreCardBackgroundColor(score.level_index || 0)
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

const ScoreHistory = ({ scores }: { scores: MaimaiScoreProps[] }) => {
  return (
    <Accordion.Item value="history">
      <Accordion.Control>上传历史记录</Accordion.Control>
      <Accordion.Panel>
        {scores.length < 2 ? (
          <Flex gap="xs" align="center" direction="column" c="dimmed">
            <IconDatabaseOff size={64} />
            <Text fz="sm">历史记录不足，无法生成图表</Text>
          </Flex>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={scores} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dx_rating" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="upload_time" tickFormatter={(value) => new Date(value).toLocaleDateString('zh-CN', {
                month: "numeric",
                day: "numeric",
              })} />
              <YAxis width={40} domain={([dataMin, dataMax]) => {
                return [Math.floor(dataMin) - 10, Math.floor(dataMax) + 10];
              }} />
              <CartesianGrid strokeDasharray="3 3" />
              <Tooltip content={(props) => {
                if (!props.active || !props.payload || props.payload.length < 1) return null;
                const payload = props.payload[0].payload;
                return (
                  <Card p="xs" withBorder fz="sm">
                    <Text>{new Date(payload.upload_time).toLocaleDateString()}</Text>
                    <Text c="#8884d8">DX Rating: {parseInt(payload.dx_rating)}</Text>
                    <Text>{payload.achievements}%</Text>
                  </Card>
                )
              }} />
              <Area type="monotone" dataKey="dx_rating" stroke="#8884d8" fillOpacity={1} fill="url(#dx_rating)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  )
}

export const ScoreModal = ({ score, song, opened, onClose }: ScoreModalProps) => {
  // const [game] = useLocalStorage({ key: 'game', defaultValue: 'maimai' })
  const [scores, setScores] = useState<MaimaiScoreProps[]>([]);
  const game = "maimai";

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
    }
  }

  const getScoreHistory = async (score: MaimaiScoreProps) => {
    if (!score) return;

    try {
      const res = await fetchAPI(`user/${game}/player/score/history?song_id=${score.id}&song_type=${score.type}&level_index=${score.level_index}`, {
        method: "GET",
      })
      const data = await res.json();
      if (data.code !== 200) {
        return;
      }
      setScores(data.data.sort((a: MaimaiScoreProps, b: MaimaiScoreProps) => new Date(a.upload_time).getTime() - new Date(b.upload_time).getTime()));
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setScores([]);
    getScoreHistory(score as MaimaiScoreProps);
  }, [score]);

  return (
    <Modal.Root opened={opened} onClose={onClose} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>成绩详情</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p={0}>
          <Container>
            {score !== null && song !== null && (
              <ScoreModalContent score={score} song={song} />
            )}
          </Container>
          <Space h="md" />
          <Accordion chevronPosition="left" variant="filled" radius={0} defaultValue="history">
            {scores && scores.length > 0 && (
              <ScoreHistory scores={scores} />
            )}
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}