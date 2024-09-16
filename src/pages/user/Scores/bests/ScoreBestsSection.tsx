import { useLocalStorage } from "@mantine/hooks";
import { Box, Flex, Group, Loader, Space, Text, Title } from "@mantine/core";
import { MaimaiScoreProps } from "@/components/Scores/maimai/Score.tsx";
import { ChunithmScoreProps } from "@/components/Scores/chunithm/Score.tsx";
import { ScoreList } from "@/components/Scores/ScoreList.tsx";
import { useBests } from "@/hooks/swr/useBests.ts";
import { IconDatabaseOff } from "@tabler/icons-react";
import { RatingSegments } from "@/components/Scores/RatingSegments.tsx";

export interface MaimaiBestsProps {
  standard: MaimaiScoreProps[];
  dx: MaimaiScoreProps[];
  standard_total: number;
  dx_total: number;
}

export interface ChunithmBestsProps {
  bests: ChunithmScoreProps[];
  selections: ChunithmScoreProps[];
  recents: ChunithmScoreProps[];
}

export const ScoreBestsSection = () => {
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });

  const { bests, isLoading } = useBests(game);

  if (isLoading) {
    return (
      <Group justify="center" mt="md" mb="md">
        <Loader />
      </Group>
    );
  }

  if (!bests) {
    return (
      <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl">
        <IconDatabaseOff size={64} stroke={1.5} />
        <Text fz="sm">没有获取到任何最佳成绩</Text>
      </Flex>
    );
  }

  return (
    <>
      <RatingSegments bests={bests} />
      <Space h="md" />
      {"dx" in bests && (
        <Box mb="md">
          <Title order={3}>Best 15</Title>
          <Text fz="sm" c="dimmed" mb="md">现版本最佳曲目</Text>
          <ScoreList scores={bests.dx} />
        </Box>
      )}
      {"standard" in bests && (
        <Box>
          <Title order={3}>Best 35</Title>
          <Text fz="sm" c="dimmed" mb="md">旧版本最佳曲目</Text>
          <ScoreList scores={bests.standard} />
        </Box>
      )}
      {"bests" in bests && (
        <Box mb="md">
          <Title order={3}>Best 30</Title>
          <Text fz="sm" c="dimmed" mb="md">最佳曲目</Text>
          <ScoreList scores={bests.bests} />
        </Box>
      )}
      {"selections" in bests && (
        <Box mb="md">
          <Title order={3}>Selection 10</Title>
          <Text fz="sm" c="dimmed" mb="md">候选最佳曲目</Text>
          <ScoreList scores={bests.selections} />
        </Box>
      )}
      {"recents" in bests && (
        <Box>
          <Title order={3}>Recent 10</Title>
          <Text fz="sm" c="dimmed" mb="md">最近游玩的最佳曲目</Text>
          <ScoreList scores={bests.recents} />
        </Box>
      )}
    </>
  )
}