import { MaimaiScoreProps } from "./Score.tsx";
import { Card, Flex, Text } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const ScoreHistoryChart = ({ scores }: { scores: MaimaiScoreProps[] }) => {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={scores} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="dx_rating" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="upload_time" tickFormatter={(value) => new Date(value).toLocaleDateString('zh-CN', {
          month: "numeric",
          day: "numeric",
        })} />
        <YAxis width={40} domain={([dataMin, dataMax]) => {
          return [Math.floor(dataMin) - 10, Math.floor(dataMax) + 10];
        }} />
        <CartesianGrid strokeDasharray="3 3" />
        <Tooltip content={(props) => {
          if (!props.active || !props.payload || props.payload.length < 1) return null;
          const payload = props.payload[0].payload;
          return (
            <Card p="xs" withBorder fz="sm">
              <Text>{new Date(payload.upload_time).toLocaleDateString()}</Text>
              <Text c="#8884d8">DX Rating: {parseInt(payload.dx_rating)}</Text>
              <Text>{payload.achievements}%</Text>
            </Card>
          )
        }} />
        <Area type="monotone" dataKey="dx_rating" stroke="#8884d8" fillOpacity={1} fill="url(#dx_rating)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export const ScoreHistory = ({ scores }: { scores: MaimaiScoreProps[] }) => {
  if (!scores || scores.length < 2) {
    return (
      <Flex gap="xs" align="center" direction="column" c="dimmed">
        <IconDatabaseOff size={64} />
        <Text fz="sm">历史记录不足，无法生成图表</Text>
      </Flex>
    )
  }

  return <ScoreHistoryChart scores={scores} />
}