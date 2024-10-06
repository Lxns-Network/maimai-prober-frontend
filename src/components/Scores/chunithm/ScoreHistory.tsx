import { Card, Flex, Text, NumberFormatter } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChunithmScoreProps } from "@/types/score";

const ScoreHistoryChart = ({ scores }: { scores: ChunithmScoreProps[] }) => {
  let ticks = [800000, 900000, 925000, 950000, 975000, 990000, 1000000, 1005000, 1007500, 1009000, 1010000];
  let min = 1010000;
  scores.forEach((score) => {
    if (score.score < min) {
      min = score.score;
    }
  });
  ticks = ticks.filter((tick) => {
    return tick >= Math.floor(min);
  });

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={scores}>
        <defs>
          <linearGradient id="score" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="upload_time" tickFormatter={(value) => new Date(value).toLocaleDateString('zh-CN', {
          month: "numeric",
          day: "numeric",
        })} fontSize={14} />
        <YAxis width={40} domain={([dataMin, dataMax]) => {
          return [Math.max(Math.floor(dataMin) - 10000, 800000), Math.min(Math.floor(dataMax) + 10000, 1010000)]
        }} ticks={ticks} fontSize={14} tickFormatter={
          (value) => Math.floor(value / 1000) + "k"
        } />
        <CartesianGrid strokeDasharray="3 3" />
        <Tooltip content={(props) => {
          if (!props.active || !props.payload || props.payload.length < 1) return null;
          const payload = props.payload[0].payload;
          return (
            <Card p="xs" withBorder fz="sm">
              <Text>{new Date(payload.upload_time).toLocaleDateString()}</Text>
              <Text c="#8884d8"><NumberFormatter value={payload.score || 0} thousandSeparator /></Text>
              <Text>Rating: {Math.floor(payload.rating * 100) / 100}</Text>
            </Card>
          )
        }} />
        <Area type="monotone" dataKey="score" stroke="#8884d8" fillOpacity={1} fill="url(#score)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export const ChunithmScoreHistory = ({ scores, minScore }: {
  scores: ChunithmScoreProps[],
  minScore: number,
}) => {
  const scoresLength = scores.length;

  if (scores) {
    scores = scores.filter((score) => {
      return score.score >= minScore;
    });
  }

  if (!scores || scores.length < 2) {
    return (
      <Flex gap="xs" align="center" direction="column" c="dimmed">
        <IconDatabaseOff size={64} stroke={1.5} />
        <Text fz="sm">历史记录不足，无法生成图表</Text>
      </Flex>
    )
  }

  return <>
    <ScoreHistoryChart scores={scores} />
    {scores.length < scoresLength && <Text fz="xs" c="dimmed">
      ※ 为了方便观察分数变化，图表过滤了 {scoresLength - scores.length} 条分数低于 <NumberFormatter value={minScore} thousandSeparator /> 的成绩。
    </Text>}
  </>
}