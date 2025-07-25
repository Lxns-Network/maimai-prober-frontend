import {
  AspectRatio, Avatar, Badge, Box, Button, Grid, Group, Image, NumberFormatter, Paper, rem, Text, Tooltip
} from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "@/utils/color.ts";
import { getDifficulty, MaimaiDifficultyProps, MaimaiNotesProps, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { IconChevronRight, IconNumber, IconPhotoOff } from "@tabler/icons-react";
import { PhotoView } from "react-photo-view";
import { Marquee } from "../../Marquee.tsx";
import { SongDisabledIndicator } from "../../SongDisabledIndicator.tsx";
import { ASSET_URL } from "@/main.tsx";
import { useEffect, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import classes from "../ScoreModal.module.css";
import { useShallow } from "zustand/react/shallow";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { RatingHistoryModal } from "../RatingHistoryModal.tsx";
import { DeluxeRatingCalculator } from "./DeluxeRatingCalculator.tsx";
import { DeluxeScoreDetail } from "./DeluxeScoreDetail.tsx";
import { MaimaiScoreProps } from "@/types/score";

export function getTotalNotes(notes: MaimaiNotesProps) {
  if (notes.total) {
    return notes.total;
  }
  return (notes.left?.total || 0) + (notes.right?.total || 0);
}

export function getDeluxeScoreStars(deluxeScore: number, notes: MaimaiNotesProps) {
  const totalNotes = getTotalNotes(notes);
  const percentage = Math.floor((deluxeScore / (totalNotes * 3)) * 100);

  let count = 0;
  let rate: 1 | 2 | 3 = 1;

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

  return { count, rate };
}

export const DeluxeScoreStars = ({ deluxeScore, notes }: { deluxeScore: number, notes: MaimaiNotesProps }) => {
  const { count, rate } = getDeluxeScoreStars(deluxeScore, notes);

  return Array.from({ length: count }).map((_, index) => (
    <Image key={index} src={`/assets/maimai/dx_score/${rate}.webp`} h="100%" w="auto" />
  ));
}

export const MaimaiScoreModalContent = ({ score, song }: { score: MaimaiScoreProps, song: MaimaiSongProps }) => {
  const { songList } = useSongListStore(
    useShallow((state) => ({ songList: state.maimai })),
  )
  const [difficulty, setDifficulty] = useState<MaimaiDifficultyProps | null>(null);
  const [level, setLevel] = useState(score.level);
  const [ratingHistoryOpened, setRatingHistoryOpened] = useState(false);
  const [calculatorOpened, setCalculatorOpened] = useState(false);
  const [deluxeScoreOpened, setDeluxeScoreOpened] = useState(false);

  const levelIndex = score.type !== "utage" ? score.level_index : 5;
  const small = useMediaQuery('(max-width: 30rem)');

  useEffect(() => {
    if (!song) return;

    const difficulty = getDifficulty(song, score.type, score.level_index);
    if (!difficulty) return;
    setDifficulty(difficulty);
    if (score.type === "utage") {
      setLevel(difficulty.level);
    } else {
      setLevel(difficulty.level_value.toFixed(1));
    }
  }, [song]);

  if (!song) return;

  return (
    <>
      <RatingHistoryModal
        song={song}
        difficulty={difficulty}
        opened={ratingHistoryOpened}
        onClose={() => setRatingHistoryOpened(false)}
      />
      <DeluxeRatingCalculator
        defaultAchievements={score.achievements}
        defaultDeluxeRating={score.dx_rating}
        defaultLevelValue={difficulty?.level_value}
        opened={calculatorOpened}
        onClose={() => setCalculatorOpened(false)}
      />
      <DeluxeScoreDetail
        deluxeScore={score.dx_score || 0}
        notes={difficulty?.notes}
        opened={deluxeScoreOpened}
        onClose={() => setDeluxeScoreOpened(false)}
      />
      <Group wrap="nowrap">
        <SongDisabledIndicator disabled={song.disabled}>
          <PhotoView src={`${ASSET_URL}/maimai/jacket/${songList.getSongResourceId(song.id)}.png`}>
            <Avatar src={`${ASSET_URL}/maimai/jacket/${songList.getSongResourceId(song.id)}.png!webp`} size={94} radius="md">
              <IconPhotoOff />
            </Avatar>
          </PhotoView>
        </SongDisabledIndicator>
        <div style={{ flex: 1 }}>
          <Group gap={8}>
            {score.type === "standard" && <Badge variant="filled" color="blue" size="sm">标准</Badge>}
            {score.type === "dx" && <Badge variant="filled" color="orange" size="sm">DX</Badge>}
            {difficulty?.is_buddy && <Badge variant="filled" color="rgb(73, 9, 10)" size="sm">BUDDY</Badge>}
            <Badge variant="light" color="gray" size="sm" leftSection={<IconNumber size={18} />}>{song.id}</Badge>
          </Group>
          <Marquee>
            <Text fz="lg" fw={500} mt={4}>{song.title}</Text>
          </Marquee>
          <Text fz="xs" c="dimmed" mb={4}>{song.artist}</Text>
          <Group gap={0} ml={-3} mb={-3}>
            <AspectRatio ratio={1}>
              <Image
                src={`/assets/maimai/music_icon/${score.fc || "blank"}.webp`}
                w={rem(30)}
              />
            </AspectRatio>
            <AspectRatio ratio={1}>
              <Image
                src={`/assets/maimai/music_icon/${score.fs || "blank"}.webp`}
                w={rem(30)}
              />
            </AspectRatio>
          </Group>
        </div>
        <Tooltip label="查看谱面历史定数">
          <Button w={54} h={38} p={0} radius="md" style={{
            border: `2px solid ${getScoreSecondaryColor("maimai", levelIndex)}`,
            backgroundColor: getScoreCardBackgroundColor("maimai", levelIndex),
          }} onClick={() => setRatingHistoryOpened(true)}>
            <Text size="xl" fw={500} ta="center" c="white" style={{
              lineHeight: rem(34),
            }}>
              {level}
            </Text>
          </Button>
        </Tooltip>
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
              {score.type === "utage" ? (
                <Paper className={classes.subParameters}>
                  <Group>
                    <div style={{ flex: 1 }}>
                      <Text fz="xs" c="dimmed">DX Rating</Text>
                      <Text>-</Text>
                    </div>
                  </Group>
                </Paper>
              ) : (
                <Paper className={[classes.subParameters, classes.subParametersButton].join(' ')} onClick={() => setCalculatorOpened(true)}>
                  <Group>
                    <div style={{ flex: 1 }}>
                      <Text fz="xs" c="dimmed">DX Rating</Text>
                      <Text>
                        {parseInt(String(score.dx_rating))}
                      </Text>
                    </div>

                    <IconChevronRight size={16} color="gray" />
                  </Group>
                </Paper>
              )}
            </Grid.Col>
            <Grid.Col span={6}>
              <Paper className={[classes.subParameters, classes.subParametersButton].join(' ')} onClick={() => setDeluxeScoreOpened(true)}>
                <Group>
                  <div style={{ flex: 1 }}>
                    <Group wrap="nowrap" gap="xs">
                      <Text fz="xs" c="dimmed">DX 分数</Text>
                      <Group wrap="nowrap" h={12} gap={0}>
                        {difficulty && difficulty.notes && (
                          <DeluxeScoreStars deluxeScore={score.dx_score} notes={difficulty.notes}/>
                        )}
                      </Group>
                    </Group>
                    <Text>
                      <NumberFormatter value={score.dx_score} thousandSeparator />
                      {difficulty && difficulty.notes && (
                        <span style={{fontSize: 12, marginLeft: 4}}>
                          / <NumberFormatter value={getTotalNotes(difficulty.notes) * 3} thousandSeparator />
                        </span>
                      )}
                    </Text>
                  </div>

                  <IconChevronRight size={16} color="gray"/>
                </Group>
              </Paper>
            </Grid.Col>
            {score.last_played_time && (
              <Grid.Col span={small ? 12 : 6}>
                <Paper className={classes.subParameters}>
                  <Text fz="xs" c="dimmed">最后游玩时间</Text>
                  <Text>{new Date(score.last_played_time || "").toLocaleString()}</Text>
                </Paper>
              </Grid.Col>
            )}
            <Grid.Col span={small ? 12 : 6}>
              <Paper className={classes.subParameters}>
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