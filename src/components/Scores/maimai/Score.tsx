import { Badge, Box, Card, Flex, Group, rem, Text } from "@mantine/core";
import {
  getScoreCardBackgroundColor, getScoreSecondaryColor, getTransparentColor,
} from "@/utils/color.ts";
import { getDifficulty, MaimaiSongProps } from "@/utils/api/song/maimai.ts";
import { useEffect, useState } from "react";
import { MaimaiScoreProps } from "@/types/score";

interface ScoreContentProps {
  score: MaimaiScoreProps;
  song?: MaimaiSongProps;
}

export const MaimaiScoreContent = ({ score, song }: ScoreContentProps) => {
  const [isBuddy, setIsBuddy] = useState(false);
  const [level, setLevel] = useState(score.level);

  const deluxeRating = score.type !== "utage" ? `${parseInt(String(score.dx_rating))}` : "-";
  const levelIndex = score.type !== "utage" ? score.level_index : 5;

  useEffect(() => {
    if (!song) return;
    const difficulty = getDifficulty(song, score.type, score.level_index);
    if (!difficulty) return;
    setIsBuddy(difficulty.is_buddy);
    if (score.type === "utage") return;
    setLevel(difficulty.level_value.toFixed(1));
  }, [song]);

  return <>
    <Flex pt={5} pb={2} pl="xs" pr="xs" style={{
      backgroundColor: getTransparentColor(getScoreSecondaryColor("maimai", levelIndex), 0.95),
    }}>
      <Text size="sm" fw={500} truncate style={{ flex: 1 }} c="white">{score.song_name}</Text>
      {score.type === "standard" && <Badge variant="filled" color="blue" size="sm">标准</Badge>}
      {score.type === "dx" && <Badge variant="filled" color="orange" size="sm">DX</Badge>}
      {isBuddy && <Badge variant="filled" color="rgb(73, 9, 10)" size="sm">BUDDY</Badge>}
    </Flex>
    <Box h="100%" p={10} pt={0} pb={0} style={{
      backgroundColor: getTransparentColor(getScoreCardBackgroundColor("maimai", levelIndex), 0.7),
    }}>
      <Group h={54} justify="space-between" wrap="nowrap" >
        {score.achievements != -1 ? (
          <div>
            <Text fz={rem(24)} style={{ lineHeight: rem(24) }} c="white">
              {parseInt(String(score.achievements))}
              <span style={{ fontSize: rem(16) }}>.{
                (String(score.achievements).split(".")[1] || "0").padEnd(4, "0")
              }%</span>
            </Text>
            <Text size="xs" c="white">
              DX Rating: {deluxeRating}
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