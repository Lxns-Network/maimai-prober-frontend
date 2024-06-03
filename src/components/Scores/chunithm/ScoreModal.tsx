import { ChunithmScoreProps } from "./Score.tsx";
import {
  Avatar,
  Box,
  Card, Center,
  Group,
  Image,
  NumberFormatter, Rating,
  rem,
  Text,
} from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../../utils/color.tsx";
import { getDifficulty, ChunithmSongProps } from "../../../utils/api/song/chunithm.tsx";
import { IconPhotoOff } from "@tabler/icons-react";
import { PhotoView } from "react-photo-view";
import { CustomMarquee } from "../../CustomMarquee.tsx";
import classes from "./ScoreModal.module.css";

const ChunithmWorldsEndScoreModalContent = ({ score, song }: { score: ChunithmScoreProps, song: ChunithmSongProps }) => {
  const difficulty = getDifficulty(song, score.level_index);
  if (!difficulty) {
    return null;
  }

  return (
    <>
      <Group wrap="nowrap">
        <PhotoView src={`https://assets.lxns.net/chunithm/jacket/${difficulty.origin_id}.png`}>
          <Avatar src={`https://assets.lxns.net/chunithm/jacket/${difficulty.origin_id}.png!webp`} size={94} radius="md">
            <IconPhotoOff />
          </Avatar>
        </PhotoView>
        <div style={{ flex: 1 }}>
          <CustomMarquee>
            <Text fz="lg" fw={500}>{song.title}</Text>
          </CustomMarquee>
          <Text fz="xs" c="dimmed">曲目 ID：{song.id}</Text>
          <Text fz="xs" c="dimmed" mb={8}>原曲 ID：{difficulty.origin_id}</Text>
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
        <Card w={60} h={54} p={0} radius="md" style={{
          border: "2px solid rgb(14, 45, 56)",
        }}>
          <Center pb={1} style={{
            backgroundColor: "rgb(14, 45, 56)",
          }}>
            <Rating count={difficulty.star} value={5} size={10} readOnly />
          </Center>
          <Text className={classes.worldsEndText} fz={24} fw={700} ta="center">
            {difficulty.kanji}
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

export const ChunithmScoreModalContent = ({ score, song }: { score: ChunithmScoreProps, song: ChunithmSongProps }) => {
  if (song.id >= 8000) {
    return <ChunithmWorldsEndScoreModalContent score={score} song={song} />
  }

  return (
    <>
      <Group wrap="nowrap">
        <PhotoView src={`https://assets.lxns.net/chunithm/jacket/${song.id}.png`}>
          <Avatar src={`https://assets.lxns.net/chunithm/jacket/${song.id}.png!webp`} size={94} radius="md">
            <IconPhotoOff />
          </Avatar>
        </PhotoView>
        <div style={{ flex: 1 }}>
          <CustomMarquee>
            <Text fz="lg" fw={500}>{song.title}</Text>
          </CustomMarquee>
          <Text fz="xs" c="dimmed" mb={8}>曲目 ID：{song.id}</Text>
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
            {getDifficulty(song, score.level_index)?.level_value.toFixed(1)}
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