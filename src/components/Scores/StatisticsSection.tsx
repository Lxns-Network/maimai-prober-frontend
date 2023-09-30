import { Card, createStyles, Grid, Image, rem, Text, Group, Spoiler} from "@mantine/core";
import { ScoreProps } from "./Score";

const useStyles = createStyles((theme) => ({
  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },
}));

function calculateCount(scores: ScoreProps[], minAchievements: number, maxAchievements: number) {
  return scores.filter((score) => score.achievements >= minAchievements && score.achievements < maxAchievements).length;
}
export const StatisticsSection = ({ scores }: { scores: ScoreProps[] }) => {
  const { classes } = useStyles();

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
            {rate.map((r) => {
              const count = calculateCount(scores, r.min, r.max);
              return (
                <Group key={r.id} position="apart" mb="xs">
                  <Image
                    src={`https://maimai.wahlap.com/maimai-mobile/img/music_icon_${r.id}.png?ver=1.35`}
                    height={rem(30)}
                    width="auto"
                  />
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
            {fc.map((r) => (
              <Group key={r} position="apart" mb="xs">
                <Image
                  src={`https://maimai.wahlap.com/maimai-mobile/img/music_icon_${r}.png?ver=1.35`}
                  height={rem(30)}
                  width="auto"
                />
                <Text fz={rem(20)} style={{ lineHeight: rem(20) }}>
                  {scores.filter((score) => score.fc === r).length}
                  <span style={{ fontSize: rem(16), marginLeft: rem(4) }}>
                  / {totalCount}
                </span>
                </Text>
              </Group>
            ))}
            {fs.map((r) => (
              <Group key={r} position="apart" mb="xs">
                <Image
                  src={`https://maimai.wahlap.com/maimai-mobile/img/music_icon_${r}.png?ver=1.35`}
                  height={rem(30)}
                  width="auto"
                />
                <Text fz={rem(20)} style={{ lineHeight: rem(20) }}>
                  {scores.filter((score) => score.fs === r).length}
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