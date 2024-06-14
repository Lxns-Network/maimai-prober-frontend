import { MaimaiScoreProps } from "./Score.tsx";
import {
  Avatar,
  Badge,
  Box,
  Card,
  Group,
  Image,
  rem,
  Text,
} from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../../utils/color.tsx";
import { getDifficulty, MaimaiSongProps } from "../../../utils/api/song/maimai.tsx";
import { IconPhotoOff } from "@tabler/icons-react";
import { PhotoView } from "react-photo-view";
import { CustomMarquee } from "../../CustomMarquee.tsx";

const MaimaiUtageScoreModalContent = ({ score, song }: { score: MaimaiScoreProps, song: MaimaiSongProps }) => {
  const difficulty = getDifficulty(song, "utage", 0);

  return (
    <>
      <Group wrap="nowrap">
        <PhotoView src={`https://assets.lxns.net/maimai/jacket/${song.id%10000}.png`}>
          <Avatar src={`https://assets.lxns.net/maimai/jacket/${song.id%10000}.png!webp`} size={94} radius="md">
            <IconPhotoOff />
          </Avatar>
        </PhotoView>
        <div style={{ flex: 1 }}>
          <Group gap={6}>
            {difficulty.is_buddy && (
              <Badge variant="filled" color="rgb(73, 9, 10)" size="sm">BUDDY</Badge>
            )}
          </Group>
          <CustomMarquee>
            <Text fz="lg" fw={500} mt={2}>{song.title}</Text>
          </CustomMarquee>
          <Text fz="xs" c="dimmed" mb={2}>曲目 ID：{song.id}</Text>
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
          border: `2px solid rgb(204, 12, 175)`,
          backgroundColor: "rgb(234, 61, 232)",
        }}>
          <Text size="xl" fw={500} ta="center" c="white" style={{
            lineHeight: rem(34),
          }}>
            {difficulty.level}
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

export const MaimaiScoreModalContent = ({ score, song }: { score: MaimaiScoreProps, song: MaimaiSongProps }) => {
  if (song.id > 100000) {
    return <MaimaiUtageScoreModalContent score={score} song={song} />
  }

  return (
    <>
      <Group wrap="nowrap">
        <PhotoView src={`https://assets.lxns.net/maimai/jacket/${song.id}.png`}>
          <Avatar src={`https://assets.lxns.net/maimai/jacket/${song.id}.png!webp`} size={94} radius="md">
            <IconPhotoOff />
          </Avatar>
        </PhotoView>
        <div style={{ flex: 1 }}>
          {score.type === "standard" ? (
            <Badge variant="filled" color="blue" size="sm">标准</Badge>
          ) : (
            <Badge variant="filled" color="orange" size="sm">DX</Badge>
          )}
          <CustomMarquee>
            <Text fz="lg" fw={500} mt={2}>{song.title}</Text>
          </CustomMarquee>
          <Text fz="xs" c="dimmed" mb={2}>曲目 ID：{song.id}</Text>
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