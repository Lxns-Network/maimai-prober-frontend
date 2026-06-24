import { Box, Group, Loader, Space, Stack, Text, Title } from "@mantine/core";
import { EmptyState } from "@/components/EmptyState.tsx";
import { ScoreList } from "@/components/Scores/ScoreList.tsx";
import { useBests } from "@/hooks/queries/useBests.ts";
import { IconDatabaseOff } from "@tabler/icons-react";
import { RatingSegments } from "@/components/Scores/RatingSegments.tsx";
import useGame from "@/hooks/useGame.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";

function BestsGroup({
  title,
  subtitle,
  scores,
}: {
  title: string;
  subtitle: string;
  scores: (MaimaiScoreProps | ChunithmScoreProps)[];
}) {
  return (
    <Box>
      <Title order={3}>{title}</Title>
      <Text fz="sm" c="dimmed" mb="md">
        {subtitle}
      </Text>
      <ScoreList scores={scores} />
    </Box>
  );
}

export const ScoreBestsSection = () => {
  const [game] = useGame();
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
      <EmptyState
        icon={<IconDatabaseOff size={64} stroke={1.5} />}
        title="没有获取到任何最佳成绩"
      />
    );
  }

  return (
    <>
      <RatingSegments bests={bests} />
      <Space h="md" />
      <Stack gap="lg">
        {"dx" in bests && (
          <BestsGroup title="Best 15" subtitle="现版本最佳曲目" scores={bests.dx} />
        )}
        {"standard" in bests && (
          <BestsGroup title="Best 35" subtitle="旧版本最佳曲目" scores={bests.standard} />
        )}
        {"bests" in bests && (
          <BestsGroup title="Best 30" subtitle="评分对象曲（最高）" scores={bests.bests} />
        )}
        {"selections" in bests && (
          <BestsGroup
            title="Selection 10"
            subtitle="候选评分对象曲（最高）"
            scores={bests.selections}
          />
        )}
        {"new_bests" in bests && (
          <BestsGroup title="New 20" subtitle="评分对象曲（新曲）" scores={bests.new_bests} />
        )}
      </Stack>
    </>
  );
};
