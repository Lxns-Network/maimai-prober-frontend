import {Badge, Card, createStyles, Group, rem, Text} from "@mantine/core";
import {difficultyColor, getScoreCardBackgroundColor, getScoreSecondaryColor} from "../../utils/color";

export interface ScoresProps {
  id: number;
  song_name: string;
  level: string;
  level_index: number;
  achievements: number;
  fc: string;
  fs: string;
  dx_score: number;
  dx_rating: number;
  rate: string;
  type: string;
  upload_time: string;
}

const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
    color: theme.colorScheme === 'dark' ? theme.white : theme.colors.gray[9],
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

export const Score = ({ score }: { score: ScoresProps }) => {
  const { classes } = useStyles();

  return (
    <Card shadow="sm" radius="md" p={0} className={[classes.card, classes.scoreCard].join(' ')} style={{
      border: `2px solid ${getScoreSecondaryColor(score.level_index)}`,
      backgroundColor: getScoreCardBackgroundColor(score.level_index)
    }}>
      <Group position="apart" noWrap pt={5} pb={2} pl="xs" pr="xs" spacing="xs" style={{
        backgroundColor: difficultyColor[localStorage.getItem("theme") === "\"light\"" ? 1 : 2][score.level_index]
      }}>
        <Text size="sm" weight={500} truncate color="white">{score.song_name}</Text>
        {score.type === "standard" ? (
          <Badge variant="filled" color="blue" size="sm">标准</Badge>
        ) : (
          <Badge variant="filled" color="orange" size="sm">DX</Badge>
        )}
      </Group>
      <Group position="apart" m={10} mt={5} mb={5}>
        <div>
          <Text fz={rem(24)} style={{ lineHeight: rem(24) }}>
            {parseInt(String(score.achievements))}
            <span style={{ fontSize: rem(16) }}>.{
              String(score.achievements).split(".")[1]
            }%</span>
          </Text>
          <Text size="xs">
            DX Rating: {parseInt(String(score.dx_rating))}
          </Text>
        </div>
        <Card w={30} h={30} shadow="sm" padding={0} radius="md" withBorder>
          <Text size="md" weight={500} align="center" pt={2}>
            {score.level}
          </Text>
        </Card>
      </Group>
    </Card>
  )
}