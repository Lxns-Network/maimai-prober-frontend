import { ScoreProps } from "./Score";
import { Avatar, Badge, Card, Group, Image, Loader, Modal, rem, Text } from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../utils/color";
import { getDifficulty, SongProps } from "../../utils/api/song";

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

export const ScoreModal = ({ score, song, opened, onClose }: ScoreModalProps) => {
  return (
    <Modal opened={opened} onClose={onClose} title="成绩详情" centered>
      {(score === null || song === null) ? (
        <Group position="center" mt="xl">
          <Loader />
        </Group>
      ) : (
        <ScoreModalContent score={score} song={song} />
      )}
    </Modal>
  );
}