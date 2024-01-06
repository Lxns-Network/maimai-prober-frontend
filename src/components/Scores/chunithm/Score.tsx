import { Card, createStyles, Flex, Group, rem, Text, useMantineTheme } from "@mantine/core";
import { chunithmDifficultyColor } from "../../../utils/color.tsx";
import { getDifficulty, ChunithmSongProps } from "../../../utils/api/song/chunithm.tsx";
import { memo } from "react";

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

const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
    color: theme.colorScheme === 'dark' ? theme.colors.gray[9] : theme.white,
  },

  scoreCard: {
    cursor: 'pointer',
    transition: 'transform 200ms ease',

    '&:hover': {
      transform: 'scale(1.03)',
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
      boxShadow: theme.shadows.md,
      borderColor: theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2],
      borderRadius: theme.radius.md,
      zIndex: 1,
    }
  }
}));

export const Score = memo(({ score, song, onClick }: { score: ChunithmScoreProps, song: ChunithmSongProps, onClick: () => void }) => {
  const { classes } = useStyles();
  const theme = useMantineTheme();

  return (
    <Card
      shadow="sm"
      radius="md"
      p={0}
      className={[classes.card, classes.scoreCard].join(' ')}
      style={{
        border: `2px solid ${chunithmDifficultyColor[2][score.level_index]}`,
        backgroundColor: chunithmDifficultyColor[1][score.level_index],
        opacity: theme.colorScheme === 'dark' ? 0.8 : 1,
      }}
      onClick={onClick}
    >
      <Flex pt={5} pb={2} pl="xs" pr="xs" style={{
        backgroundColor: chunithmDifficultyColor[2][score.level_index]
      }}>
        <Text size="sm" weight={500} truncate style={{ flex: 1 }} color="white">{score.song_name}</Text>
      </Flex>
      <Group position="apart" m={10} mt={5} mb={5} noWrap>
        {score.score != -1 ? (
          <div>
            <Text fz={rem(24)} style={{ lineHeight: rem(24) }} color="white" mb={4}>
              {(score.score || 0).toLocaleString('en-US', { useGrouping: true })}
            </Text>
            <Text size="xs" color="white">
              Rating: {Math.floor(score.rating * 100) / 100}
            </Text>
          </div>
        ) : (
          <div>
            <Text fz={rem(24)} style={{ lineHeight: rem(24) }} color="white" mb={4}>
              未游玩
            </Text>
            <Text size="xs" color="white">
              或未上传至查分器
            </Text>
          </div>
        )}
        <Card w={40} h={30} p={0} radius="md" withBorder>
          <Text size="md" weight={500} align="center" style={{
            lineHeight: rem(28),
          }}>
            {song != null ? getDifficulty(song, score.level_index)?.level_value.toFixed(1) : score.level}
          </Text>
        </Card>
      </Group>
    </Card>
  )
});