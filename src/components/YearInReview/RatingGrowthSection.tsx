import { Card, Text, Title, Progress, Stack, Group, Badge, SimpleGrid, Image, Box, Center } from '@mantine/core';
import { IconTrendingUp, IconTrendingDown, IconArrowRight, IconArrowDown } from '@tabler/icons-react';
import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";
import { useMemo } from 'react';
import { ChunithmBestsProps, MaimaiBestsProps } from '@/types/score';
import { ASSET_URL } from "@/main.tsx";
import { useMediaQuery } from '@mantine/hooks';

export const RatingGrowthSection = ({ data }: { data: YearInReviewProps }) => {
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  const { growth, topSongs } = useMemo(() => {
    if (!data.rating_growth) {
      return { growth: null, topSongs: null };
    }
    
    const { earliest_bests, latest_bests } = data.rating_growth;
    
    if (!earliest_bests || !latest_bests) {
      return { growth: null, topSongs: null };
    }
    
    const calculateRating = (bests: MaimaiBestsProps | ChunithmBestsProps) => {
      if (!bests || typeof bests !== 'object') return 0;

      if ("bests" in bests) {
        const b30Sum = bests.bests.reduce((acc, score) => acc + (score.rating || 0), 0);
        if (data.year === 2025) {
          if (bests.new_bests.length === 0) {
            return (Math.floor((b30Sum + bests.bests[0].rating * 10) / 40 * 100) / 100 || 0).toFixed(2);
          }
        }
        const n20Sum = bests.new_bests.reduce((acc, score) => acc + (score.rating || 0), 0);
        return (Math.floor((b30Sum + n20Sum) / 50 * 100) / 100 || 0).toFixed(2);
      }
      
      if ("standard" in bests && "dx" in bests) {
        return bests.standard_total + bests.dx_total;
      }
      
      return 0;
    };
    
    const getTopSongs = (bests: MaimaiBestsProps | ChunithmBestsProps) => {
      if (!bests) return [];

      if ("bests" in bests) {
        return bests.bests
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 6);
      }
      
      if ("standard" in bests && "dx" in bests) {
        return [...(bests.standard || []), ...(bests.dx || [])]
          .sort((a, b) => (b.dx_rating || 0) - (a.dx_rating || 0))
          .slice(0, 6);
      }

      return [];
    };
    
    const old_rating = calculateRating(earliest_bests);
    const new_rating = calculateRating(latest_bests);
    
    const diff = Number(new_rating) - Number(old_rating);
    const percentage = Number(old_rating) > 0 ? (diff / Number(old_rating)) * 100 : 0;
    
    return {
      growth: {
        old: old_rating,
        new: new_rating,
        diff: diff,
        percentage: Math.abs(percentage),
        isPositive: diff >= 0,
      },
      topSongs: {
        earliest: getTopSongs(earliest_bests),
        latest: getTopSongs(latest_bests),
      },
    };
  }, [data]);

  if (!growth) return null;

  return (
    <Card shadow="md" withBorder radius="md" p="xl">
      <Stack gap="lg">
        <div>
          <Text style={{ opacity: 0.7, fontWeight: 700, textTransform: 'uppercase' }}>
            能力成长轨迹
          </Text>
          <Title order={3} fw={900} style={{ fontSize: '32px', marginTop: 'var(--mantine-spacing-xs)' }}>
            {data.year} 年，你的 Rating {growth.isPositive ? '提升' : '下降'}了 {data.game === 'maimai' ? Math.abs(growth.diff).toFixed(0) : Math.abs(growth.diff).toFixed(2)}！
          </Title>
          {data.game === "chunithm" && (
            <Text mt="xs" size="xs" c="dimmed">
              ※ Recent 10 均为 Best #1 曲目，最终结果为理论不推分最高 Rating。
            </Text>
          )}
        </div>
        {topSongs && (
          <Box>
            <Group justify="center" align="center" gap={isMobile ? 'md' : 'xl'} wrap={isMobile ? 'wrap' : 'nowrap'}>
              <Box style={{ flex: isMobile ? '1 1 100%' : 1 }}>
                <Text size="xs" c="dimmed" ta="center" mb="xs">年初 Top 6</Text>
                <SimpleGrid cols={3} spacing="xs">
                  {topSongs.earliest.map((song, index) => (
                    <Image
                      key={`earliest-${index}`}
                      src={`${ASSET_URL}/${data.game}/jacket/${song.id}.png!webp`}
                      radius="sm"
                    />
                  ))}
                </SimpleGrid>
              </Box>
              
              <Center style={{ flex: isMobile ? '1 1 100%' : 'none' }}>
                {isMobile ? (
                  <IconArrowDown size={32} color="gray" />
                ) : (
                  <IconArrowRight size={32} color="gray" />
                )}
              </Center>
              
              <Box style={{ flex: isMobile ? '1 1 100%' : 1 }}>
                <Text size="xs" c="dimmed" ta="center" mb="xs">年末 Top 6</Text>
                <SimpleGrid cols={3} spacing="xs">
                  {topSongs.latest.map((song, index) => (
                    <Image
                      key={`latest-${index}`}
                      src={`${ASSET_URL}/${data.game}/jacket/${song.id}.png!webp`}
                      radius="sm"
                    />
                  ))}
                </SimpleGrid>
              </Box>
            </Group>
          </Box>
        )}

        <Group justify="space-between">
          <div>
            <Text size="sm" c="dimmed">年初 Rating</Text>
            <Text size="xl" fw={700}>{growth.old}</Text>
          </div>
          
          <Badge
            size="xl"
            leftSection={growth.isPositive ? <IconTrendingUp size={18} /> : <IconTrendingDown size={18} />}
            color={growth.isPositive ? 'teal' : 'red'}
            variant="light"
          >
            {growth.isPositive ? '+' : ''}{data.game === 'maimai' ? growth.diff.toFixed(0) : growth.diff.toFixed(2)}
          </Badge>
          
          <div style={{ textAlign: 'right' }}>
            <Text size="sm" c="dimmed">年末 Rating</Text>
            <Text size="xl" fw={700}>{growth.new}</Text>
          </div>
        </Group>
        
        <div>
          <Group justify="space-between" mb="xs">
            <Text size="sm" c="dimmed">成长幅度</Text>
            <Text size="sm" c="dimmed">{growth.percentage.toFixed(1)}%</Text>
          </Group>
          <Progress
            value={Math.min(growth.percentage, 100)}
            size="lg"
            radius="xl"
            color={growth.isPositive ? 'teal' : 'red'}
          />
        </div>
      </Stack>
    </Card>
  );
};
