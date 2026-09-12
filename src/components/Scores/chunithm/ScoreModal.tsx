import {
  AspectRatio,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Flex,
  Grid,
  Group,
  Image,
  NumberFormatter,
  Paper,
  Rating,
  rem,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { getScoreCardBackgroundColor, getScoreSecondaryColor } from "@/utils/color.ts";
import { getDifficulty, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { IconChevronRight, IconNumber, IconPhotoOff } from "@tabler/icons-react";
import { PhotoView } from "react-photo-view";
import { Marquee } from "../../Marquee.tsx";
import classes from "../ScoreModal.module.css";
import { SongDisabledIndicator } from "../../SongDisabledIndicator.tsx";
import { ASSET_URL } from "@/main";
import { useEffect, useState } from "react";
import { useMediaQuery } from "@mantine/hooks";
import useSongListStore from "@/hooks/useSongListStore.ts";
import { useShallow } from "zustand/react/shallow";
import { ChunithmScoreProps } from "@/types/score";
import { RatingHistoryModal } from "@/components/Scores/RatingHistoryModal.tsx";
import { RatingCalculator } from "./RatingCalculator.tsx";
import { OverPowerCalculator } from "./OverPowerCalculator.tsx";
import { formatChunithmValue } from "@/utils/chunithm/rating.ts";
import calculatorClasses from "./Calculator.module.css";

export const ChunithmScoreModalContent = ({
  score,
  song,
  onCalculatorOpenedChange,
}: {
  score: ChunithmScoreProps;
  song: ChunithmSongProps;
  onCalculatorOpenedChange: (opened: boolean) => void;
}) => {
  const { songList } = useSongListStore(useShallow((state) => ({ songList: state.chunithm })));
  const difficulty = getDifficulty(song, score.level_index);
  const [ratingHistoryOpened, setRatingHistoryOpened] = useState(false);
  const [calculator, setCalculator] = useState<"rating" | "over_power" | null>(null);
  const isWorldsEnd = song.id >= 8000;

  useEffect(() => {
    onCalculatorOpenedChange(calculator !== null);
    return () => onCalculatorOpenedChange(false);
  }, [calculator, onCalculatorOpenedChange]);

  const small = useMediaQuery("(max-width: 30rem)");

  if (!song) return;

  return (
    <>
      <RatingHistoryModal
        song={song}
        difficulty={difficulty}
        opened={ratingHistoryOpened}
        onClose={() => setRatingHistoryOpened(false)}
      />
      <RatingCalculator
        key={`rating:${song.id}:${score.level_index}`}
        defaultScore={score.score}
        defaultLevelValue={difficulty?.level_value}
        opened={calculator === "rating"}
        onClose={() => setCalculator(null)}
      />
      <OverPowerCalculator
        key={`over-power:${song.id}:${score.level_index}`}
        defaultScore={score.score}
        defaultLevelValue={difficulty?.level_value}
        defaultFullCombo={score.full_combo}
        opened={calculator === "over_power"}
        onClose={() => setCalculator(null)}
      />
      <Group wrap="nowrap">
        <SongDisabledIndicator disabled={song.disabled}>
          <PhotoView
            src={`${ASSET_URL}/chunithm/jacket/${difficulty?.origin_id ?? songList.getSongResourceId(song.id)}.png`}
          >
            <Avatar
              src={`${ASSET_URL}/chunithm/jacket/${difficulty?.origin_id ?? songList.getSongResourceId(song.id)}.png!webp`}
              size={94}
              radius="md"
            >
              <IconPhotoOff />
            </Avatar>
          </PhotoView>
        </SongDisabledIndicator>
        <div style={{ flex: 1 }}>
          <Group gap={8}>
            <Badge variant="light" color="gray" size="sm" leftSection={<IconNumber size={18} />}>
              {song.id}
            </Badge>
          </Group>
          <Marquee>
            <Text fz="lg" fw={500} mt={4}>
              {song.title}
            </Text>
          </Marquee>
          <Text fz="xs" c="dimmed" mb={10}>
            {song.artist}
          </Text>
          <Flex columnGap="xs" rowGap={8} wrap="wrap">
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
          </Flex>
        </div>
        {difficulty?.star ? (
          <Card
            w={60}
            h={54}
            p={0}
            radius="md"
            style={{
              border: "2px solid rgb(14, 45, 56)",
            }}
          >
            <Center
              pb={1}
              style={{
                backgroundColor: "rgb(14, 45, 56)",
              }}
            >
              <Rating count={difficulty.star} value={5} size={10} readOnly />
            </Center>
            <Text className={classes.worldsEndText} fz={24} fw={700} ta="center">
              {difficulty.kanji}
            </Text>
          </Card>
        ) : (
          <Tooltip label="查看谱面历史定数">
            <Button
              w={54}
              h={38}
              p={0}
              radius="md"
              style={{
                border: `2px solid ${getScoreSecondaryColor("chunithm", score.level_index || 0)}`,
                backgroundColor: getScoreCardBackgroundColor("chunithm", score.level_index || 0),
              }}
              onClick={() => setRatingHistoryOpened(true)}
            >
              <Text
                size="xl"
                fw={500}
                ta="center"
                c="white"
                style={{
                  lineHeight: rem(34),
                }}
              >
                {difficulty ? difficulty.level_value.toFixed(1) : "?"}
              </Text>
            </Button>
          </Tooltip>
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
                <Image src={`/assets/chunithm/music_rank/${score.rank}.webp`} w={rem(94)} />
              </AspectRatio>
              <AspectRatio ratio={132 / 24}>
                <Image
                  src={`/assets/chunithm/music_icon/${score.clear || "failed"}.webp`}
                  w={rem(94)}
                />
              </AspectRatio>
            </Stack>
            <Box>
              <Text fz="xs" c="dimmed">
                成绩
              </Text>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
                <NumberFormatter value={score.score || 0} thousandSeparator />
              </Text>
            </Box>
          </Group>
          <Grid mt="md">
            {(
              [
                { key: "rating", label: "Rating", value: score.rating },
                { key: "over_power", label: "Over Power", value: score.over_power },
              ] as const
            ).map((item) => (
              <Grid.Col span={6} key={item.key}>
                {isWorldsEnd ? (
                  <Paper className={classes.subParameters}>
                    <Text fz="xs" c="dimmed">
                      {item.label}
                    </Text>
                    <Text fz="md">-</Text>
                  </Paper>
                ) : (
                  <Paper
                    component="button"
                    type="button"
                    aria-label={`打开 ${item.label} 计算器`}
                    className={[
                      classes.subParameters,
                      classes.subParametersButton,
                      calculatorClasses.entry,
                    ].join(" ")}
                    onClick={() => setCalculator(item.key)}
                  >
                    <Group wrap="nowrap" gap="xs" justify="space-between">
                      <div>
                        <Text fz="xs" c="dimmed">
                          {item.label}
                        </Text>
                        <Text fz="md">
                          {Number.isFinite(item.value) ? formatChunithmValue(item.value) : "-"}
                        </Text>
                      </div>
                      <IconChevronRight size={16} color="gray" />
                    </Group>
                  </Paper>
                )}
              </Grid.Col>
            ))}
            {score.last_played_time && (
              <Grid.Col span={small ? 12 : 6}>
                <Paper className={classes.subParameters}>
                  <Text fz="xs" c="dimmed">
                    最后游玩时间
                  </Text>
                  <Text>{new Date(score.last_played_time || "").toLocaleString()}</Text>
                </Paper>
              </Grid.Col>
            )}
            <Grid.Col span={small ? 12 : 6}>
              <Paper className={classes.subParameters}>
                <Text fz="xs" c="dimmed">
                  上传时间
                </Text>
                <Text fz="md">{new Date(score.upload_time || "").toLocaleString()}</Text>
              </Paper>
            </Grid.Col>
          </Grid>
        </>
      )}
    </>
  );
};
