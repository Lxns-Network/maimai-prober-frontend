import { Card, Flex, Group, Text } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChunithmRatingTrendProps {
  rating: number;
  bests_rating: number;
  selections: number;
  recents_rating: number;
  date: string | number;
}

const RatingTrendChart = ({ trend }: { trend: ChunithmRatingTrendProps[] }) => {
  trend = trend.map((item) => {
    return {
      ...item,
      date: new Date(item.date).getTime(),
    }
  })

  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={trend}>
        <defs>
          <linearGradient id="rating" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="date" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(value) => new Date(value).toLocaleDateString('zh-CN', {
          month: "numeric",
          day: "numeric",
        })} fontSize={14} />
        <YAxis width={40} domain={([dataMin, dataMax]) => {
          return [Math.floor(dataMin), Math.floor(dataMax)];
        }} fontSize={14} />
        <CartesianGrid strokeDasharray="3 3" />
        <Tooltip content={(props) => {
          if (!props.active || !props.payload || props.payload.length < 1) return null;
          const payload = props.payload[0].payload;
          return (
            <Card p="xs" withBorder fz="sm">
              <Text>{new Date(payload.date).toLocaleDateString()}</Text>
              <Text c="#8884d8">Rating: {payload.rating}</Text>
              <Group gap="xs">
                <Text c="#FD7E14">Best 30: {payload.bests_rating}</Text>
                <Text>Selection 10: {payload.selections}</Text>
                <Text c="#228BE6">Recent 10 (MAX): {payload.recents_rating}</Text>
              </Group>
            </Card>
          )
        }} />
        <Area dataKey="total" stroke="#8884d8" fillOpacity={1} fill="url(#rating)" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export const ChunithmRatingTrend = ({ trend }: { trend: ChunithmRatingTrendProps[] | null }) => {
  if (!trend || trend.length < 2) {
    return (
      <Flex gap="xs" align="center" direction="column" c="dimmed">
        <IconDatabaseOff size={64} stroke={1.5} />
        <Text fz="sm">历史记录不足，无法生成图表</Text>
      </Flex>
    )
  }

  return <>
    <RatingTrendChart trend={trend} />
    <Text fz="xs" c="dimmed">※ Recent 10 均为 Best #1 曲目，最终结果为理论不推分最高 Rating。</Text>
    <Text fz="xs" c="dimmed">※ 该数据由历史同步成绩推出，而非玩家的历史 Rating，结果仅供参考。</Text>
  </>
}