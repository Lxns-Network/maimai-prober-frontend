import { Card, Grid, Image, rem, Text, Group, Spoiler, Divider } from "@mantine/core";
import { MaimaiScoreProps } from "./Score.tsx";
import classes from "../Scores.module.css"

function calculateCount(scores: MaimaiScoreProps[], minAchievements: number, maxAchievements: number) {
  return scores.filter((score) => score.achievements >= minAchievements && score.achievements < maxAchievements).length;
}

export const StatisticsSection = ({ scores }: { scores: MaimaiScoreProps[] }) => {
  const totalCount = scores.length;

  const rate = [
    { id: 'sssp', min: 100.5, max: Infinity },
    { id: 'sss', min: 100, max: 100.5 },
    { id: 'ssp', min: 99.5, max: 100 },
    { id: 'ss', min: 99, max: 99.5 },
    { id: 'sp', min: 98, max: 99 },
    { id: 's', min: 97, max: 98 },
    { id: 'aaa', min: 94, max: 97 },
    { id: 'aa', min: 90, max: 94 },
    { id: 'a', min: 80, max: 90 },
    { id: 'bbb', min: 75, max: 80 },
    { id: 'bb', min: 70, max: 75 },
    { id: 'b', min: 60, max: 70 },
    { id: 'c', min: 50, max: 60 },
    { id: 'd', min: 0, max: 50 },
  ]

  const fc = ['app', 'ap', 'fcp', 'fc']
  const fs = ['fsdp', 'fsd', 'fsp', 'fs']

  return (
    <Card withBorder radius="md" className={classes.card}>
      <Spoiler maxHeight={120} showLabel="显示详细统计信息..." hideLabel="隐藏详细统计信息">
        <Grid gutter="xl">
          <Grid.Col span={6}>
            {rate.map((r, index) => {
              let count = calculateCount(scores, r.min, r.max);
              for (let i = 0; i < index; i++) {
                count += calculateCount(scores, rate[i].min, rate[i].max);
              }
              return (
                <Group key={r.id} mb="xs">
                  <Image
                    src={`/assets/maimai/music_rank/${r.id}.webp`}
                    h={rem(30)}
                    w="auto"
                  />
                  <Divider style={{ flex: 1 }} variant="dashed" />
                  <Text fz={rem(20)} style={{ lineHeight: rem(20) }}>
                    {count}
                    <span style={{ fontSize: rem(16), marginLeft: rem(4) }}>
                    / {totalCount}
                  </span>
                  </Text>
                </Group>
              )
            })}
          </Grid.Col>
          <Grid.Col span={6} h={30}>
            {fc.map((r, index) => (
              <Group key={r} mb="xs">
                <Image
                  src={`/assets/maimai/music_icon/${r}.webp`}
                  h={rem(30)}
                  w="auto"
                />
                <Divider style={{ flex: 1 }} variant="dashed" />
                <Text fz={rem(20)} style={{ lineHeight: rem(20) }}>
                  {scores.filter((score) => {
                    for (let i = 0; i < index + 1; i++) {
                      if (fc[i] === score.fc) return true;
                    }
                  }).length}
                  <span style={{ fontSize: rem(16), marginLeft: rem(4) }}>
                    / {totalCount}
                  </span>
                </Text>
              </Group>
            ))}
            {fs.map((r, index) => (
              <Group key={r} mb="xs">
                <Image
                  src={`/assets/maimai/music_icon/${r}.webp`}
                  h={rem(30)}
                  w="auto"
                />
                <Divider style={{ flex: 1 }} variant="dashed" />
                <Text fz={rem(20)} style={{ lineHeight: rem(20) }}>
                  {scores.filter((score) => {
                    for (let i = 0; i < index + 1; i++) {
                      if (fs[i] === score.fs) return true;
                    }
                  }).length}
                  <span style={{ fontSize: rem(16), marginLeft: rem(4) }}>
                    / {totalCount}
                  </span>
                </Text>
              </Group>
            ))}
          </Grid.Col>
        </Grid>
      </Spoiler>
    </Card>
  )
}