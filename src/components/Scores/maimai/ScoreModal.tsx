import { MaimaiScoreProps } from "./Score.tsx";
import {
  Avatar,
  Badge,
  Box,
  Card, Grid,
  Group,
  Image, Paper,
  rem,
  Text,
} from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "../../../utils/color.tsx";
import {
  getDifficulty,
  MaimaiDifficultyProps,
  MaimaiNotesProps,
  MaimaiSongProps
} from "../../../utils/api/song/maimai.tsx";
import { IconPhotoOff } from "@tabler/icons-react";
import { PhotoView } from "react-photo-view";
import { CustomMarquee } from "../../CustomMarquee.tsx";
import { SongDisabledIndicator } from "../../SongDisabledIndicator.tsx";
import { ASSET_URL } from "../../../main.tsx";
import { useContext, useEffect, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import classes from "../ScoreModal.module.css";
import { ApiContext } from "../../../App.tsx";

export const MaimaiScoreModalContent = ({ score, song }: { score: MaimaiScoreProps, song: MaimaiSongProps }) => {
  const [difficulty, setDifficulty] = useState<MaimaiDifficultyProps | null>(null);
  const [level, setLevel] = useState(score.level);

  const context = useContext(ApiContext);
  const songList = context.songList.maimai;
  const small = useMediaQuery('(max-width: 30rem)');

  const levelIndex = score.type !== "utage" ? score.level_index : 5;

  useEffect(() => {
    if (!song) return;

    const difficulty = getDifficulty(song, score.type, score.level_index);
    if (!difficulty) return;
    setDifficulty(difficulty);
    if (score.type === "utage") return;
    setLevel(difficulty.level_value.toFixed(1));
  }, [song]);

  if (!song) return;

  return (
    <>
      <Group wrap="nowrap">
        <SongDisabledIndicator disabled={song.disabled}>
          <PhotoView src={`${ASSET_URL}/maimai/jacket/${songList.getSongResourceId(song.id)}.png`}>
            <Avatar src={`${ASSET_URL}/maimai/jacket/${songList.getSongResourceId(song.id)}.png!webp`} size={94} radius="md">
              <IconPhotoOff />
            </Avatar>
          </PhotoView>
        </SongDisabledIndicator>
        <div style={{ flex: 1 }}>
          {score.type === "standard" && <Badge variant="filled" color="blue" size="sm">标准</Badge>}
          {score.type === "dx" && <Badge variant="filled" color="orange" size="sm">DX</Badge>}
          {difficulty?.is_buddy && <Badge variant="filled" color="rgb(73, 9, 10)" size="sm">BUDDY</Badge>}
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
          border: `2px solid ${getScoreSecondaryColor("maimai", levelIndex)}`,
          backgroundColor: getScoreCardBackgroundColor("maimai", levelIndex),
        }}>
          <Text size="xl" fw={500} ta="center" c="white" style={{
            lineHeight: rem(34),
          }}>
            {level}
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
          <Grid mt="md">
            <Grid.Col span={6}>
              <Paper className={classes.subparameters}>
                <Text fz="xs" c="dimmed">DX Rating</Text>
                <Text>
                  {score.type === "utage" ? "-" : parseInt(String(score.dx_rating))}
                </Text>
              </Paper>
            </Grid.Col>
            <Grid.Col span={6}>
              <Paper className={classes.subparameters}>
                <Group wrap="nowrap" gap="xs">
                  <Text fz="xs" c="dimmed">DX 分数</Text>
                  <Group wrap="nowrap" h={12} gap={0}>
                    {(() => {
                      if (!difficulty || !difficulty.notes) return null;

                      let percentage: number;
                      if (difficulty.is_buddy) {
                        percentage = Math.floor((score.dx_score / (difficulty.notes["left" as keyof MaimaiNotesProps] + difficulty.notes["right" as keyof MaimaiNotesProps]) * 3) * 100);
                      } else {
                        percentage = Math.floor((score.dx_score / (difficulty.notes.total * 3)) * 100);
                      }
                      let count = 0;
                      let rate = 1;

                      if (percentage >= 97) {
                        count = 5;
                        rate = 3;
                      } else if (percentage >= 95) {
                        count = 4;
                        rate = 2;
                      } else if (percentage >= 93) {
                        count = 3;
                        rate = 2;
                      } else if (percentage >= 90) {
                        count = 2;
                      } else if (percentage >= 85) {
                        count = 1;
                      }

                      return Array.from({ length: count }).map((_, index) => (
                        <Image key={index} src={`/assets/maimai/dx_score/${rate}.webp`} h="100%" />
                      ));
                    })()}
                  </Group>
                </Group>
                {difficulty && difficulty.notes ? <Text>
                  {score.dx_score}
                  <span style={{ fontSize: 12, marginLeft: 4 }}>
                    / {difficulty.notes.total * 3}
                  </span>
                </Text> : <Text>{score.dx_score}</Text>}
              </Paper>
            </Grid.Col>
            {score.play_time && (
              <Grid.Col span={small ? 12 : 6}>
                <Paper className={classes.subparameters}>
                  <Text fz="xs" c="dimmed">游玩时间</Text>
                  <Text>{new Date(score.play_time || "").toLocaleString()}</Text>
                </Paper>
              </Grid.Col>
            )}
            <Grid.Col span={small ? 12 : 6}>
              <Paper className={classes.subparameters}>
                <Text fz="xs" c="dimmed">上传时间</Text>
                <Text fz="md">{new Date(score.upload_time || "").toLocaleString()}</Text>
              </Paper>
            </Grid.Col>
          </Grid>
        </>
      ) : (
        <Text fz="md" mt="md">
          你还未游玩此谱面，或未上传至查分器。
        </Text>
      )}
    </>
  )
}