import { Box, Text, Group, Paper, SimpleGrid, NumberFormatter} from '@mantine/core';
import { IconLoader3 } from '@tabler/icons-react';
import classes from './RatingSegments.module.css';
import { useLocalStorage } from "@mantine/hooks";
import { ChunithmBestsProps, MaimaiBestsProps } from "@/types/score";

export function RatingSegments({ bests }: { bests: MaimaiBestsProps | ChunithmBestsProps }) {
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game', defaultValue: "maimai" });

  const data = []

  if (game === 'maimai') {
    bests = bests as MaimaiBestsProps;
    const parts = bests.standard_total + bests.dx_total;
    data.push({ label: 'BEST 35', count: bests.standard_total, part: Math.round(bests.standard_total / parts * 100), color: '#228be6' });
    data.push({ label: 'BEST 15', count: bests.dx_total, part: Math.round((parts - bests.standard_total) / parts * 100), color: '#fd7e14' });
  } else if (game === 'chunithm') {
    bests = bests as ChunithmBestsProps;
    const bestsAvg = Math.floor(bests.bests.reduce((acc, score) => acc + score.rating, 0) / bests.bests.length * 100) / 100 || 0;
    const selectionsAvg = Math.floor(bests.selections.reduce((acc, score) => acc + score.rating, 0) / bests.selections.length * 100) / 100 || 0;
    const recentsAvg = Math.floor(bests.recents.reduce((acc, score) => acc + score.rating, 0) / bests.recents.length * 100) / 100 || 0;
    data.push({ label: 'BEST 30', count: bestsAvg, part: Math.round(bestsAvg / (bestsAvg + recentsAvg) * 100), color: '#228be6' });
    data.push({ label: 'SELECTION 10', count: selectionsAvg, part: 0 });
    data.push({ label: 'RECENT 10', count: recentsAvg, part: Math.round(recentsAvg / (bestsAvg + recentsAvg) * 100), color: '#fd7e14' });
  }

  const descriptions = data.map((stat) => (
    <Box key={stat.label} style={{ borderBottomColor: stat.color }} className={classes.stat}>
      <Text tt="uppercase" fz="xs" c="dimmed" fw={700}>
        {stat.label}
      </Text>

      <Group justify="space-between" align="flex-end" gap={0}>
        <Text fw={700}>{stat.count}</Text>
        <Text c={stat.color} fw={700} size="sm" className={classes.statCount}>
          {stat.part}%
        </Text>
      </Group>
    </Box>
  ));

  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between">
        <Group align="flex-end" gap="xs">
          <Text fz="xl" fw={700}>
            {"standard_total" in bests && "dx_total" in bests && (
              <NumberFormatter value={bests.standard_total + bests.dx_total} />
            )}
            {"bests" in bests && (
              <NumberFormatter value={Math.round((data[0].count * bests.bests.length + data[1].count * bests.recents.length) / 40 * 100) / 100} />
            )}
          </Text>
        </Group>
        <IconLoader3 size="1.5rem" className={classes.icon} stroke={1.5} />
      </Group>

      <Text c="dimmed" fz="sm">
        {game === 'maimai' ? 'DX Rating 总和' : 'Rating 均值'}
      </Text>
      <SimpleGrid cols={{ base: 1, xs: 3 }} mt="md">
        {descriptions}
      </SimpleGrid>
    </Paper>
  );
}