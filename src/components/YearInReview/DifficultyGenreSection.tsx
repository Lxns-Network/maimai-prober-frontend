import { Card, Text, Title, SimpleGrid, Stack, Group, Box, Center } from '@mantine/core';
import { BarChart, DonutChart } from '@mantine/charts';
import classes from './YearSummarySection.module.css';
import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";
import { useMemo } from 'react';

const difficultyColors: Record<string, string> = {
  '15': 'violet.7',
  '14+': 'violet.6',
  '14': 'pink.6',
  '13+': 'red.6',
  '13': 'orange.6',
  '12+': 'yellow.6',
  '12': 'lime.6',
  '11+': 'green.6',
  '11': 'teal.6',
  '10+': 'cyan.6',
  '10': 'blue.6',
};

const bpmColors = ['red.6', 'orange.6', 'yellow.6', 'lime.6', 'green.6', 'cyan.6', 'blue.6'];

const genreTranslations: Record<string, string> = {
  'maimai': '舞萌',
  'niconicoボーカロイド': 'niconico',
  'ゲームバラエティ': '其他游戏',
  'オンゲキCHUNITHM': '音击中二',
  '東方Project': '东方Project',
  'POPSアニメ': '流行 & 动漫',
}

export const DifficultyGenreSection = ({ data }: { data: YearInReviewProps }) => {
  const difficultyData = useMemo(() => {
    if (!data.difficulty_distribute) return [];
    
    return Object.entries(data.difficulty_distribute)
      .filter(([level]) => !level.endsWith('?'))
      .map(([level, count]) => ({
        level,
        count,
        color: difficultyColors[level] || 'gray.6',
      }))
      .sort((a, b) => {
        const aNum = parseFloat(a.level.replace('+', '.5'));
        const bNum = parseFloat(b.level.replace('+', '.5'));
        return bNum - aNum;
      });
  }, [data]);

  const genreData = useMemo(() => {
    if (!data.most_played_genres) return [];
    
    return Object.entries(data.most_played_genres)
      .map(([name, value], index) => ({
        name,
        value,
        color: `${['blue', 'pink', 'grape', 'violet', 'indigo', 'cyan'][index % 6]}.6`,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [data]);

  const bpmData = useMemo(() => {
    if (!data.most_played_bpm_ranges) return [];
    
    const order = ['0-99', '100-129', '130-159', '160-179', '180-199', '200-219', '220+'];
    return order
      .filter(range => data.most_played_bpm_ranges![range])
      .map((range, index) => ({
        range,
        count: data.most_played_bpm_ranges![range],
        color: bpmColors[index % bpmColors.length],
      }));
  }, [data]);

  if (!difficultyData.length && !genreData.length && !bpmData.length) return null;

  return (
    <Stack gap="lg">
      {difficultyData.length > 0 && (
        <Card className={classes.card} shadow="md" withBorder radius="md">
          <div>
            <Text className={classes.description}>
              难度分布
            </Text>
            <Title order={3} className={classes.title}>
              你最常挑战的难度是？
            </Title>
          </div>
          <BarChart
            h={280}
            data={difficultyData}
            dataKey="level"
            series={[{ name: 'count', label: '数量', color: 'violet.6' }]}
            withLegend={false}
            withTooltip
            mt="md"
          />
        </Card>
      )}

      {(genreData.length > 0 || bpmData.length > 0) && (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {genreData.length > 0 && (
            <Card className={classes.card} shadow="md" withBorder radius="md">
              <div>
                <Text className={classes.description}>
                  曲目类型偏好
                </Text>
                <Title order={3} className={classes.title}>
                  {genreTranslations[genreData[0]?.name] || genreData[0]?.name} 是你的最爱！
                </Title>
              </div>
              <Group align="center" h="100%" wrap="nowrap">
                <Center style={{ flex: '0 0 auto' }}>
                  <DonutChart
                    data={genreData}
                    withTooltip
                    h={200}
                  />
                </Center>
                <Stack gap="xs" style={{ flex: 1 }} justify="center">
                  {genreData.map((genre, index) => (
                    <Group key={index} gap="xs">
                      <Box
                        w={16}
                        h={16}
                        style={{
                          backgroundColor: `var(--mantine-color-${genre.color.replace('.', '-')})`,
                          borderRadius: '4px',
                          flexShrink: 0,
                        }}
                      />
                      <Text size="sm" style={{ flex: 1 }}>{genreTranslations[genre.name] || genre.name}</Text>
                      <Text size="sm" c="dimmed">{genre.value}</Text>
                    </Group>
                  ))}
                </Stack>
              </Group>
            </Card>
          )}

          {bpmData.length > 0 && (
            <Card className={classes.card} shadow="md" withBorder radius="md">
              <div>
                <Text className={classes.description}>
                  BPM 偏好
                </Text>
                <Title order={3} className={classes.title}>
                  你喜欢什么速度的曲子？
                </Title>
              </div>
              <BarChart
                h={280}
                data={bpmData}
                dataKey="range"
                series={[{ name: 'count', label: '数量', color: 'cyan.6' }]}
                withLegend={false}
                withTooltip
                mt="md"
              />
            </Card>
          )}
        </SimpleGrid>
      )}
    </Stack>
  );
};
