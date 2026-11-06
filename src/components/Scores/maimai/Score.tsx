import { Badge, Box, Card, Flex, Group, rem, Text } from "@mantine/core";
import {
  getScoreCardBackgroundColor,
  getScoreSecondaryColor,
  getTransparentColor,
} from "@/utils/color.ts";
import { getDifficulty, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { MaimaiScoreProps } from "@/types/score";
import { isUtage, scoreColorIndex } from "@/utils/score.ts";
import { ChartTypeBadge } from "@/components/ChartBadge.tsx";

interface ScoreContentProps {
  score: MaimaiScoreProps;
  song?: MaimaiSongProps;
}

export const MaimaiScoreContent = ({ score, song }: ScoreContentProps) => {
  const deluxeRating = !isUtage(score.type) ? `${parseInt(String(score.dx_rating))}` : "-";
  const levelIndex = scoreColorIndex(score);

  const difficulty = song ? getDifficulty(song, score.type, score.level_index) : undefined;
  const isBuddy = difficulty?.is_buddy ?? false;
  const level =
    difficulty && !isUtage(score.type) ? difficulty.level_value.toFixed(1) : score.level;

  return (
    <>
      <Flex
        pt={5}
        pb={2}
        pl="xs"
        pr="xs"
        style={{
          backgroundColor: getTransparentColor(getScoreSecondaryColor("maimai", levelIndex), 0.95),
        }}
      >
        <Text size="sm" fw={500} truncate flex={1} c="white">
          {score.song_name}
        </Text>
        <ChartTypeBadge type={score.type} variant="filled" />
        {isBuddy && (
          <Badge variant="filled" color="rgb(73, 9, 10)" size="sm">
            BUDDY
          </Badge>
        )}
      </Flex>
      <Box
        h="100%"
        p={10}
        pt={0}
        pb={0}
        style={{
          backgroundColor: getTransparentColor(
            getScoreCardBackgroundColor("maimai", levelIndex),
            0.7,
          ),
        }}
      >
        <Group h={54} justify="space-between" wrap="nowrap">
          {score.achievements !== -1 ? (
            <div>
              <Text fz={rem(24)} lh={rem(24)} c="white">
                {parseInt(String(score.achievements))}
                <Text span inherit fz={rem(16)}>
                  .{(String(score.achievements).split(".")[1] || "0").padEnd(4, "0")}%
                </Text>
              </Text>
              <Text size="xs" c="white">
                DX Rating: {deluxeRating}
              </Text>
            </div>
          ) : (
            <div>
              <Text fz={rem(24)} lh={rem(24)} c="white" mb={4}>
                未游玩
              </Text>
              <Text size="xs" c="white">
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
