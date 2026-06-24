import { Badge, Box, Group, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import classes from "./RatingSegments.module.css";
import { ChunithmBestsProps, MaimaiBestsProps } from "@/types/score";
import { getDeluxeRatingGradient, getRatingGradient } from "@/utils/color.ts";

interface Segment {
  label: string;
  color: string;
  value: number;
  valueLabel: string;
  min: number;
  max: number;
}

function isMaimaiBests(bests: MaimaiBestsProps | ChunithmBestsProps): bests is MaimaiBestsProps {
  return "standard_total" in bests && "dx_total" in bests;
}

function truncate2(value: number): number {
  return Math.floor(value * 100) / 100;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return truncate2(values.reduce((acc, v) => acc + truncate2(v), 0) / values.length);
}

function RatingBadge({ game, rating }: { game: "maimai" | "chunithm"; rating: number }) {
  const gradient = game === "maimai" ? getDeluxeRatingGradient(rating) : getRatingGradient(rating);
  return (
    <Badge className={classes.ratingNumberTotal} variant="gradient" gradient={gradient} size="xl">
      {rating}
    </Badge>
  );
}

function SegmentCard({ segment, decimals }: { segment: Segment; decimals: boolean }) {
  const fmt = (n: number) => (decimals ? truncate2(n) : Math.round(n));
  return (
    <Paper withBorder radius="md" p="sm">
      <Group gap={6} mb={6} wrap="nowrap">
        <Box w={8} h={8} style={{ borderRadius: "50%", backgroundColor: segment.color }} />
        <Text fz="sm" fw={700}>
          {segment.label}
        </Text>
        <Text fz="xs" c="dimmed">
          {segment.valueLabel}
        </Text>
      </Group>
      <Text fz="xl" fw={700} lh={1.1} c={segment.color}>
        {fmt(segment.value)}
      </Text>
      <Group gap="lg" mt={6}>
        <Box>
          <Text fz="xs" c="dimmed">
            最低
          </Text>
          <Text fz="sm">{fmt(segment.min)}</Text>
        </Box>
        <Box>
          <Text fz="xs" c="dimmed">
            最高
          </Text>
          <Text fz="sm">{fmt(segment.max)}</Text>
        </Box>
      </Group>
    </Paper>
  );
}

export function RatingSegments({ bests }: { bests: MaimaiBestsProps | ChunithmBestsProps }) {
  const maimai = isMaimaiBests(bests);
  const segments: Segment[] = [];
  let total = 0;

  if (isMaimaiBests(bests)) {
    if (bests.standard) {
      const s = bests.standard;
      segments.push({
        label: "B35",
        color: "#228be6",
        valueLabel: "贡献",
        value: bests.standard_total,
        min: s.length > 0 ? s[s.length - 1].dx_rating : 0,
        max: s.length > 0 ? s[0].dx_rating : 0,
      });
    }
    if (bests.dx) {
      const d = bests.dx;
      segments.push({
        label: "B15",
        color: "#fd7e14",
        valueLabel: "贡献",
        value: bests.dx_total,
        min: d.length > 0 ? d[d.length - 1].dx_rating : 0,
        max: d.length > 0 ? d[0].dx_rating : 0,
      });
    }
    total = bests.standard_total + bests.dx_total;
  } else {
    const pushSegment = (label: string, scores?: ChunithmBestsProps["bests"]) => {
      if (!scores) return 0;
      const avg = average(scores.map((s) => s.rating));
      segments.push({
        label,
        color: "#228be6",
        valueLabel: "均值",
        value: avg,
        min: scores.length > 0 ? scores[scores.length - 1].rating : 0,
        max: scores.length > 0 ? scores[0].rating : 0,
      });
      return avg;
    };
    const b30avg = pushSegment("B30", bests.bests);
    pushSegment("S10", bests.selections);
    const n20avg = pushSegment("N20", bests.new_bests);
    // 总评分均值：(B30 总和 + N20 总和) / 50，与原计算保持一致（S10 为候选，不计入）。
    total = truncate2(
      (b30avg * (bests.bests?.length ?? 0) + n20avg * (bests.new_bests?.length ?? 0)) / 50,
    );
  }

  return (
    <Paper withBorder p="md" radius="md">
      <Stack align="center" gap={4}>
        <Text fw={500}>{maimai ? "DX 评分总和" : "Rating 均值"}</Text>
        <RatingBadge game={maimai ? "maimai" : "chunithm"} rating={total} />
      </Stack>
      <SimpleGrid cols={{ base: 1, xs: 2, sm: segments.length }} mt="md">
        {segments.map((segment) => (
          <SegmentCard key={segment.label} segment={segment} decimals={!maimai} />
        ))}
      </SimpleGrid>
    </Paper>
  );
}
