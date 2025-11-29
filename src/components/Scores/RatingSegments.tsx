import { Box, Text, Group, Paper, SimpleGrid, Divider, Flex, ScrollArea, Badge, Stack } from '@mantine/core';
import { IconLoader3 } from '@tabler/icons-react';
import classes from './RatingSegments.module.css';
import { ChunithmBestsProps, MaimaiBestsProps } from "@/types/score";
import useGame from "@/hooks/useGame.ts";
import { getDeluxeRatingGradient, getRatingGradient } from "@/utils/color.ts";

const RatingBadge = ({ game, rating }: { game: string, rating: number }) => {
  let gradient = getRatingGradient(rating);
  if (game === "maimai") {
    gradient = getDeluxeRatingGradient(rating);
  }
  return (
    <Badge
      className={classes.ratingNumberTotal}
      variant="gradient"
      gradient={gradient}
      size="xl"
    >
      {rating}
    </Badge>
  )
}

export function RatingSegments({ bests }: { bests: MaimaiBestsProps | ChunithmBestsProps }) {
  const [game] = useGame();

  const data = []

  if (game === 'maimai') {
    bests = bests as MaimaiBestsProps;
    data.push({
      label: 'B35',
      count: bests.standard_total,
      color: '#228be6',
      min: bests.standard.length > 0 ? bests.standard[bests.standard.length - 1].dx_rating : 0,
      avg: Math.floor(bests.standard.reduce((acc, score) => acc + score.dx_rating, 0) / bests.standard.length * 100) / 100 || 0,
      max: bests.standard.length > 0 ? bests.standard[0].dx_rating : 0
    });
    data.push({
      label: 'B15',
      count: bests.dx_total,
      color: '#fd7e14',
      min: bests.dx.length > 0 ? bests.dx[bests.dx.length - 1].dx_rating : 0,
      avg: Math.floor(bests.dx.reduce((acc, score) => acc + score.dx_rating, 0) / bests.dx.length * 100) / 100 || 0,
      max: bests.dx.length > 0 ? bests.dx[0].dx_rating : 0
    });
  } else if (game === 'chunithm') {
    bests = bests as ChunithmBestsProps;
    data.push({
      label: 'B30',
      count: Math.floor(bests.bests.reduce((acc, score) => acc + score.rating, 0) / bests.bests.length * 100) / 100 || 0,
      color: '#228be6',
      min: bests.bests.length > 0 ? bests.bests[bests.bests.length - 1].rating : 0,
      max: bests.bests.length > 0 ? bests.bests[0].rating : 0
    });
    data.push({
      label: 'S10',
      count: Math.floor(bests.selections.reduce((acc, score) => acc + score.rating, 0) / bests.selections.length * 100) / 100 || 0,
      color: '#228be6',
      min: bests.selections.length > 0 ? bests.selections[bests.selections.length - 1].rating : 0,
      max: bests.selections.length > 0 ? bests.selections[0].rating : 0
    });
    data.push({
      label: 'N20',
      count: Math.floor(bests.new_bests.reduce((acc, score) => acc + score.rating, 0) / bests.new_bests.length * 100) / 100 || 0,
      color: '#228be6',
      min: bests.new_bests.length > 0 ? bests.new_bests[bests.new_bests.length - 1].rating : 0,
      max: bests.new_bests.length > 0 ? bests.new_bests[0].rating : 0
    });
  }

  const descriptions = data.map((stat) => (
    <Group className={classes.subParameters} key={stat.label} gap="xs">
      <ScrollArea>
        <Flex align="center" columnGap="lg">
          <Group align="center" gap="xs" wrap="nowrap">
            <IconLoader3 size="1.5rem" className={classes.icon} stroke={1.5} />
            <Box>
              <Text fz="xs" c="dimmed" fw={700}>
                {stat.label}
              </Text>
              <Group gap={0}>
                <Text className={classes.ratingNumberSubtotal}>
                  {"0".repeat(5 - stat.count.toString().length)}
                  <Text className={classes.ratingNumberSubtotal} c={stat.color} span>
                    {stat.count}
                  </Text>
                </Text>
              </Group>
            </Box>
          </Group>
          <Divider orientation="vertical" />
          <Box>
            <Text fz="xs" c="dimmed">MIN</Text>
            {game === 'maimai' ? (
              <Text fz="md">{parseInt(stat.min.toString())}</Text>
            ) : (
              <Text fz="md">{Math.floor((stat.min) * 100) / 100}</Text>
            )}
          </Box>
          {stat.avg && (
            <Box>
              <Text fz="xs" c="dimmed">AVG</Text>
              <Text fz="md">{parseInt(stat.avg.toString())}</Text>
            </Box>
          )}
          <Box>
            <Text fz="xs" c="dimmed">MAX</Text>
            {game === 'maimai' ? (
              <Text fz="md">{parseInt(stat.max.toString())}</Text>
            ) : (
              <Text fz="md">{Math.floor((stat.max) * 100) / 100}</Text>
            )}
          </Box>
        </Flex>
      </ScrollArea>
    </Group>
  ));

  return (
    <Paper withBorder p="md" radius="md">
      <Stack align="center" gap={4}>
        <Text fw={500}>
          {game === 'maimai' ? 'DX 评分总和' : 'Rating 均值'}
        </Text>
        {"standard_total" in bests && "dx_total" in bests && (
          <RatingBadge game="maimai" rating={bests.standard_total + bests.dx_total} />
        )}
        {"bests" in bests && data.length === 3 && (
          <RatingBadge game="chunithm" rating={Math.round((data[0].count * bests.bests.length + data[2].count * bests.new_bests.length) / 50 * 100) / 100} />
        )}
      </Stack>
      <SimpleGrid cols={{ base: 1, xs: 2 }} mt="md">
        {descriptions}
      </SimpleGrid>
    </Paper>
  );
}