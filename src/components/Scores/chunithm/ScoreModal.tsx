import { ChunithmScoreProps } from "./Score.tsx";
import {
  Avatar,
  Box,
  Card,
  Container,
  Group,
  Image,
  Modal,
  rem, Space,
  Text
} from "@mantine/core";
import {
  getChunithmScoreCardBackgroundColor,
  getChunithmScoreSecondaryColor,
} from "../../../utils/color.tsx";
import { getDifficulty, ChunithmSongProps } from "../../../utils/api/song/chunithm.tsx";
import { useEffect } from "react";
import { IconPhotoOff } from "@tabler/icons-react";

interface ScoreModalProps {
  score: ChunithmScoreProps | null;
  song: ChunithmSongProps | null;
  opened: boolean;
  onClose: () => void;
}

const ScoreModalContent = ({ score, song }: { score: ChunithmScoreProps, song: ChunithmSongProps }) => {
  return (
    <>
      <Group noWrap>
        <Avatar src={`https://lxns.org/chunithm/jacket/${score.id}.png`} size={94} radius="md">
          <IconPhotoOff />
        </Avatar>
        <div style={{ flex: 1 }}>
          <Text fz="lg" fw={500} mt={2}>{score.song_name}</Text>
          <Text fz="xs" c="dimmed" mb={8}>谱面 ID：{score.id}</Text>
          <Group spacing="xs">
            <Image
              src={`/assets/chunithm/music_icon/${score.full_combo || "failed"}.webp`}
              width={rem(94)}
            />
            {score.full_sync && (
              <Image
                src={`/assets/chunithm/music_icon/${score.full_sync}.webp`}
                width={rem(94)}
              />
            )}
          </Group>
        </div>
        <Card w={54} h={38} p={0} radius="md" withBorder style={{
          border: `2px solid ${getChunithmScoreSecondaryColor(score.level_index || 0)}`,
          backgroundColor: getChunithmScoreCardBackgroundColor(score.level_index || 0)
        }}>
          <Text size="xl" weight={500} align="center" color="white" style={{
            lineHeight: rem(34),
          }}>
            {getDifficulty(song, score.level_index).level_value.toFixed(1)}
          </Text>
        </Card>
      </Group>
      {score.score != -1 ? (
        <>
          <Group mt="md">
            <Image
              src={`/assets/chunithm/music_rank/${score.rank}.webp`}
              width={rem(94)}
            />
            <Box>
              <Text fz="xs" c="dimmed">成绩</Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                {(score.score || 0).toLocaleString('en-US', { useGrouping: true })}
              </Text>
            </Box>
          </Group>
          <Group mt="md">
            <Box mr={12}>
              <Text fz="xs" c="dimmed">Rating</Text>
              <Text fz="md">
                {score.rating}
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
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
    }
  }

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
  }, []);

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
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}