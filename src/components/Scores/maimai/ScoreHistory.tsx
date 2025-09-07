import { Card, Flex, Text } from "@mantine/core";
import { IconDatabaseOff } from "@tabler/icons-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo } from "react";
import { MaimaiScoreProps } from "@/types/score";

const ScoreHistoryChart = ({ scores }: { scores: MaimaiScoreProps[] }) => {
  const ticks = useMemo(() => {
    const ticks = [80, 90, 94, 97, 98, 99, 99.5, 100.5, 101];
    let min = 101;
    scores.forEach((score) => {
      if (score.achievements < min) {
        min = score.achievements;
      }
    });
    return ticks.filter((tick) => tick >= Math.floor(min));
  }, [scores]);

  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={scores} margin={{ top: 5, right: 5, bottom: 5, left: 15 }}>
        <defs>
          <linearGradient id="achievements" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <XAxis dataKey="upload_time" tickFormatter={(value) => new Date(value).toLocaleDateString('zh-CN', {
          month: "numeric",
          day: "numeric",
        })} fontSize={14} />
        <YAxis width="auto" domain={([dataMin, dataMax]) => {
          return [Math.max(Math.floor(dataMin) - 1, 80), Math.min(Math.floor(dataMax) + 1, 101)]
        }} ticks={ticks} unit="%" fontSize={14} />
        <CartesianGrid strokeDasharray="3 3" />
        <Tooltip content={(props) => {
          if (!props.active || !props.payload || props.payload.length < 1) return null;
          const payload = props.payload[0].payload;
          return (
            <Card p="xs" withBorder fz="sm">
              <Text>{new Date(payload.upload_time).toLocaleDateString()}</Text>
              <Text c="#8884d8">{payload.achievements}%</Text>
              <Text>DX Rating: {parseInt(payload.dx_rating)}</Text>
            </Card>
          )
        }} />
        <Area type="monotone" dataKey="achievements" stroke="#8884d8" fillOpacity={1} fill="url(#achievements)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export const MaimaiScoreHistory = ({ scores, minAchievements }: {
  scores: MaimaiScoreProps[],
  minAchievements: number,
}) => {
  const scoresLength = scores.length;

  if (scores) {
    scores = scores.filter((score) => {
      return score.achievements >= minAchievements;
    });
  }

  if (!scores || scores.length < 2) {
    return (
      <Flex gap="xs" align="center" direction="column" c="dimmed">
        <IconDatabaseOff size={64} stroke={1.5} />
        <Text fz="sm">游玩记录不足，无法生成图表</Text>
      </Flex>
    )
  }

  return <>
    <ScoreHistoryChart scores={scores} />
    {scores.length < scoresLength && <Text fz="xs" c="dimmed">
      ※ 为了方便观察达成率变化，图表过滤了 {scoresLength - scores.length} 条达成率低于 {minAchievements}% 的成绩。
    </Text>}
  </>
}