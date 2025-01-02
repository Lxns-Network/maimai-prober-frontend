import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";
import tags from "@/data/tags.json";
import { BarChart, RadarChart } from "@mantine/charts";
import { useEffect, useState } from "react";
import WordCloud from 'wordcloud';
import { Center, SegmentedControl, SimpleGrid, Stack } from "@mantine/core";
import useShellViewportSize from "@/hooks/useShellViewportSize.ts";
import { useInViewport } from "@mantine/hooks";

interface TagProps {
  id: number;
  localized_name: {
    [key: string]: string;
  },
  localized_description: {
    [key: string]: string;
  },
  group_id: number;
}

interface TagGroupProps {
  id: number;
  localized_name: {
    [key: string]: string;
  },
  color: string;
}

interface TagsProps {
  tags: TagProps[];
  tagGroups: TagGroupProps[];
}

const WordCloudSection = ({ data }: { data: { name: string, value: number }[] }) => {
  const { width } = useShellViewportSize();
  const [containerWidth, setContainerWidth] = useState(400);

  useEffect(() => {
    if (width > 432) {
      setContainerWidth(400);
    } else {
      setContainerWidth(width - 32);
    }
  }, [width]);

  useEffect(() => {
    const container = document.getElementById('word-cloud-container');

    const maxValue = Math.max(...data.map((word) => word.value));

    if (container) {
      WordCloud(container, {
        list: data.map((word) => [word.name, word.value / maxValue * 100]),
        gridSize: 8,
        backgroundColor: 'transparent',
      });
    }
  }, [data]);

  return (
    <div id="word-cloud-container" style={{ width: `${containerWidth}px`, height: '250px' }}>
      {data.map((word) => (
        <span key={word.name} data-word-id={word.name}>
          {word.name}
        </span>
      ))}
    </div>
  );
};

export const TagRadarSection = ({ data }: { data: YearInReviewProps }) => {
  const [tagGroup, setTagGroup] = useState<number>(0);

  const totalTagData: Record<string, number> = {};
  const groupTagData: Record<string, Record<string, number>> = {};

  Object.entries(data.player_tags).forEach(([tagId, count]) => {
    (tags as TagsProps).tags.forEach((tag) => {
      if (tag.id === Number(tagId)) {
        totalTagData[tag.localized_name["zh-Hans"]] = count;
        if (!groupTagData[tag.group_id]) {
          groupTagData[tag.group_id] = {};
        }
        groupTagData[tag.group_id][tag.localized_name["zh-Hans"]] = count;
      }
    });
  });

  const wordCloudData = Object.entries(totalTagData).map(([key, value]) => ({ name: key, value: value }));

  const { ref, inViewport } = useInViewport();

  useEffect(() => {
    // 防止动画导致 SegmentedControl 无法正常渲染
    if (!inViewport) return;

    setTimeout(() => setTagGroup((tags as TagsProps).tagGroups[0].id), 200);
  }, [inViewport]);

  return (
    <>
      <Center mb={16} ref={ref}>
        <SegmentedControl
          data={(tags as TagsProps).tagGroups.map((group) => ({
            value: String(group.id),
            label: group.localized_name["zh-Hans"],
          }))}
          value={String(tagGroup)}
          onChange={(value) => setTagGroup(Number(value))}
        />
      </Center>
      <SimpleGrid cols={{ xs: 1, md: 2 }} spacing="lg">
        <Stack>
          {tagGroup === 2 ? (
            <BarChart
              h={300}
              data={Object.entries(groupTagData[tagGroup]).map(([key, value]) => ({ key, value }))}
              dataKey="key"
              series={[
                { name: 'value', color: 'blue.6' },
              ]}
              barProps={{ barSize: 50 }}
              gridAxis="none"
              withYAxis={false}
              withTooltip={false}
            />
          ) : (
            <RadarChart
              h={300}
              data={Object.entries(groupTagData[tagGroup || 1]).map(([key, value]) => ({ tag: key, weight: value })).slice(0, 6)}
              dataKey="tag"
              series={[{ name: 'weight', color: 'blue.4' }]}
            />
          )}
        </Stack>
        <Center>
          <WordCloudSection data={wordCloudData} />
        </Center>
      </SimpleGrid>
    </>
  )
}