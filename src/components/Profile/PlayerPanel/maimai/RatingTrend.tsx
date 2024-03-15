import { Card, Flex, Group, Text } from "@mantine/core";
import { IconDatabaseOff} from "@tabler/icons-react";
import { Area, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface RatingTrendProps {
  total: number;
  standard_total: number;
  dx_total: number;
  date: string | number;
}

const RatingTrendChart = ({ trend }: { trend: RatingTrendProps[] }) => {
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
          <linearGradient id="dx_rating" x1="0" y1="0" x2="0" y2="1">
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
              <Text c="#8884d8">DX Rating: {payload.total}</Text>
              <Group gap="xs">
                <Text c="#FD7E14">B35: {payload.standard_total}</Text>
                <Text c="#228BE6">B15: {payload.dx_total}</Text>
              </Group>
            </Card>
          )
        }} />
        <Area dataKey="total" stroke="#8884d8" fillOpacity={1} fill="url(#dx_rating)" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export const RatingTrend = ({ trend }: { trend: RatingTrendProps[] | null }) => {
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
    <Text fz="xs" c="dimmed">※ 该数据由历史同步成绩推出，而非玩家的历史 DX Rating，结果仅供参考。</Text>
  </>
}