import { Box, Card, Flex, Group, NumberFormatter, Rating, rem, Text } from "@mantine/core";
import {
  getScoreCardBackgroundColor,
  getReadableTextColor,
  getScoreSecondaryColor,
  getTransparentColor,
} from "@/utils/color.ts";
import { getDifficulty, ChunithmSongProps } from "@/utils/api/song/chunithm.ts";
import { ChunithmScoreProps } from "@/types/score";

interface ScoreContentProps {
  score: ChunithmScoreProps;
  song?: ChunithmSongProps;
}

export const ChunithmScoreContent = ({ score, song }: ScoreContentProps) => {
  const rating = score.id < 8000 ? `${Math.floor(score.rating * 100) / 100}` : "-";
  const levelIndex = score.id < 8000 ? score.level_index : 5;

  const difficulty = song ? getDifficulty(song, score.level_index) : undefined;
  const level = difficulty
    ? score.id >= 8000
      ? difficulty.kanji
      : difficulty.level_value.toFixed(1)
    : score.level;
  const headerColor = getScoreSecondaryColor("chunithm", levelIndex);
  const bodyColor = getScoreCardBackgroundColor("chunithm", levelIndex);
  const headerTextColor = getReadableTextColor(headerColor);
  const bodyTextColor = getReadableTextColor(bodyColor);

  return (
    <>
      <Flex
        pt={5}
        pb={2}
        pl="xs"
        pr="xs"
        style={{
          backgroundColor: getTransparentColor(headerColor, 0.95),
        }}
      >
        <Text size="sm" fw={500} truncate style={{ flex: 1 }} c={headerTextColor}>
          {score.song_name}
        </Text>
        {score.id >= 8000 && difficulty && (
          <Group wrap="nowrap" justify="center" gap={0}>
            <Rating count={difficulty.star} value={5} size={12} readOnly />
          </Group>
        )}
      </Flex>
      <Box
        h="100%"
        p={10}
        pt={0}
        pb={0}
        style={{
          backgroundColor: getTransparentColor(bodyColor, 0.7),
        }}
      >
        <Group h={54} justify="space-between" wrap="nowrap">
          {score.score != -1 ? (
            <div>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c={bodyTextColor} mb={4}>
                <NumberFormatter value={score.score || 0} thousandSeparator />
              </Text>
              <Text size="xs" c={bodyTextColor}>
                Rating: {rating}
              </Text>
            </div>
          ) : (
            <div>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c={bodyTextColor} mb={4}>
                未游玩
              </Text>
              <Text size="xs" c={bodyTextColor}>
                或未上传至查分器
              </Text>
            </div>
          )}
          <Card w={40} h={30} p={0} radius="md" withBorder>
            <Text
              size="md"
              fw={500}
              ta="center"
              style={{
                lineHeight: rem(28),
              }}
            >
              {level}
            </Text>
          </Card>
        </Group>
      </Box>
    </>
  );
};
