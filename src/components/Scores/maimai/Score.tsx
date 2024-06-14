import { BackgroundImage, Badge, Card, Flex, Group, rem, Text, useComputedColorScheme } from "@mantine/core";
import { maimaiDifficultyColor } from "../../../utils/color.tsx";
import { getDifficulty, MaimaiSongProps } from "../../../utils/api/song/maimai.tsx";
import { memo } from "react";
import classes from "../Scores.module.css";

export interface MaimaiScoreProps {
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
  play_time?: string;
  upload_time: string;
}

interface ScoreProps {
  score: MaimaiScoreProps;
  song: MaimaiSongProps;
  onClick: () => void;
}

const UtageScore = memo(({ score, song, onClick }: ScoreProps) => {
  const computedColorScheme = useComputedColorScheme('light');
  const difficulty = getDifficulty(song, "utage", 0);

  return (
    <Card
      shadow="sm"
      radius="md"
      p={0}
      className={[classes.card, classes.scoreCard].join(' ')}
      style={{
        border: `2px solid rgb(204, 12, 175)`,
        opacity: computedColorScheme === 'dark' ? 0.8 : 1,
      }}
      onClick={onClick}
    >
      <BackgroundImage src={`https://assets.lxns.net/maimai/jacket/${score.id%10000}.png!webp`}>
        <Flex pt={5} pb={2} pl="xs" pr="xs" style={{
          backgroundColor: "rgba(204, 12, 175, 0.95)",
        }}>
          <Text size="sm" fw={500} truncate style={{ flex: 1 }} c="white">{score.song_name}</Text>
          {difficulty.is_buddy && (
            <Badge variant="filled" color="rgb(73, 9, 10)" size="sm">BUDDY</Badge>
          )}
        </Flex>
        <Group justify="space-between" p={10} pt={5} pb={5} wrap="nowrap" style={{
          backgroundColor: "rgba(234, 61, 232, 0.7)",
        }}>
          {score.achievements != -1 ? (
            <div>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c="white">
                {parseInt(String(score.achievements))}
                <span style={{ fontSize: rem(16) }}>.{
                  (String(score.achievements).split(".")[1] || "0").padEnd(4, "0")
                }%</span>
              </Text>
              <Text size="xs" c="white">
                DX Rating: -
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
              {difficulty.level}
            </Text>
          </Card>
        </Group>
      </BackgroundImage>
    </Card>
  )
});

export const Score = memo(({ score, song, onClick }: ScoreProps) => {
  if (song.id >= 100000) {
    return <UtageScore score={score} song={song} onClick={onClick} />
  }

  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Card
      shadow="sm"
      radius="md"
      p={0}
      className={[classes.card, classes.scoreCard].join(' ')}
      style={{
        border: `2px solid ${maimaiDifficultyColor[2][score.level_index]}`,
        opacity: computedColorScheme === 'dark' ? 0.8 : 1,
      }}
      onClick={onClick}
    >
      <BackgroundImage src={`https://assets.lxns.net/maimai/jacket/${score.id}.png!webp`}>
        <Flex pt={5} pb={2} pl="xs" pr="xs" style={{
          backgroundColor: maimaiDifficultyColor[2][score.level_index].replace(")", ", 0.95)"),
        }}>
          <Text size="sm" fw={500} truncate style={{ flex: 1 }} c="white">{score.song_name}</Text>
          {score.type === "standard" ? (
            <Badge variant="filled" color="blue" size="sm">标准</Badge>
          ) : (
            <Badge variant="filled" color="orange" size="sm">DX</Badge>
          )}
        </Flex>
        <Group justify="space-between" p={10} pt={5} pb={5} wrap="nowrap" style={{
          backgroundColor: maimaiDifficultyColor[1][score.level_index].replace(")", ", 0.7)"),
        }}>
          {score.achievements != -1 ? (
            <div>
              <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c="white">
                {parseInt(String(score.achievements))}
                <span style={{ fontSize: rem(16) }}>.{
                  (String(score.achievements).split(".")[1] || "0").padEnd(4, "0")
                }%</span>
              </Text>
              <Text size="xs" c="white">
                DX Rating: {parseInt(String(score.dx_rating))}
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
              {song != null ? getDifficulty(song, score.type, score.level_index)?.level_value.toFixed(1) : score.level}
            </Text>
          </Card>
        </Group>
      </BackgroundImage>
    </Card>
  )
});