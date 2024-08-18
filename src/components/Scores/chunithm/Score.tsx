import { Box, Card, Flex, Group, NumberFormatter, Rating, rem, Text } from "@mantine/core";
import {
  getScoreCardBackgroundColor,
  getScoreSecondaryColor,
  getTransparentColor
} from "../../../utils/color.tsx";
import { getDifficulty, ChunithmSongProps, ChunithmDifficultyProps } from "../../../utils/api/song/chunithm.tsx";
import { useEffect, useState } from "react";

export interface ChunithmScoreProps {
  id: number;
  song_name: string;
  level: string;
  level_index: number;
  score: number;
  rating: number;
  over_power: number;
  clear: string;
  full_combo: string;
  full_chain: string;
  rank: string;
  play_time?: string;
  upload_time: string;
}

interface ScoreContentProps {
  score: ChunithmScoreProps;
  song?: ChunithmSongProps;
}

export const ChunithmScoreContent = ({ score, song }: ScoreContentProps) => {
  const [difficulty, setDifficulty] = useState<ChunithmDifficultyProps | null>(null);
  const [level, setLevel] = useState(score.level);

  const rating = score.id < 8000 ? `${Math.floor(score.rating * 100) / 100}` : "-";
  const levelIndex = score.id < 8000 ? score.level_index : 5;

  useEffect(() => {
    if (!song) return;
    const difficulty = getDifficulty(song, score.level_index);
    if (!difficulty) return;
    setDifficulty(difficulty);
    if (score.id >= 8000) {
      setLevel(difficulty.kanji);
    } else {
      setLevel(difficulty.level_value.toFixed(1));
    }
  }, [song]);

  return <>
    <Flex pt={5} pb={2} pl="xs" pr="xs" style={{
      backgroundColor: getTransparentColor(getScoreSecondaryColor("chunithm", levelIndex), 0.95),
    }}>
      <Text size="sm" fw={500} truncate style={{ flex: 1 }} c="white">{score.song_name}</Text>
      {score.id >= 8000 && difficulty && <Group wrap="nowrap" justify="center" gap={0}>
        <Rating count={difficulty.star} value={5} size={12} readOnly />
      </Group>}
    </Flex>
    <Box h="100%" p={10} pt={0} pb={0} style={{
      backgroundColor: getTransparentColor(getScoreCardBackgroundColor("chunithm", levelIndex), 0.7),
    }}>
      <Group h={54} justify="space-between" wrap="nowrap" >
        {score.score != -1 ? (
          <div>
            <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c="white" mb={4}>
              <NumberFormatter value={score.score || 0} thousandSeparator />
            </Text>
            <Text size="xs" c="white">
              Rating: {rating}
            </Text>
          </div>
        ) : (
          <div>
            <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c="white" mb={4}>
              未游玩
            </Text>
            <Text size="xs" c="white">
              或未上传至查分器
            </Text>
          </div>
        )}
        <Card w={40} h={30} p={0} radius="md" withBorder>
          <Text size="md" fw={500} ta="center" style={{
            lineHeight: rem(28),
          }}>
            {level}
          </Text>
        </Card>
      </Group>
    </Box>
  </>
}