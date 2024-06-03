import { BackgroundImage, Card, Flex, Group, NumberFormatter, Rating, rem, Text } from "@mantine/core";
import { chunithmDifficultyColor } from "../../../utils/color.tsx";
import { getDifficulty, ChunithmSongProps } from "../../../utils/api/song/chunithm.tsx";
import { memo } from "react";
import classes from "../Scores.module.css"
import { useComputedColorScheme } from "@mantine/core";

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

interface ScoreProps {
  score: ChunithmScoreProps;
  song: ChunithmSongProps;
  onClick: () => void;
}

const WorldsEndScore = ({ score, song, onClick }: ScoreProps) => {
  const computedColorScheme = useComputedColorScheme('light');
  const difficulty = getDifficulty(song, score.level_index);
  if (!difficulty) {
    return null;
  }

  return (
    <Card
      shadow="sm"
      radius="md"
      p={0}
      className={[classes.card, classes.scoreCard, classes.scoreWorldsEnd].join(' ')}
      style={{
        opacity: computedColorScheme === 'dark' ? 0.8 : 1,
      }}
      onClick={onClick}
    >
      <BackgroundImage src={`https://assets.lxns.net/chunithm/jacket/${difficulty.origin_id}.png!webp`}>
        <Flex pt={5} pb={2} pl="xs" pr="xs" style={{
          backgroundColor: "rgba(14, 45, 56, 0.95)",
        }}>
          <Text size="sm" fw={500} truncate style={{ flex: 1 }} c="white">{score.song_name}</Text>
          <Group wrap="nowrap" justify="center" gap={0}>
            <Rating count={difficulty.star} value={5} size={12} readOnly />
          </Group>
        </Flex>
        <Group justify="space-between" p={10} pt={5} pb={5} wrap="nowrap" style={{
          backgroundColor: "rgba(14, 45, 56, 0.7)",
        }}>
          {score.score != -1 ? (
            <div>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c="white" mb={4}>
                <NumberFormatter value={score.score || 0} thousandSeparator />
              </Text>
              <Text size="xs" c="white">
                Rating: -
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
              {difficulty.kanji}
            </Text>
          </Card>
        </Group>
      </BackgroundImage>
    </Card>
  )
}

export const Score = memo(({ score, song, onClick }: ScoreProps) => {
  if (song.id >= 8000) {
    return <WorldsEndScore score={score} song={song} onClick={onClick} />
  }

  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Card
      shadow="sm"
      radius="md"
      p={0}
      className={[classes.card, classes.scoreCard].join(' ')}
      style={{
        border: `2px solid ${chunithmDifficultyColor[2][score.level_index]}`,
        opacity: computedColorScheme === 'dark' ? 0.8 : 1,
      }}
      onClick={onClick}
    >
      <BackgroundImage src={`https://assets.lxns.net/chunithm/jacket/${score.id}.png!webp`}>
        <Flex pt={5} pb={2} pl="xs" pr="xs" style={{
          backgroundColor: chunithmDifficultyColor[2][score.level_index].replace(")", ", 0.95)"),
        }}>
          <Text size="sm" fw={500} truncate style={{ flex: 1 }} c="white">{score.song_name}</Text>
        </Flex>
        <Group justify="space-between" p={10} pt={5} pb={5} wrap="nowrap" style={{
          backgroundColor: chunithmDifficultyColor[1][score.level_index].replace(")", ", 0.7)"),
        }}>
          {score.score != -1 ? (
            <div>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c="white" mb={4}>
                <NumberFormatter value={score.score || 0} thousandSeparator />
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
      </BackgroundImage>
    </Card>
  )
});