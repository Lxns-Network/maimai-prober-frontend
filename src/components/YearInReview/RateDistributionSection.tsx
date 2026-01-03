import { Card, Text, Title, SimpleGrid } from '@mantine/core';
import { BarChart } from '@mantine/charts';
import classes from './YearSummarySection.module.css';
import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";
import { useMemo } from 'react';

const rateColors: Record<string, string> = {
  'sssp': 'violet.6',
  'sss': 'grape.6',
  'ssp': 'pink.6',
  'ss': 'red.6',
  'sp': 'orange.6',
  's': 'yellow.6',
  'aaa': 'lime.6',
  'aa': 'green.6',
  'a': 'teal.6',
  'bbb': 'cyan.6',
  'bb': 'blue.6',
  'b': 'indigo.6',
  'c': 'gray.6',
  'd': 'gray.7',
};

const fcColors: Record<string, string> = {
  'app': 'violet.6',
  'ap': 'pink.6',
  'fcp': 'yellow.6',
  'fc': 'blue.6',
  'alljusticecritical': 'violet.6',
  'alljustice': 'pink.6',
  'fullcombo': 'blue.6',
};

export const RateDistributionSection = ({ data }: { data: YearInReviewProps }) => {
  const rateData = useMemo(() => {
    const distribute = data.game === 'maimai' ? data.rate_distribute : data.rank_distribute;
    if (!distribute) return [];
    
    return Object.entries(distribute)
      .map(([rate, count]) => ({
        rate: rate.toUpperCase(),
        count,
        color: rateColors[rate.toLowerCase()] || 'gray.6',
      }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const fcData = useMemo(() => {
    if (!data.full_combo_distribute) return [];
    
    return Object.entries(data.full_combo_distribute)
      .map(([type, count]) => ({
        type: type === 'alljusticecritical' ? 'AJC' : 
              type === 'alljustice' ? 'AJ' : 
              type === 'fullcombo' ? 'FC' :
              type.toUpperCase(),
        count,
        color: fcColors[type.toLowerCase()] || 'gray.6',
      }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  if (!rateData.length && !fcData.length) return null;

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      {rateData.length > 0 && (
        <Card className={classes.card} shadow="md" withBorder radius="md">
          <div>
            <Text className={classes.description}>
              {data.game === 'maimai' ? '达成率' : '评级'}分布
            </Text>
            <Title order={3} className={classes.title}>
              你的{data.game === 'maimai' ? '达成率' : '评级'}都在什么水平？
            </Title>
          </div>
          <BarChart
            h={300}
            data={rateData}
            dataKey="rate"
            series={[{ name: 'count', label: '数量', color: 'blue.6' }]}
            withLegend={false}
            withTooltip
            mt="md"
          />
        </Card>
      )}

      {fcData.length > 0 && (
        <Card className={classes.card} shadow="md" withBorder radius="md">
          <div>
            <Text className={classes.description}>
              全连分布
            </Text>
            <Title order={3} className={classes.title}>
              {fcData[0]?.count || 0} 次 {fcData[0]?.type || ''}，你的全连能力如何？
            </Title>
          </div>
          <BarChart
            h={300}
            data={fcData}
            dataKey="type"
            series={[{ name: 'count', label: '数量', color: 'pink.6' }]}
            withLegend={false}
            withTooltip
            mt="md"
          />
        </Card>
      )}
    </SimpleGrid>
  );
};
