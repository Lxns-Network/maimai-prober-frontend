import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";
import { BarChart, BubbleChart } from "@mantine/charts";
import { Space } from "@mantine/core";

export const UploadRhythmSection = ({ data }: { data: YearInReviewProps }) => {
  return (
    <>
      <BarChart
        h={300}
        data={Object.entries(data.player_monthly_uploads).map(([key, value]) => ({ key: `${key} 月`, value }))}
        dataKey="key"
        series={[
          { name: 'value', label: '次数', color: 'blue.6' },
        ]}
        unit=" 次"
        barProps={{ barSize: 50 }}
      />
      <Space h={32} />
      <BubbleChart
        h={60}
        data={Object.entries(data.player_hourly_uploads).map(([key, value]) => ({
          hour: key,
          index: 1,
          value
        }))}
        range={[16, 225]}
        label="上传量/时"
        color="lime.6"
        dataKey={{ x: 'hour', y: 'index', z: 'value' }}
      />
    </>
  )
}