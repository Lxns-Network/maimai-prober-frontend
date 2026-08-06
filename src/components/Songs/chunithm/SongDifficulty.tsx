import {
  AspectRatio,
  Box,
  Card,
  Divider,
  Flex,
  Group,
  Image,
  NumberFormatter,
  Rating,
  rem,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import classes from "../SongDifficulty.module.css";
import { ChunithmDifficultyProps, ChunithmVersionProps } from "@/utils/api/song/chunithm.ts";
import {
  getReadableTextColor,
  getScoreCardBackgroundColor,
  getScoreSecondaryColor,
} from "@/utils/color.ts";
import { ChunithmScoreProps } from "@/types/score";

interface SongDifficultyProps {
  difficulty: ChunithmDifficultyProps;
  score: ChunithmScoreProps;
  versions: ChunithmVersionProps[];
  onClick: () => void;
}

export const ChunithmSongDifficulty = ({
  difficulty,
  score,
  versions,
  onClick,
}: SongDifficultyProps) => {
  const isWorldsEnd = !!difficulty?.star;
  const colorIndex = difficulty.difficulty;
  const backgroundColor = getScoreCardBackgroundColor("chunithm", colorIndex);
  const textColor = getReadableTextColor(backgroundColor);
  const difficultyName = isWorldsEnd
    ? "WORLD'S END"
    : ["BASIC", "ADVANCED", "EXPERT", "MASTER", "ULTIMA"][difficulty.difficulty];

  let borderSize = 2;
  const classNameList = [classes.scoreCard];

  if (isWorldsEnd) {
    borderSize = 0;
    classNameList.push(classes.scoreWorldsEnd);
  }

  return (
    <Card
      component="button"
      type="button"
      className={classNameList.join(" ")}
      c={textColor}
      mih={82.5}
      pt={5}
      p="0.5rem"
      shadow="sm"
      radius="md"
      withBorder
      style={{
        border: `${borderSize}px solid ${getScoreSecondaryColor("chunithm", colorIndex)}`.replace(
          ")",
          ", 0.95)",
        ),
        backgroundColor: backgroundColor.replace(")", ", 0.95)"),
        textAlign: "initial",
        width: "100%",
      }}
      aria-label={`打开 ${difficultyName} ${difficulty.level} 成绩详情`}
      onClick={onClick}
    >
      <Flex align="center" ml="0.5rem" mr="0.5rem" mb={5}>
        {isWorldsEnd ? (
          <Text fz="sm" fw={500} style={{ flex: 1 }}>
            WORLD'S END
            <Title component="span" order={3} fw={500} ml="xs">
              {difficulty.kanji}
            </Title>
          </Text>
        ) : (
          <Text fz="sm" fw={500} style={{ flex: 1 }}>
            {difficultyName}
            <Title component="span" order={3} fw={500} ml="xs">
              {difficulty.level_value.toFixed(1)}
            </Title>
          </Text>
        )}
        <Flex>
          {score?.full_combo && (
            <Image
              src={`/assets/chunithm/music_icon/${score.full_combo}.webp`}
              w={rem(94)}
              alt={`FULL COMBO 状态：${score.full_combo}`}
              loading="lazy"
            />
          )}
          {score?.full_chain && (
            <Image
              src={`/assets/chunithm/music_icon/${score.full_chain}.webp`}
              w={rem(94)}
              alt={`FULL CHAIN 状态：${score.full_chain}`}
              loading="lazy"
            />
          )}
        </Flex>
        {difficulty?.star && <Rating count={difficulty.star} value={5} size={12} readOnly />}
      </Flex>
      {score && score.score >= 0 ? (
        <Card
          w="100%"
          radius="md"
          p="1rem"
          pt="xs"
          pb="xs"
          c={getReadableTextColor("#424242")}
          bg="#424242"
        >
          <Group>
            <Stack gap={8}>
              <AspectRatio ratio={132 / 24}>
                <Image
                  src={`/assets/chunithm/music_rank/${score.rank}.webp`}
                  w={rem(94)}
                  alt={`成绩评级：${score.rank}`}
                  loading="lazy"
                />
              </AspectRatio>
              <AspectRatio ratio={132 / 24}>
                <Image
                  src={`/assets/chunithm/music_icon/${score.clear}.webp`}
                  w={rem(94)}
                  alt={`通关状态：${score.clear}`}
                  loading="lazy"
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
          <Group mt="xs" gap="sm">
            <Box mr={16}>
              <Text fz="xs" c="dimmed">
                Rating
              </Text>
              <Text fz="md">{difficulty?.star ? "-" : Math.floor(score.rating * 100) / 100}</Text>
            </Box>
            {score.last_played_time && (
              <Box mr={16}>
                <Text fz="xs" c="dimmed">
                  最后游玩时间
                </Text>
                <Text fz="md">{new Date(score.last_played_time || "").toLocaleString()}</Text>
              </Box>
            )}
            <Box>
              <Text fz="xs" c="dimmed">
                上传时间
              </Text>
              <Text fz="md">{new Date(score.upload_time || "").toLocaleString()}</Text>
            </Box>
          </Group>
        </Card>
      ) : (
        <Divider color={getScoreSecondaryColor("chunithm", colorIndex)} />
      )}
      <Flex mt={8} ml="0.5rem" rowGap={4} columnGap="xs" wrap="wrap">
        {difficulty.note_designer && difficulty.note_designer != "-" && (
          <Group>
            <Text fz="xs">谱师</Text>
            <Text fz="sm" fw={700} mr="md">
              {difficulty.note_designer}
            </Text>
          </Group>
        )}
        <Group>
          <Text fz="xs">版本</Text>
          <Text fz="sm" fw={700}>
            {versions
              .slice()
              .reverse()
              .find((version) => difficulty.version >= version.version)?.title || "未知"}
          </Text>
        </Group>
      </Flex>
    </Card>
  );
};
