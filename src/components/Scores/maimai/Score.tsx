import { Badge, Card, Flex, Group, rem, Text, useComputedColorScheme } from "@mantine/core";
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

export const Score = memo(({ score, song, onClick }: { score: MaimaiScoreProps, song: MaimaiSongProps, onClick: () => void }) => {
  const computedColorScheme = useComputedColorScheme('light');

  return (
    <Card
      shadow="sm"
      radius="md"
      p={0}
      className={[classes.card, classes.scoreCard].join(' ')}
      style={{
        border: `2px solid ${maimaiDifficultyColor[2][score.level_index]}`,
        backgroundColor: maimaiDifficultyColor[1][score.level_index],
        opacity: computedColorScheme === 'dark' ? 0.8 : 1,
      }}
      onClick={onClick}
    >
      <Flex pt={5} pb={2} pl="xs" pr="xs" style={{
        backgroundColor: maimaiDifficultyColor[2][score.level_index]
      }}>
        <Text size="sm" fw={500} truncate style={{ flex: 1 }} c="white">{score.song_name}</Text>
        {score.type === "standard" ? (
          <Badge variant="filled" color="blue" size="sm">标准</Badge>
        ) : (
          <Badge variant="filled" color="orange" size="sm">DX</Badge>
        )}
      </Flex>
      <Group justify="space-between" m={10} mt={5} mb={5} wrap="nowrap">
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
    </Card>
  )
});