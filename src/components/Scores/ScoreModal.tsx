import { ScoreProps } from "./Score";
import { Accordion, Avatar, Badge, Card, Container, Flex, Group, Image, Modal, rem, Space, Text } from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../utils/color";
import { getDifficulty, SongProps } from "../../utils/api/song";
import { useEffect, useState } from "react";
import { fetchAPI } from "../../utils/api/api.tsx";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import Icon from "@mdi/react";
import { mdiDatabaseOffOutline } from "@mdi/js";

interface ScoreModalProps {
  score: ScoreProps | null;
  song: SongProps | null;
  opened: boolean;
  onClose: () => void;
}

const ScoreModalContent = ({ score, song }: { score: ScoreProps, song: SongProps }) => {
  return (
    <>
      <Group noWrap>
        <Avatar src={`https://lxns.org/maimai/jacket/${score.id}.png`} size={94} radius="md">
          <Text align="center" fz="xs">曲绘加载失败</Text>
        </Avatar>
        <div style={{flex: 1}}>
          {score.type === "standard" ? (
            <Badge variant="filled" color="blue" size="sm">标准</Badge>
          ) : (
            <Badge variant="filled" color="orange" size="sm">DX</Badge>
          )}

          <Text fz="lg" fw={500}>{score.song_name}</Text>
          <Text fz="xs" c="dimmed">谱面 ID：{score.id}</Text>
          <Group spacing={0} ml={-3}>
            <Image
              src={`https://maimai.wahlap.com/maimai-mobile/img/music_icon_${score.fc || "back"}.png?ver=1.35`}
              width={rem(30)}
            />
            <Image
              src={`https://maimai.wahlap.com/maimai-mobile/img/music_icon_${score.fs || "back"}.png?ver=1.35`}
              width={rem(30)}
            />
          </Group>
        </div>
        <Card w={54} h={38} p={0} radius="md" withBorder style={{
          border: `2px solid ${getScoreSecondaryColor(score.level_index || 0)}`,
          backgroundColor: getScoreCardBackgroundColor(score.level_index || 0)
        }}>
          <Text size="xl" weight={500} align="center" color="white" style={{
            lineHeight: rem(34),
          }}>
            {getDifficulty(song, score.type, score.level_index)?.level_value.toFixed(1)}
          </Text>
        </Card>
      </Group>
      {score.achievements != -1 ? (
        <>
          <Group mt="md" ml={-5}>
            <Image
              src={`https://maimai.wahlap.com/maimai-mobile/img/music_icon_${score?.rate}.png?ver=1.35`}
              width={rem(64)}
            />
            <div>
              <Text fz="xs" c="dimmed">达成率</Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                {parseInt(String(score.achievements))}
                <span style={{ fontSize: rem(16) }}>.{
                  (String(score?.achievements).split(".")[1] || "0").padEnd(4, "0")
                }%</span>
              </Text>
            </div>
          </Group>
          <Group mt="md" spacing={22}>
            <div>
              <Text fz="xs" c="dimmed">DX Rating</Text>
              <Text fz="md">
                {parseInt(String(score.dx_rating))}
              </Text>
            </div>
            {score.play_time && (
              <div>
                <Text fz="xs" c="dimmed">游玩时间</Text>
                <Text fz="md">
                  {new Date(score.play_time || "").toLocaleString()}
                </Text>
              </div>
            )}
            <div>
              <Text fz="xs" c="dimmed">上传时间</Text>
              <Text fz="md">
                {new Date(score.upload_time || "").toLocaleString()}
              </Text>
            </div>
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

const ScoreHistoryPanel = ({ scores }: { scores: ScoreProps[] }) => {
  return (
    <Accordion.Item value="history">
      <Accordion.Control>上传历史记录</Accordion.Control>
      <Accordion.Panel>
        {scores.length < 2 ? (
          <Flex gap="xs" align="center" direction="column" mt="xs" c="dimmed">
            <Icon path={mdiDatabaseOffOutline} size={rem(64)} />
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
              <XAxis dataKey="upload_time" tickFormatter={(value) => new Date(value).toLocaleDateString("zh-CN", {
                month: "short",
                day: "numeric",
              })} />
              <YAxis width={40} />
              <CartesianGrid strokeDasharray="3 3" />
              <Tooltip
                labelFormatter={(value) => new Date(value).toLocaleDateString()}
                formatter={(value: string) => [parseInt(value), "DX Rating"]}
              />
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
  const [scores, setScores] = useState<ScoreProps[]>([]);
  const game = "maimai";

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
    }
  }

  const getScoreHistory = async (score: ScoreProps) => {
    if (score === null) {
      return;
    }

    try {
      const res = await fetchAPI(`user/${game}/player/score/history?song_id=${score.id}&song_type=${score.type}&level_index=${score.level_index}`, {
        method: "GET",
      })
      const data = await res.json();
      if (data.code !== 200) {
        return;
      }
      setScores(data.data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    setScores([]);
    getScoreHistory(score as ScoreProps);
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
          <Accordion chevronPosition="left">
            {scores && scores.length > 0 && (
              <ScoreHistoryPanel scores={scores} />
            )}
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}