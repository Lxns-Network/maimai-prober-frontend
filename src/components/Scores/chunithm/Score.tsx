import { Card, Flex, Group, rem, Text, useMantineColorScheme } from "@mantine/core";
import { chunithmDifficultyColor } from "../../../utils/color.tsx";
import { getDifficulty, ChunithmSongProps } from "../../../utils/api/song/chunithm.tsx";
import { memo } from "react";
import classes from "../Scores.module.css"

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
  full_sync: string;
  rank: string;
  play_time?: string;
  upload_time: string;
}

export const Score = memo(({ score, song, onClick }: { score: ChunithmScoreProps, song: ChunithmSongProps, onClick: () => void }) => {
  const { colorScheme } = useMantineColorScheme();

  return (
    <Card
      shadow="sm"
      radius="md"
      p={0}
      className={[classes.card, classes.scoreCard].join(' ')}
      style={{
        border: `2px solid ${chunithmDifficultyColor[2][score.level_index]}`,
        backgroundColor: chunithmDifficultyColor[1][score.level_index],
        opacity: colorScheme === 'dark' ? 0.8 : 1,
      }}
      onClick={onClick}
    >
      <Flex pt={5} pb={2} pl="xs" pr="xs" style={{
        backgroundColor: chunithmDifficultyColor[2][score.level_index]
      }}>
        <Text size="sm" fw={500} truncate style={{ flex: 1 }} c="white">{score.song_name}</Text>
      </Flex>
      <Group justify="space-between" m={10} mt={5} mb={5} wrap="nowrap">
        {score.score != -1 ? (
          <div>
            <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c="white" mb={4}>
              {(score.score || 0).toLocaleString('en-US', { useGrouping: true })}
            </Text>
            <Text size="xs" c="white">
              Rating: {Math.floor(score.rating * 100) / 100}
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
            {song != null ? getDifficulty(song, score.level_index)?.level_value.toFixed(1) : score.level}
          </Text>
        </Card>
      </Group>
    </Card>
  )
});