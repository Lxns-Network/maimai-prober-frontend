import { Card, Grid, Image, rem, Text, Group, Spoiler, Divider, NumberFormatter, Flex, Box } from "@mantine/core";
import { ChunithmScoreProps } from "./Score.tsx";
import classes from "../Scores.module.css"
import { useMediaQuery } from "@mantine/hooks";

const RateStatistics = ({ scores }: { scores: ChunithmScoreProps[] }) => {
  const rate = [
    { id: 'sssp', min: 1009000, max: Infinity },
    { id: 'sss', min: 1007500, max: 1009000 },
    { id: 'ssp', min: 1005000, max: 1007500 },
    { id: 'ss', min: 1000000, max: 1005000 },
    { id: 'sp', min: 990000, max: 1000000 },
    { id: 's', min: 975000, max: 990000 },
    { id: 'aaa', min: 950000, max: 975000 },
    { id: 'aa', min: 925000, max: 950000 },
    { id: 'a', min: 900000, max: 925000 },
  ]

  function calculateCount(scores: ChunithmScoreProps[], minScore: number, maxScore: number) {
    return scores.filter((score) => score.score >= minScore && score.score < maxScore).length;
  }

  return <Box w="100%">
    {rate.map((r, index) => {
      let count = calculateCount(scores, r.min, r.max);
      for (let i = 0; i < index; i++) {
        count += calculateCount(scores, rate[i].min, rate[i].max);
      }
      return (
        <Group key={r.id} mb="xs" h={30}>
          <Image
            src={`/assets/chunithm/music_rank/${r.id}_s.webp`}
            h={18}
            w="auto"
          />
          <Divider style={{ flex: 1 }} variant="dashed" />
          <Text fz={20} style={{ lineHeight: rem(20) }}>
            <NumberFormatter value={count} thousandSeparator />
            <span style={{ fontSize: 16, marginLeft: 4 }}>
              / <NumberFormatter value={scores.length} thousandSeparator />
            </span>
          </Text>
        </Group>
      )
    })}
  </Box>
}

const FullComboStatistics = ({ scores }: { scores: ChunithmScoreProps[] }) => {
  const full_combo = ['alljusticecritical', 'alljustice', 'fullcombo']

  return <Box w="100%">
    {full_combo.map((r, index) => (
      <Group key={r} mb="xs" h={30}>
        <Image
          src={`/assets/chunithm/music_icon/${r}_s.webp`}
          h={18}
          w="auto"
        />
        <Divider style={{ flex: 1 }} variant="dashed" />
        <Text fz={20} style={{ lineHeight: rem(20) }}>
          <NumberFormatter value={scores.filter((score) => {
            return full_combo.slice(0, index + 1).includes(score.full_combo);
          }).length} thousandSeparator />
          <span style={{ fontSize: 16, marginLeft: 4 }}>
            / <NumberFormatter value={scores.length} thousandSeparator />
          </span>
        </Text>
      </Group>
    ))}
  </Box>;
}

export const ChunithmStatisticsSection = ({ scores }: { scores: ChunithmScoreProps[] }) => {
  const small = useMediaQuery('(max-width: 30rem)');
  const extraSmall = useMediaQuery('(max-width: 28rem)');

  return (
    <Card withBorder radius="md" className={classes.card}>
      <Spoiler maxHeight={120} showLabel="显示详细统计信息..." hideLabel="隐藏详细统计信息">
        <Grid gutter={small ? "md" : "xl"}>
          <Grid.Col span={extraSmall ? 12 : 6}>
            <RateStatistics scores={scores} />
          </Grid.Col>
          <Grid.Col span={extraSmall ? 12 : 6}>
            <Flex gap="md" direction={extraSmall ? "row" : "column"}>
              <FullComboStatistics scores={scores} />
            </Flex>
          </Grid.Col>
        </Grid>
      </Spoiler>
    </Card>
  )
}