import { ChunithmScoreProps } from "./Score.tsx";
import {
  AspectRatio,
  Avatar,
  Box,
  Card, Center, Grid,
  Group,
  Image,
  NumberFormatter, Paper, Rating,
  rem,
  Stack,
  Text,
} from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../../utils/color.tsx";
import { getDifficulty, ChunithmSongProps, ChunithmDifficultyProps } from "../../../utils/api/song/chunithm.tsx";
import { IconPhotoOff } from "@tabler/icons-react";
import { PhotoView } from "react-photo-view";
import { Marquee } from "../../Marquee.tsx";
import classes from "../ScoreModal.module.css";
import { SongDisabledIndicator } from "../../SongDisabledIndicator.tsx";
import { ASSET_URL } from "../../../main.tsx";
import { useEffect, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import useSongListStore from "../../../hooks/useSongListStore.tsx";
import { useShallow } from "zustand/react/shallow";

export const ChunithmScoreModalContent = ({ score, song }: { score: ChunithmScoreProps, song: ChunithmSongProps }) => {
  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state.chunithm })),
  )
  const [difficulty, setDifficulty] = useState<ChunithmDifficultyProps | null>(null);

  const small = useMediaQuery('(max-width: 30rem)');

  useEffect(() => {
    if (!song) return;

    setDifficulty(getDifficulty(song, score.level_index));
  }, [song]);

  if (!song) return;

  return (
    <>
      <Group wrap="nowrap">
        <SongDisabledIndicator disabled={song.disabled}>
          <PhotoView src={`${ASSET_URL}/chunithm/jacket/${difficulty?.origin_id ?? songList.getSongResourceId(song.id)}.png`}>
            <Avatar src={`${ASSET_URL}/chunithm/jacket/${difficulty?.origin_id ?? songList.getSongResourceId(song.id)}.png!webp`} size={94} radius="md">
              <IconPhotoOff />
            </Avatar>
          </PhotoView>
        </SongDisabledIndicator>
        <div style={{ flex: 1 }}>
          <Marquee>
            <Text fz="lg" fw={500}>{song.title}</Text>
          </Marquee>
          <Text fz="xs" c="dimmed">曲目 ID：{song.id}</Text>
          {difficulty?.origin_id && <Text fz="xs" c="dimmed">原曲 ID：{difficulty?.origin_id}</Text>}
          <Group gap="xs" mt={8}>
            <AspectRatio ratio={132 / 24}>
              <Image
                src={`/assets/chunithm/music_icon/${score.full_combo || "fullcombo_blank"}.webp`}
                w={rem(94)}
              />
            </AspectRatio>
            <AspectRatio ratio={132 / 24}>
              <Image
                src={`/assets/chunithm/music_icon/${score.full_chain || "fullchain_blank"}.webp`}
                w={rem(94)}
              />
            </AspectRatio>
          </Group>
        </div>
        {difficulty?.star ? (
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
        ) : (
          <Card w={54} h={38} p={0} radius="md" withBorder style={{
            border: `2px solid ${getScoreSecondaryColor("chunithm", score.level_index || 0)}`,
            backgroundColor: getScoreCardBackgroundColor("chunithm", score.level_index || 0)
          }}>
            <Text size="xl" fw={500} ta="center" c="white" style={{
              lineHeight: rem(34),
            }}>
              {difficulty ? difficulty.level_value.toFixed(1) : "?"}
            </Text>
          </Card>
        )}
      </Group>
      {score.score < 0 ? (
        <Text fz="md" mt="md">
          你还未游玩此谱面，或未上传至查分器。
        </Text>
      ) : (
        <>
          <Group mt="md">
            <Stack gap={8}>
              <AspectRatio ratio={132 / 24}>
                <Image
                  src={`/assets/chunithm/music_rank/${score.rank}.webp`}
                  w={rem(94)}
                />
              </AspectRatio>
              <AspectRatio ratio={132 / 24}>
                <Image
                  src={`/assets/chunithm/music_icon/${score.clear}.webp`}
                  w={rem(94)}
                />
              </AspectRatio>
            </Stack>
            <Box>
              <Text fz="xs" c="dimmed">成绩</Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                <NumberFormatter value={score.score || 0} thousandSeparator />
              </Text>
            </Box>
          </Group>
          <Grid mt="md">
            <Grid.Col span={6}>
              <Paper className={classes.subParameters}>
                <Text fz="xs" c="dimmed">Rating</Text>
                <Text fz="md">
                  {song.id >= 8000 ? "-" : Math.floor(score.rating * 100) / 100}
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={6}>
              <Paper className={classes.subParameters}>
                <Text fz="xs" c="dimmed">OVER POWER</Text>
                <Text fz="md">
                  {!score.over_power ? "-" : `${Math.floor(score.over_power * 100) / 100}%`}
                </Text>
              </Paper>
            </Grid.Col>
            {score.play_time && (
              <Grid.Col span={small ? 12 : 6}>
                <Paper className={classes.subParameters}>
                  <Text fz="xs" c="dimmed">游玩时间</Text>
                  <Text fz="md">
                    {new Date(score.play_time || "").toLocaleString()}
                  </Text>
                </Paper>
              </Grid.Col>
            )}
            <Grid.Col span={small ? 12 : 6}>
              <Paper className={classes.subParameters}>
                <Text fz="xs" c="dimmed">上传时间</Text>
                <Text fz="md">
                  {new Date(score.upload_time || "").toLocaleString()}
                </Text>
              </Paper>
            </Grid.Col>
          </Grid>
        </>
      )}
    </>
  )
}